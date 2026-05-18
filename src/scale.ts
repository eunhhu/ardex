import { readdir, readFile, stat } from "node:fs/promises";
import { extname, join, relative, resolve, sep } from "node:path";

export type ScaleScanInput = {
  projectPath: string;
  paths: string[];
  goal?: string;
};

export type FileScaleScan = {
  path: string;
  lineCount: number;
  byteCount: number;
  contentHash: string;
  mtimeMs: number;
  role: FileRole;
  severity: "info" | "warn" | "block";
  reason: string;
  recommendation: string;
  fileWeight: number;
};

export type ScaleScanResult = {
  estimate: {
    targetType: "directory" | "file" | "goal";
    targetId: string;
    weight: number;
    complexity: "low" | "medium" | "high" | "extreme";
    contextRisk: number;
    modularityRisk: number;
    recommendedAgent: "low" | "standard" | "strong" | "split";
    recommendedSplit: Record<string, unknown> | null;
    basis: string;
  };
  files: FileScaleScan[];
};

type FileRole = "source" | "test" | "config" | "generated" | "vendor" | "docs" | "unknown";

const ignoredSegments = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".next",
  ".nuxt",
  ".turbo",
  "target",
  "vendor",
]);

const ignoredFiles = new Set(["bun.lock", "package-lock.json", "pnpm-lock.yaml", "yarn.lock"]);

const sourceExtensions = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".rs",
  ".go",
  ".py",
  ".rb",
  ".java",
  ".kt",
  ".swift",
  ".c",
  ".cc",
  ".cpp",
  ".h",
  ".hpp",
  ".css",
  ".scss",
  ".html",
  ".svelte",
  ".vue",
]);

export async function scanScale(input: ScaleScanInput): Promise<ScaleScanResult> {
  const projectPath = resolve(input.projectPath);
  const targetPaths = input.paths.length === 0 ? [projectPath] : input.paths.map((item) => resolve(projectPath, item));
  const files: FileScaleScan[] = [];

  for (const targetPath of targetPaths) {
    await collectFiles(projectPath, targetPath, files);
  }

  files.sort((left, right) => left.path.localeCompare(right.path));

  const sourceFiles = files.filter((file) => file.role === "source");
  const touchedSourceFiles = sourceFiles.length;
  const touchedSourceLines = sourceFiles.reduce((sum, file) => sum + file.lineCount, 0);
  const maxSourceFileLines = sourceFiles.reduce((max, file) => Math.max(max, file.lineCount), 0);
  const unknownCount = files.filter((file) => file.role === "unknown").length;
  const crossModuleCount = new Set(sourceFiles.map((file) => file.path.split(sep)[0] ?? file.path)).size;
  const uiStateCount = inferUiStateCount(sourceFiles);
  const apiSurfaceCount = inferApiSurfaceCount(sourceFiles);
  const migrationCount = sourceFiles.filter((file) => /migration|schema/i.test(file.path)).length;

  const rawWeight =
    1 +
    Math.min(8, touchedSourceFiles * 1.2) +
    Math.min(8, touchedSourceLines / 400) +
    uiStateCount * 1.5 +
    apiSurfaceCount * 1.2 +
    migrationCount * 2 +
    unknownCount * 2 +
    crossModuleCount * 1.5;
  const weight = roundUpToHalf(rawWeight);
  const contextRisk = clamp(touchedSourceLines / 30000 + touchedSourceFiles / 20, 0, 1);
  const modularityRisk = clamp(maxSourceFileLines / 1500 + crossModuleCount / 8, 0, 1);
  const complexity = weight <= 3 ? "low" : weight <= 8 ? "medium" : weight <= 13 ? "high" : "extreme";
  const hasBlockingFinding = files.some((file) => file.severity === "block");
  const recommendedAgent =
    weight > 13 || contextRisk >= 0.9 || hasBlockingFinding
      ? "split"
      : weight <= 3 && contextRisk < 0.3
        ? "low"
        : weight <= 8 && contextRisk < 0.6
          ? "standard"
          : "strong";

  return {
    estimate: {
      targetType: input.goal !== undefined ? "goal" : targetPaths.length === 1 && files.length === 1 ? "file" : "directory",
      targetId: input.goal ?? targetPaths.map((item) => relative(projectPath, item) || ".").join(","),
      weight,
      complexity,
      contextRisk,
      modularityRisk,
      recommendedAgent,
      recommendedSplit:
        recommendedAgent === "split"
          ? {
              reason: weight > 13 ? "weight>13" : hasBlockingFinding ? "blocking-file-finding" : "context-risk",
              suggestedParts: Math.max(2, Math.ceil(weight / 8)),
            }
          : null,
      basis: [
        `files=${files.length}`,
        `sourceFiles=${touchedSourceFiles}`,
        `sourceLines=${touchedSourceLines}`,
        `maxSourceFileLines=${maxSourceFileLines}`,
        `uiStates=${uiStateCount}`,
        `apiSurfaces=${apiSurfaceCount}`,
        `unknowns=${unknownCount}`,
        `crossModules=${crossModuleCount}`,
      ].join("; "),
    },
    files,
  };
}

