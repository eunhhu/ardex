import { readFile, rename, writeFile } from "node:fs/promises";
import { getArdexPaths, type ArdexPaths } from "./paths.ts";

export type ArdexConfig = {
  version: 1;
  host: string;
  port: number;
  dbPath: string;
  serverUrl: string;
  pid?: number;
  updatedAt: string;
};

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 17373;

export function defaultConfig(paths: ArdexPaths = getArdexPaths()): ArdexConfig {
  return {
    version: 1,
    host: DEFAULT_HOST,
    port: Number(process.env["ARDEX_PORT"] ?? DEFAULT_PORT),
    dbPath: paths.dbPath,
    serverUrl: `http://${DEFAULT_HOST}:${Number(process.env["ARDEX_PORT"] ?? DEFAULT_PORT)}`,
    updatedAt: new Date().toISOString(),
  };
}

export async function readConfig(paths: ArdexPaths = getArdexPaths()): Promise<ArdexConfig> {
  try {
    const raw = await readFile(paths.configPath, "utf8");
    const parsed = JSON.parse(raw) as Partial<ArdexConfig>;
    const fallback = defaultConfig(paths);
    const host = parsed.host ?? fallback.host;
    const port = parsed.port ?? fallback.port;
    return {
      version: 1,
      host,
      port,
      dbPath: parsed.dbPath ?? paths.dbPath,
      serverUrl: parsed.serverUrl ?? `http://${host}:${port}`,
      pid: parsed.pid,
      updatedAt: parsed.updatedAt ?? fallback.updatedAt,
    };
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return defaultConfig(paths);
    }
    throw error;
  }
}

export async function writeConfig(config: ArdexConfig, paths: ArdexPaths = getArdexPaths()): Promise<void> {
  const normalized = {
    ...config,
    serverUrl: `http://${config.host}:${config.port}`,
    updatedAt: new Date().toISOString(),
  };
  const tmpPath = `${paths.configPath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await writeFile(tmpPath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
  await rename(tmpPath, paths.configPath);
}

export async function updateConfig(
  updater: (config: ArdexConfig) => ArdexConfig,
  paths: ArdexPaths = getArdexPaths(),
): Promise<ArdexConfig> {
  const next = updater(await readConfig(paths));
  await writeConfig(next, paths);
  return next;
}
