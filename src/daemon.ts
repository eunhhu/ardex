import { spawn } from "node:child_process";
import { closeSync, openSync } from "node:fs";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { readConfig, updateConfig, writeConfig, type ArdexConfig } from "./config.ts";
import { openDatabase, migrateDatabase } from "./db.ts";
import { handleDashboardRequest } from "./dashboard.ts";
import { daemonUnavailable, internalError } from "./errors.ts";
import { getArdexPaths, ensureArdexHome, type ArdexPaths } from "./paths.ts";
import { VERSION } from "./output.ts";

export type DaemonHealth = {
  daemon: "running";
  pid: number;
  url: string;
  dbPath: string;
  version: string;
  uptimeSeconds: number;
};

const DEFAULT_HOST = "127.0.0.1";

export async function initializeStorage(paths: ArdexPaths = getArdexPaths()): Promise<{ dbPath: string; schemaVersion: number }> {
  await ensureArdexHome(paths);
  const db = openDatabase(paths);
  try {
    const schemaVersion = migrateDatabase(db);
    await writeConfig(await readConfig(paths), paths);
    return { dbPath: paths.dbPath, schemaVersion };
  } finally {
    db.close();
  }
}

export async function checkDaemon(paths: ArdexPaths = getArdexPaths()): Promise<DaemonHealth | null> {
  const config = await readConfig(paths);
  try {
    const response = await fetchWithTimeout(`${config.serverUrl}/health`, 500);
    if (!response.ok) {
      return null;
    }
    const envelope = (await response.json()) as { ok?: boolean; data?: DaemonHealth };
    return envelope.ok === true && envelope.data !== undefined ? envelope.data : null;
  } catch {
    return null;
  }
}

export async function startDaemon(paths: ArdexPaths = getArdexPaths()): Promise<{ health: DaemonHealth; reused: boolean }> {
  await initializeStorage(paths);

  const current = await checkDaemon(paths);
  if (current !== null) {
    if (current.version === VERSION) {
      return { health: current, reused: true };
    }
    await stopDaemon(paths);
  }

  const config = await readConfig(paths);
  const port = await findAvailablePort(config.port, config.host);
  await writeConfig({ ...config, port, host: config.host || DEFAULT_HOST, pid: undefined }, paths);

  const entryPath = resolve(process.argv[1] ?? "index.ts");
  const logFd = openSync(paths.daemonLogPath, "a");
  const child = spawn(process.execPath, [entryPath, "daemon", "run"], {
    detached: true,
    stdio: ["ignore", logFd, logFd],
    env: {
      ...process.env,
      ARDEX_HOME: paths.home,
      ARDEX_PORT: String(port),
    },
  });
  child.unref();
  closeSync(logFd);

  const health = await waitForDaemon(paths, 3000);
  if (health === null) {
    throw internalError("Daemon did not become healthy after start.", {
      logPath: paths.daemonLogPath,
      pid: child.pid,
    });
  }

  await updateConfig((latest) => ({ ...latest, pid: child.pid, port, host: config.host || DEFAULT_HOST }), paths);
  return { health, reused: false };
}

export async function stopDaemon(paths: ArdexPaths = getArdexPaths()): Promise<{ stopped: boolean; pid?: number }> {
  const config = await readConfig(paths);
  const health = await checkDaemon(paths);
  const pid = config.pid ?? health?.pid;

  if (pid === undefined) {
    await updateConfig((latest) => ({ ...latest, pid: undefined }), paths);
    return { stopped: false };
  }

  try {
    process.kill(pid, "SIGTERM");
  } catch (error) {
    if (isErrno(error, "ESRCH")) {
      await updateConfig((latest) => ({ ...latest, pid: undefined }), paths);
      return { stopped: false, pid };
    }
    throw error;
  }

  const stopped = await waitUntilStopped(paths, 3000);
  await updateConfig((latest) => ({ ...latest, pid: undefined }), paths);
  return { stopped, pid };
}

export async function runDaemon(paths: ArdexPaths = getArdexPaths()): Promise<never> {
  await initializeStorage(paths);
  const config = await readConfig(paths);
  const port = Number(process.env["ARDEX_PORT"] ?? config.port);
  const host = config.host || DEFAULT_HOST;
  const startedAt = Date.now();

  const server = Bun.serve({
    hostname: host,
    port,
    async fetch(request) {
      const url = new URL(request.url);
      if (url.pathname === "/health") {
        return Response.json({
          ok: true,
          data: {
            daemon: "running",
            pid: process.pid,
            url: `http://${host}:${port}`,
            dbPath: paths.dbPath,
            version: VERSION,
            uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
          },
        });
      }

      const dashboardResponse = await handleDashboardRequest(request, paths);
      if (dashboardResponse !== null) {
        return dashboardResponse;
      }

      return Response.json(
        {
          ok: false,
          error: {
            code: "NOT_FOUND",
            message: "Endpoint not found.",
            details: { path: url.pathname },
          },
        },
        { status: 404 },
      );
    },
  });

  await updateConfig((latest) => ({ ...latest, host, port, pid: process.pid }), paths);

  const stop = async () => {
    server.stop();
    await updateConfig((latest) => ({ ...latest, pid: undefined }), paths);
    process.exit(0);
  };

  process.on("SIGTERM", () => {
    void stop();
  });
  process.on("SIGINT", () => {
    void stop();
  });

  return await new Promise<never>(() => {});
}

async function waitForDaemon(paths: ArdexPaths, timeoutMs: number): Promise<DaemonHealth | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const health = await checkDaemon(paths);
    if (health !== null) {
      return health;
    }
    await sleep(100);
  }
  return null;
}

async function waitUntilStopped(paths: ArdexPaths, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const health = await checkDaemon(paths);
    if (health === null) {
      return true;
    }
    await sleep(100);
  }
  return false;
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function findAvailablePort(startPort: number, host: string): Promise<number> {
  for (let port = startPort; port < startPort + 100; port += 1) {
    if (await canListen(port, host)) {
      return port;
    }
  }
  throw daemonUnavailable("No available Ardex daemon port found.", { startPort });
}

async function canListen(port: number, host: string): Promise<boolean> {
  return await new Promise((resolveAvailable) => {
    const server = createServer();
    server.once("error", () => {
      resolveAvailable(false);
    });
    server.once("listening", () => {
      server.close(() => resolveAvailable(true));
    });
    server.listen(port, host);
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function isErrno(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}
