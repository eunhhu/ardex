import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { ArdexPaths } from "./paths.ts";

export type CodexInstallResult = {
  skillPath: string;
  hooksConfigPath: string;
  hookScriptPaths: string[];
  managedPaths: string[];
};

type HooksConfig = {
  hooks?: Record<string, HookEntry[]>;
};

type HookEntry = {
  matcher?: string;
  hooks: Array<{
    type: "command";
    command: string;
    timeout?: number;
    statusMessage?: string;
  }>;
};

export async function installCodexIntegration(paths: ArdexPaths): Promise<CodexInstallResult> {
  const skillPath = join(skillRoot(), "ardex", "SKILL.md");
  const hooksDir = join(paths.home, "hooks");
  const stopScriptPath = join(hooksDir, "stop-check.mjs");
  const postToolUseScriptPath = join(hooksDir, "post-tool-use-evidence.mjs");
  const userPromptScriptPath = join(hooksDir, "user-prompt-context.mjs");
  const hooksConfigPath = join(codexHome(), "hooks.json");

  await mkdir(dirname(skillPath), { recursive: true });
  await mkdir(hooksDir, { recursive: true });
  await mkdir(dirname(hooksConfigPath), { recursive: true });
  await writeFile(skillPath, ardexSkillContent(), "utf8");
  await writeFile(stopScriptPath, stopHookScript(), "utf8");
  await writeFile(postToolUseScriptPath, postToolUseHookScript(), "utf8");
  await writeFile(userPromptScriptPath, userPromptHookScript(), "utf8");
  await mergeHooksConfig(hooksConfigPath, [
    {
      event: "UserPromptSubmit",
      entry: {
        hooks: [{ type: "command", command: `${quote(process.execPath)} ${quote(userPromptScriptPath)}`, timeout: 10, statusMessage: "Loading Ardex statement" }],
      },
    },
    {
      event: "Stop",
      entry: {
        hooks: [{ type: "command", command: `${quote(process.execPath)} ${quote(stopScriptPath)}`, timeout: 10, statusMessage: "Checking Ardex gates" }],
      },
    },
    {
      event: "PostToolUse",
      entry: {
        matcher: "Bash|apply_patch|Edit|Write",
        hooks: [{ type: "command", command: `${quote(process.execPath)} ${quote(postToolUseScriptPath)}`, timeout: 10, statusMessage: "Recording Ardex evidence" }],
      },
    },
  ]);

  return {
    skillPath,
    hooksConfigPath,
    hookScriptPaths: [userPromptScriptPath, stopScriptPath, postToolUseScriptPath],
    managedPaths: [skillPath, userPromptScriptPath, stopScriptPath, postToolUseScriptPath, hooksConfigPath],
  };
}

function skillRoot(): string {
  return process.env["ARDEX_SKILL_ROOT"] ?? join(homedir(), ".agents", "skills");
}

function codexHome(): string {
  return process.env["ARDEX_CODEX_HOME"] ?? join(homedir(), ".codex");
}

async function mergeHooksConfig(
  path: string,
  additions: Array<{
    event: string;
    entry: HookEntry;
  }>,
): Promise<void> {
  const config = await readHooksConfig(path);
  config.hooks ??= {};
  for (const addition of additions) {
    const entries = (config.hooks[addition.event] ?? []).filter((entry) => !isManagedArdexHook(entry));
    entries.push(addition.entry);
    config.hooks[addition.event] = entries;
  }
  await writeBackupIfExisting(path);
  await atomicWriteJson(path, config);
}

async function readHooksConfig(path: string): Promise<HooksConfig> {
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as HooksConfig) : {};
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return {};
    }
    throw error;
  }
}

function isManagedArdexHook(entry: HookEntry): boolean {
  return entry.hooks.some((hook) => {
    const command = hook.command.toLowerCase();
    const status = hook.statusMessage?.toLowerCase() ?? "";
    return (
      command.includes("/.ardex/hooks/") ||
      command.includes("stop-check.mjs") ||
      command.includes("post-tool-use-evidence.mjs") ||
      command.includes("user-prompt-context.mjs") ||
      status.includes("ardex")
    );
  });
}

