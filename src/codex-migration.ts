import { Database } from "bun:sqlite";
import { readdir, readFile, realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, extname, join } from "node:path";
import { addProject, type Project } from "./repository.ts";

export type CodexMigrationResult = {
  codexHome: string;
  scannedFiles: number;
  discoveredPaths: number;
  registeredProjects: Project[];
  skipped: Array<{ path: string; reason: string }>;
};

const readableExtensions = new Set(["", ".json", ".jsonl", ".toml", ".txt", ".md"]);
const maxFileBytes = 2_000_000;
const maxDepth = 6;

export async function migrateCodexProjects(db: Database, inputRoot?: string): Promise<CodexMigrationResult> {
  const codexHome = inputRoot ?? process.env["ARDEX_CODEX_HOME"] ?? join(homedir(), ".codex");
  const candidatePaths = new Set<string>();
  const skipped: Array<{ path: string; reason: string }> = [];
  let scannedFiles = 0;

  for await (const filePath of walkFiles(codexHome, 0)) {
    const ext = extname(filePath).toLowerCase();
    if (!readableExtensions.has(ext)) {
      continue;
    }
    const fileStat = await stat(filePath);
    if (fileStat.size > maxFileBytes) {
      skipped.push({ path: filePath, reason: "too-large" });
      continue;
    }
    scannedFiles += 1;
    const text = await readFile(filePath, "utf8");
    for (const candidate of extractAbsolutePaths(text)) {
      candidatePaths.add(candidate);
    }
  }

  const registeredProjects: Project[] = [];
  for (const candidate of [...candidatePaths].sort()) {
    try {
      const candidateStat = await stat(candidate);
      const projectPath = candidateStat.isDirectory() ? candidate : dirname(candidate);
      const canonical = await realpath(projectPath);
      registeredProjects.push(await addProject(db, canonical));
    } catch {
      skipped.push({ path: candidate, reason: "missing-or-inaccessible" });
    }
  }

  return {
    codexHome,
    scannedFiles,
    discoveredPaths: candidatePaths.size,
    registeredProjects: dedupeProjects(registeredProjects),
    skipped,
  };
}

async function* walkFiles(root: string, depth: number): AsyncGenerator<string> {
  if (depth > maxDepth) {
    return;
  }
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const fullPath = join(root, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === ".git" || entry.name === "node_modules") {
        continue;
      }
      yield* walkFiles(fullPath, depth + 1);
    } else if (entry.isFile()) {
      yield fullPath;
    }
  }
}

function extractAbsolutePaths(text: string): string[] {
  const matches = text.match(/\/(?:Users|Volumes|private|tmp|var|home)\/[^"'\n\r\t<>]+/g) ?? [];
  return matches
    .map((match) => match.trim().replace(/[),.;\]}]+$/, ""))
    .filter((match) => match.length > 1 && !match.includes("/.codex/log"));
}

function dedupeProjects(projects: Project[]): Project[] {
  const byId = new Map<string, Project>();
  for (const project of projects) {
    byId.set(project.id, project);
  }
  return [...byId.values()].sort((left, right) => left.path.localeCompare(right.path));
}
