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
  const legacyPostToolUseScriptPath = join(hooksDir, "post-tool-use-evidence.mjs");
  const userPromptScriptPath = join(hooksDir, "user-prompt-context.mjs");
  const hooksConfigPath = join(codexHome(), "hooks.json");

  await mkdir(dirname(skillPath), { recursive: true });
  await mkdir(hooksDir, { recursive: true });
  await mkdir(dirname(hooksConfigPath), { recursive: true });
  await writeTextIfChanged(skillPath, ardexSkillContent());
  await writeTextIfChanged(stopScriptPath, stopHookScript());
  await writeTextIfChanged(legacyPostToolUseScriptPath, disabledPostToolUseHookScript());
  await writeTextIfChanged(userPromptScriptPath, userPromptHookScript());
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
  ]);

  return {
    skillPath,
    hooksConfigPath,
    hookScriptPaths: [userPromptScriptPath, stopScriptPath],
    managedPaths: [skillPath, userPromptScriptPath, stopScriptPath, legacyPostToolUseScriptPath, hooksConfigPath],
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
  for (const eventName of Object.keys(config.hooks)) {
    config.hooks[eventName] = (config.hooks[eventName] ?? []).filter((entry) => !isManagedArdexHook(entry));
    if (config.hooks[eventName]?.length === 0) {
      delete config.hooks[eventName];
    }
  }
  for (const addition of additions) {
    const entries = config.hooks[addition.event] ?? [];
    entries.push(addition.entry);
    config.hooks[addition.event] = entries;
  }
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

async function writeTextIfChanged(path: string, value: string): Promise<void> {
  try {
    if ((await readFile(path, "utf8")) === value) {
      return;
    }
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) {
      throw error;
    }
  }
  await writeFile(path, value, "utf8");
}

async function atomicWriteJson(path: string, value: unknown): Promise<void> {
  const next = `${JSON.stringify(value, null, 2)}\n`;
  try {
    if ((await readFile(path, "utf8")) === next) {
      return;
    }
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) {
      throw error;
    }
  }
  await writeBackupIfExisting(path);
  const tmpPath = `${path}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await writeFile(tmpPath, next, "utf8");
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
- Respect task owner. If \`statement.subagents.required\` is true or a task owner starts with \`subagent:\`, treat that as an explicit Ardex delegation request: spawn/use a separate Codex subagent for that task when subagent tools are available. Main context coordinates, integrates, and verifies.
- Give each subagent only its task id, owner role, bounded scope, expected output, and allowed files/responsibility. Do not let the main context absorb subagent-owned implementation unless subagent tools are unavailable; in that case report the limitation instead of silently continuing.
- Keep Ardex updated with \`task <task> assign <owner>\` when ownership changes.
- Do not duplicate Codex command/file logs in Ardex. Use Ardex evidence only for user decisions, external URLs, manual QA notes, deploy links, or artifacts Codex cannot reconstruct.
- Use \`ardex -p <project> ask "<question>" --json\` when blocked by user choice.
- When an ask is answered, read \`ardex statement --json\` and continue from \`nextExpectedAction\`.
- Before done, run \`ardex -p <project> task <task> checklist --json\`.
- Do not mark tasks done unless progress is 1, the task is not paused, and no hard Ardex blockers remain.
- At end of turn, run \`ardex -p <project> statement --json\` and report task, blockers, and next action.
- If a Stop hook blocks, fix the Ardex state instead of ignoring it.

## Scale Rules

- Split work when scale recommends \`split\`, weight is above 13, or file findings include \`block\`.
- After splitting, preserve separated context by assigning bounded child tasks to unique \`subagent:<role>\` owners unless the task is intentionally main-context integration work.
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

function disabledPostToolUseHookScript(): string {
  return `#!/usr/bin/env node
process.exit(0);
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
  "Subagents: " + subagentSummary(data.subagents),
  "Next: " + (data.nextExpectedAction || "none"),
  "Blockers: " + (Array.isArray(data.blockers) ? data.blockers.length : 0),
  "Rules: check Ardex statement before work; claim/resume task before edits; keep task state current; use evidence only for external/user-visible artifacts; run checklist before done.",
  "Subagent rule: when Ardex lists pending subagent-owned tasks, treat it as an explicit delegation request; spawn one bounded subagent per task when available, and keep main context for coordination/integration."
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

function subagentSummary(plan) {
  if (!plan || !Array.isArray(plan.pending) || plan.pending.length === 0) {
    return plan?.instruction || "none";
  }
  const pending = plan.pending
    .slice(0, 6)
    .map((task) => task.id + ":" + task.owner + ":" + task.status + ":" + task.title)
    .join(" | ");
  const suffix = plan.pending.length > 6 ? " | +" + (plan.pending.length - 6) + " more" : "";
  return "required; " + pending + suffix + "; " + (plan.instruction || "");
}

function output(value) {
  process.stdout.write(JSON.stringify(value));
  process.exit(0);
}
`;
}