async function collectFiles(projectPath: string, targetPath: string, output: FileScaleScan[]): Promise<void> {
  const targetStat = await stat(targetPath);
  if (targetStat.isDirectory()) {
    const entries = await readdir(targetPath, { withFileTypes: true });
    for (const entry of entries) {
      const childPath = join(targetPath, entry.name);
      if (shouldIgnore(projectPath, childPath)) {
        continue;
      }
      if (entry.isDirectory()) {
        await collectFiles(projectPath, childPath, output);
      } else if (entry.isFile()) {
        output.push(await scanFile(projectPath, childPath));
      }
    }
    return;
  }

  if (targetStat.isFile() && !shouldIgnore(projectPath, targetPath)) {
    output.push(await scanFile(projectPath, targetPath));
  }
}

async function scanFile(projectPath: string, absolutePath: string): Promise<FileScaleScan> {
  const fileStat = await stat(absolutePath);
  const buffer = await readFile(absolutePath);
  const text = buffer.toString("utf8");
  const relativePath = relative(projectPath, absolutePath);
  const lineCount = text.length === 0 ? 0 : text.split(/\r\n|\r|\n/).length;
  const role = classifyFile(relativePath, text);
  const severity = classifySeverity(role, lineCount);
  const fileWeight = Math.max(role === "source" ? lineCount / 400 : 0, buffer.byteLength / 60000);

  return {
    path: relativePath,
    lineCount,
    byteCount: buffer.byteLength,
    contentHash: hashHex(buffer),
    mtimeMs: Math.floor(fileStat.mtimeMs),
    role,
    severity,
    reason: findingReason(role, severity, lineCount),
    recommendation: findingRecommendation(role, severity),
    fileWeight,
  };
}

function shouldIgnore(projectPath: string, absolutePath: string): boolean {
  const relativePath = relative(projectPath, absolutePath);
  const parts = relativePath.split(sep);
  const fileName = parts[parts.length - 1] ?? relativePath;
  return (
    parts.some((part) => ignoredSegments.has(part)) ||
    ignoredFiles.has(fileName) ||
    fileName.endsWith(".lock") ||
    fileName.endsWith(".min.js") ||
    fileName.endsWith(".map")
  );
}

function classifyFile(path: string, text: string): FileRole {
  const normalized = path.toLowerCase();
  const ext = extname(normalized);
  const parts = normalized.split(/[\\/]/);
  const fileName = parts[parts.length - 1] ?? normalized;

  if (parts.some((part) => part === "vendor" || part === "node_modules")) {
    return "vendor";
  }
  if (normalized.includes("generated") || text.slice(0, 500).includes("@generated")) {
    return "generated";
  }
  if (parts.some((part) => part.includes("test") || part.includes("spec") || part === "__tests__") || /\.(test|spec)\./.test(normalized)) {
    return "test";
  }
  if (parts[0] === "docs" || ext === ".md" || ext === ".mdx" || ext === ".txt") {
    return "docs";
  }
  if (fileName.startsWith(".") || /config|tsconfig|package\.json|eslint|prettier|vite|bunfig/.test(fileName)) {
    return "config";
  }
  if (sourceExtensions.has(ext)) {
    return "source";
  }
  return "unknown";
}

function classifySeverity(role: FileRole, lineCount: number): "info" | "warn" | "block" {
  if (role !== "source") {
    return "info";
  }
  if (lineCount > 1500) {
    return "block";
  }
  if (lineCount > 400) {
    return "warn";
  }
  return "info";
}

function findingReason(role: FileRole, severity: "info" | "warn" | "block", lineCount: number): string {
  if (role !== "source") {
    return `${role} file excluded from blocking scale checks`;
  }
  if (severity === "block") {
    return `source file has ${lineCount} lines, above 1500 line block threshold`;
  }
  if (severity === "warn") {
    return `source file has ${lineCount} lines, above 400 line healthy target`;
  }
  return `source file has ${lineCount} lines`;
}

function findingRecommendation(role: FileRole, severity: "info" | "warn" | "block"): string {
  if (role !== "source") {
    return "no action";
  }
  if (severity === "block") {
    return "split or waive before implementation";
  }
  if (severity === "warn") {
    return "watch size and consider split";
  }
  return "healthy";
}

function inferUiStateCount(files: FileScaleScan[]): number {
  return files.filter((file) => /\.(tsx|jsx|vue|svelte|css|scss|html)$/.test(file.path)).length;
}

function inferApiSurfaceCount(files: FileScaleScan[]): number {
  return files.filter((file) => /api|route|controller|handler|server/i.test(file.path)).length;
}

function roundUpToHalf(value: number): number {
  return Math.ceil(value * 2) / 2;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function hashHex(buffer: Uint8Array): string {
  const digest = new Bun.CryptoHasher("sha256").update(buffer).digest("hex");
  return digest.toString();
}
