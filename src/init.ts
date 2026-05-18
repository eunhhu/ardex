import { readFile, writeFile } from "node:fs/promises";
import { installCodexIntegration, type CodexInstallResult } from "./codex-integration.ts";
import { initializeStorage } from "./daemon.ts";
import { VERSION } from "./output.ts";
import { getArdexPaths, type ArdexPaths } from "./paths.ts";

export async function initializeArdex(paths?: ArdexPaths): Promise<{
  home: string;
  dbPath: string;
  installStatePath: string;
  schemaVersion: number;
  codex?: CodexInstallResult;
}>;
export async function initializeArdex(
  paths: ArdexPaths,
  options: { installCodex: true },
): Promise<{
  home: string;
  dbPath: string;
  installStatePath: string;
  schemaVersion: number;
  codex: CodexInstallResult;
}>;
export async function initializeArdex(
  paths: ArdexPaths = getArdexPaths(),
  options: { installCodex?: boolean } = {},
): Promise<{
  home: string;
  dbPath: string;
  installStatePath: string;
  schemaVersion: number;
  codex?: CodexInstallResult;
}> {
  const storage = await initializeStorage(paths);
  const codex = options.installCodex === true ? await installCodexIntegration(paths) : undefined;
  const installState = await readInstallState(paths);

  await writeFile(
    paths.installStatePath,
    `${JSON.stringify(
      {
        version: 1,
        packageVersion: VERSION,
        managedPaths: uniqueStrings([...(installState.managedPaths ?? []), ...(codex?.managedPaths ?? [])]),
        createdAt: installState.createdAt ?? new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  return {
    home: paths.home,
    dbPath: storage.dbPath,
    installStatePath: paths.installStatePath,
    schemaVersion: storage.schemaVersion,
    codex,
  };
}

export async function autoMigrateArdex(paths: ArdexPaths = getArdexPaths()): Promise<{
  home: string;
  dbPath: string;
  installStatePath: string;
  schemaVersion: number;
  codex: CodexInstallResult;
}> {
  return await initializeArdex(paths, { installCodex: true });
}

async function readInstallState(paths: ArdexPaths): Promise<{ managedPaths?: string[]; createdAt?: string }> {
  try {
    return JSON.parse(await readFile(paths.installStatePath, "utf8")) as { managedPaths?: string[]; createdAt?: string };
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return {};
    }
    throw error;
  }
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)].sort();
}