async function atomicWriteJson(path: string, value: unknown): Promise<void> {
  const tmpPath = `${path}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await writeFile(tmpPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(tmpPath, path);
}

async function writeBackupIfExisting(path: string): Promise<void> {
  try {
    const existing = await readFile(path, "utf8");
    await writeFile(`${path}.ardex-backup`, existing, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return;
    }
    throw error;
  }
}

function quote(value: string): string {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

function ardexSkillContent(): string {
  return `---
name: ardex
description: Ardex live session, quality gate, evidence, scale check, SDD/VDD workflow control for Codex. Use when working in an Ardex-managed project or when task progress, asks, evidence, gates, or scale are mentioned.
---

# Ardex Live Session

Use Ardex CLI as source of truth for project/session/task state. Prefer stable JSON outputs.

## Startup

1. Run \`ardex check --json\`. If unavailable, run \`ardex start --json\`.
2. Run \`ardex project current --json\`. If no project exists, ask before registering path.
3. Run \`ardex statement --json\` before planning or editing.
4. Treat Ardex hook context as current state. If it conflicts with memory, Ardex wins.

## Work Loop

- Before implementation, run \`ardex -p <project> scale check --path <target> --json\`.
- Claim a task before editing: \`ardex -p <project> task <task> claim --json\`.
- If a user-paused task exists, do not resume it unless the statement says \`resume:<task_id>\` or the user explicitly asks.
- Respect task owner. Use \`subagent:<role>\` as delegation hint and keep Ardex updated with \`task <task> assign <owner>\`.
- Record meaningful evidence after real verification: \`ardex -p <project> evidence add test --task <task> --cmd "<command>" --pass true --summary "<result>" --json\`.
- Record SDD/VDD artifacts: \`spec\`, \`acceptance\`, \`screenshot\`, \`generated_image\`, \`browser_diff\`, \`prototype\`.
- Use \`ardex -p <project> ask "<question>" --json\` when blocked by user choice.
- When an ask is answered, read \`ardex statement --json\` and continue from \`nextExpectedAction\`.
- Before done, run \`ardex -p <project> task <task> checklist --json\`.
- Do not mark tasks done unless progress is 1 and required quality gate evidence exists.
- At end of turn, run \`ardex -p <project> statement --json\` and report task, blockers, and evidence.
- If a Stop hook blocks, fix the Ardex state/evidence instead of ignoring it.

## Scale Rules

- Split work when scale recommends \`split\`, weight is above 13, or file findings include \`block\`.
- Do not create oversized files. Prefer new modules below 400 source lines.
- Waive scale findings only with explicit reason and only when tracked by Ardex.
`;
}

function stopHookScript(): string {
  return `#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const input = await readStdinJson();
const cwd = typeof input.cwd === "string" ? input.cwd : process.cwd();
const ardex = process.env.ARDEX_BIN || "ardex";
ensureDaemon(ardex, cwd);
const statement = runJson(ardex, ["statement", "--json"], cwd);

if (!statement || !statement.ok) {
  output({ continue: true, suppressOutput: true });
}

const data = statement.data?.statement;
if (!data) {
  output({ continue: true, suppressOutput: true });
}

if (Array.isArray(data.blockers) && data.blockers.length > 0) {
  output({ decision: "block", reason: "Ardex has open blockers. Answer asks or update task state before ending turn." });
}

if (data.session?.status === "implementing" && data.scale?.nextSplitRequired === true) {
  output({ decision: "block", reason: "Ardex scale gate requires split or waiver before continuing implementation." });
}

if (data.project?.id && data.currentTask?.id) {
  const checklist = runJson(ardex, ["-p", data.project.id, "task", data.currentTask.id, "checklist", "--json"], cwd);
  const failed = checklist?.data?.checklist?.items?.filter((item) => item.required && !item.passed) ?? [];
  if (failed.length > 0) {
    output({
      decision: "block",
      reason: "Ardex production checklist is incomplete for " + data.currentTask.id + ": " + failed.map((item) => item.id).join(", "),
    });
  }
}

output({ continue: true });

async function readStdinJson() {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  try {
    return raw.trim().length === 0 ? {} : JSON.parse(raw);
  } catch {
    return {};
  }
}

function runJson(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", env: process.env, timeout: 3000 });
  if (result.status !== 0 || !result.stdout) return null;
  try {
    return JSON.parse(result.stdout);
  } catch {
    return null;
  }
}

function ensureDaemon(command, cwd) {
  const checked = runJson(command, ["check", "--json"], cwd);
  if (checked?.ok) return;
  runJson(command, ["start", "--json"], cwd);
}

function output(value) {
  process.stdout.write(JSON.stringify(value));
  process.exit(0);
}
`;
}

