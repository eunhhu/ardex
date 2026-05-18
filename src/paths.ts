import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export type ArdexPaths = {
  home: string;
  configPath: string;
  dbPath: string;
  installStatePath: string;
  logsDir: string;
  daemonLogPath: string;
  artifactsDir: string;
};

export function getArdexHome(): string {
  return process.env["ARDEX_HOME"] ?? join(homedir(), ".ardex");
}

export function getArdexPaths(home = getArdexHome()): ArdexPaths {
  return {
    home,
    configPath: join(home, "config.json"),
    dbPath: join(home, "ardex.db"),
    installStatePath: join(home, "install-state.json"),
    logsDir: join(home, "logs"),
    daemonLogPath: join(home, "logs", "daemon.log"),
    artifactsDir: join(home, "artifacts"),
  };
}

export async function ensureArdexHome(paths = getArdexPaths()): Promise<void> {
  await mkdir(paths.home, { recursive: true });
  await mkdir(paths.logsDir, { recursive: true });
  await mkdir(paths.artifactsDir, { recursive: true });
}