function userPromptHookScript(): string {
  return `#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const input = await readStdinJson();
const cwd = typeof input.cwd === "string" ? input.cwd : process.cwd();
const ardex = process.env.ARDEX_BIN || "ardex";
ensureDaemon(ardex, cwd);

const project = runJson(ardex, ["project", "current", "--json"], cwd)?.data?.project?.id;
if (!project) {
  output({ continue: true, suppressOutput: true });
}

const statement = runJson(ardex, ["-p", project, "statement", "--json"], cwd);
const data = statement?.data?.statement;
if (!data) {
  output({ continue: true, suppressOutput: true });
}

const lines = [
  "Ardex active. Treat this as source of truth.",
  "Project: " + data.project?.id + " " + data.project?.path,
  "Session: " + (data.session?.id || "none") + " " + (data.session?.status || ""),
  "Current task: " + (data.currentTask ? data.currentTask.id + " " + data.currentTask.status + " " + data.currentTask.title : "none"),
  "Owner: " + (data.currentTask?.owner || "none"),
  "Next: " + (data.nextExpectedAction || "none"),
  "Blockers: " + (Array.isArray(data.blockers) ? data.blockers.length : 0),
  "Rules: check Ardex statement before work; claim/resume task before edits; record evidence after verification; run checklist before done."
];

output({
  hookSpecificOutput: {
    hookEventName: "UserPromptSubmit",
    additionalContext: lines.join("\\n")
  }
});

async function readStdinJson() {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  try {
    return raw.trim().length === 0 ? {} : JSON.parse(raw);
  } catch {
    return {};
  }
}

function runJson(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", env: process.env, timeout: 3000 });
  if (result.status !== 0 || !result.stdout) return null;
  try {
    return JSON.parse(result.stdout);
  } catch {
    return null;
  }
}

function ensureDaemon(command, cwd) {
  const checked = runJson(command, ["check", "--json"], cwd);
  if (checked?.ok) return;
  runJson(command, ["start", "--json"], cwd);
}

function output(value) {
  process.stdout.write(JSON.stringify(value));
  process.exit(0);
}
`;
}

function postToolUseHookScript(): string {
  return `#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const input = await readStdinJson();
const cwd = typeof input.cwd === "string" ? input.cwd : process.cwd();
const summary = summarize(input);
const ardex = process.env.ARDEX_BIN || "ardex";
ensureDaemon(ardex, cwd);

if (summary && !summary.startsWith("ardex ")) {
  const project = runJson(ardex, ["project", "current", "--json"], cwd)?.data?.project?.id;
  if (project) {
    const recorded = spawnSync(ardex, ["-p", project, "evidence", "add", "command", "--summary", summary, "--status", "candidate", "--json"], {
      cwd,
      encoding: "utf8",
      env: process.env,
      timeout: 3000,
    });
    const evidenceId = parseEvidenceId(recorded.stdout);
    if (evidenceId) {
      output({ hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: "Ardex recorded candidate command evidence " + evidenceId + "." } });
    }
  }
}

process.exit(0);

async function readStdinJson() {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  try {
    return raw.trim().length === 0 ? {} : JSON.parse(raw);
  } catch {
    return {};
  }
}

function summarize(input) {
  const command = input.tool_input?.command ?? input.toolInput?.command ?? input.input?.command;
  if (typeof command === "string" && command.length > 0) {
    return redact(command).slice(0, 240);
  }
  return redact(String(input.tool_name || input.toolName || "tool")).slice(0, 120);
}

function runJson(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", env: process.env, timeout: 3000 });
  if (result.status !== 0 || !result.stdout) return null;
  try {
    return JSON.parse(result.stdout);
  } catch {
    return null;
  }
}

function ensureDaemon(command, cwd) {
  const checked = runJson(command, ["check", "--json"], cwd);
  if (checked?.ok) return;
  runJson(command, ["start", "--json"], cwd);
}

function redact(value) {
  return value
    .replace(/sk-[A-Za-z0-9_-]{20,}/g, "[REDACTED_OPENAI_KEY]")
    .replace(/(api[_-]?key|token|secret|password)=([^\\s]+)/gi, "$1=[REDACTED]");
}

function parseEvidenceId(stdout) {
  try {
    return JSON.parse(stdout)?.data?.evidence?.id || null;
  } catch {
    return null;
  }
}

function output(value) {
  process.stdout.write(JSON.stringify(value));
  process.exit(0);
}
`;
}
