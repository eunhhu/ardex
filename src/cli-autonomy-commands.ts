import type { Database } from "bun:sqlite";
import { usageError } from "./errors.ts";
import { success, type CommandSuccess } from "./output.ts";
import type { ParsedArgs } from "./cli-types.ts";
import { collectRepeatedOption, parseOptions } from "./cli-options.ts";
import { agentActionSummary, agentRunSummary, decisionSummary } from "./cli-format.ts";
import { resolveProject, withDb } from "./cli-db.ts";

type AgentRun = object;
type AgentAction = object;
type DecisionOptionLike = { id: string; label: string; description?: string; consequence?: string };
type Decision = object & { options: DecisionOptionLike[] };

type AutonomyRepository = {
  listAgentRuns(db: Database, projectRef: string, filters?: Record<string, unknown>): AgentRun[];
  startAgentRun(db: Database, projectRef: string, input: Record<string, unknown>): AgentRun;
  heartbeatAgentRun(db: Database, projectRef: string, runRef: string, input?: Record<string, unknown>): AgentRun;
  completeAgentRun(db: Database, projectRef: string, runRef: string, input?: Record<string, unknown>): AgentRun;
  failAgentRun(db: Database, projectRef: string, runRef: string, input?: Record<string, unknown>): AgentRun;
  listAgentActions(db: Database, projectRef: string, filters?: Record<string, unknown>): AgentAction[];
  addAgentAction(db: Database, projectRef: string, input: Record<string, unknown>): AgentAction;
  endAgentAction(db: Database, projectRef: string, actionRef: string, input?: Record<string, unknown>): AgentAction;
  listDecisions(db: Database, projectRef: string, filters?: Record<string, unknown>): Decision[];
  addDecision(db: Database, projectRef: string, input: Record<string, unknown>): Decision;
  answerDecision(db: Database, projectRef: string, decisionRef: string, input: { answer: string; answerSource?: string }): Decision;
  dismissDecision(db: Database, projectRef: string, decisionRef: string, input?: { reason?: string }): Decision;
};

const autonomyRepositoryExports = [
  "listAgentRuns",
  "startAgentRun",
  "heartbeatAgentRun",
  "completeAgentRun",
  "failAgentRun",
  "listAgentActions",
  "addAgentAction",
  "endAgentAction",
  "listDecisions",
  "addDecision",
  "answerDecision",
  "dismissDecision",
] as const;

export async function agentRunCommand(parsed: ParsedArgs): Promise<CommandSuccess> {
  const [, action, ...rawArgs] = parsed.args;
  return await withDb(async (db) => {
    const project = await resolveProject(db, parsed.projectId);
    const repository = await loadAutonomyRepository();
    const options = parseOptions(rawArgs);

    switch (action) {
      case "ls": {
        const runs: AgentRun[] = repository.listAgentRuns(db, project.alias, {
          status: asAutonomyValue(options.status),
          owner: options.role ?? options.owner ?? options["agent-role"],
          taskRef: options.task ?? options["task-id"],
          sessionRef: options.session ?? options["session-id"],
        });
        return success(
          { agentRuns: runs.map(agentRunSummary) },
          runs.length === 0 ? "No agent runs." : runs.map((run) => formatAgentRunLine(agentRunSummary(run))).join("\n"),
        );
      }
      case "start": {
        const positionals = positionalArgs(rawArgs);
        const run: AgentRun = repository.startAgentRun(db, project.alias, {
          owner: options.owner ?? options.role ?? options["agent-role"],
          role: options.role,
          taskRef: options.task ?? options["task-id"],
          sessionRef: options.session ?? options["session-id"],
          goal: options.goal ?? options.summary ?? joinOrUndefined(positionals) ?? "Agent run",
          summary: options.summary ?? joinOrUndefined(positionals),
          model: options.model,
          worktreePath: options.worktree ?? options["worktree-path"],
          branchName: options.branch ?? options["branch-name"],
          pid: parseOptionalInteger(options.pid, "pid"),
          autonomyBudget: parseJsonObjectOption(options.budget ?? options["autonomy-budget"], "autonomy budget"),
        });
        return success({ agentRun: agentRunSummary(run) }, formatAgentRunLine(agentRunSummary(run)));
      }
      case "heartbeat": {
        const runRef = requiredRef(rawArgs, options, "run", "agent-run heartbeat requires a run id.");
        const run: AgentRun = repository.heartbeatAgentRun(db, project.alias, runRef, {
          status: asAutonomyValue(options.status) ?? asAutonomyValue("running"),
          summary: options.summary,
          detail: options.detail,
        });
        return success({ agentRun: agentRunSummary(run) }, `Agent run ${displayId(agentRunSummary(run))}: heartbeat`);
      }
      case "done": {
        const runRef = requiredRef(rawArgs, options, "run", "agent-run done requires a run id.");
        const run: AgentRun = repository.completeAgentRun(db, project.alias, runRef, {
          summary: options.summary ?? joinOrUndefined(positionalArgs(rawArgs).slice(1)),
          exitCode: parseOptionalInteger(options.exit ?? options["exit-code"], "exit-code"),
        });
        return success({ agentRun: agentRunSummary(run) }, `Agent run ${displayId(agentRunSummary(run))}: done`);
      }
      case "fail": {
        const runRef = requiredRef(rawArgs, options, "run", "agent-run fail requires a run id.");
        const run: AgentRun = repository.failAgentRun(db, project.alias, runRef, {
          reason: options.reason ?? options.summary ?? joinOrUndefined(positionalArgs(rawArgs).slice(1)),
          summary: options.summary,
          exitCode: parseOptionalInteger(options.exit ?? options["exit-code"], "exit-code"),
        });
        return success({ agentRun: agentRunSummary(run) }, `Agent run ${displayId(agentRunSummary(run))}: failed`);
      }
      default:
        throw usageError("Unknown agent-run command.", { action });
    }
  });
}

async function loadAutonomyRepository(): Promise<AutonomyRepository> {
  let repository: Record<string, unknown>;
  try {
    repository = (await import("./repository.ts")) as Record<string, unknown>;
  } catch (error) {
    throw usageError("Autonomy repository functions are unavailable. Complete the autonomy data slice first.", {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
  const missing = autonomyRepositoryExports.filter((name) => typeof repository[name] !== "function");
  if (missing.length > 0) {
    throw usageError("Autonomy repository functions are unavailable. Complete the autonomy data slice first.", { missing });
  }
  return repository as unknown as AutonomyRepository;
}

export async function agentActionCommand(parsed: ParsedArgs): Promise<CommandSuccess> {
  const [, action, ...rawArgs] = parsed.args;
  return await withDb(async (db) => {
    const project = await resolveProject(db, parsed.projectId);
    const repository = await loadAutonomyRepository();
    const options = parseOptions(rawArgs);

    switch (action) {
      case "ls": {
        const actions: AgentAction[] = repository.listAgentActions(db, project.alias, {
          runRef: options.run ?? options["run-id"],
          taskRef: options.task ?? options["task-id"],
          status: asAutonomyValue(options.status),
        });
        return success(
          { agentActions: actions.map(agentActionSummary) },
          actions.length === 0 ? "No agent actions." : actions.map((item) => formatAgentActionLine(agentActionSummary(item))).join("\n"),
        );
      }
      case "add": {
        const positionals = positionalArgs(rawArgs);
        const runRef = options.run ?? options["run-id"] ?? positionals[0];
        if (runRef === undefined) throw usageError("agent-action add requires a run id or --run.");
        const actionSummary = options.summary ?? joinOrUndefined(positionals.slice(1));
        if (actionSummary === undefined) throw usageError("agent-action add requires summary text or --summary.");
        const item: AgentAction = repository.addAgentAction(db, project.alias, {
          runRef,
          taskRef: options.task ?? options["task-id"],
          type: asRequiredAutonomyValue(options.type ?? options.kind ?? "note"),
          status: asAutonomyValue(options.status),
          summary: actionSummary,
          currentFile: options.file ?? options["current-file"],
          command: options.command ?? options.cmd,
          progress: parseOptionalNumber(options.progress, "progress"),
          payload: parseJsonObjectOption(options.payload ?? options["payload-json"], "payload"),
        });
        return success({ agentAction: agentActionSummary(item) }, formatAgentActionLine(agentActionSummary(item)));
      }
      case "end": {
        const actionRef = requiredRef(rawArgs, options, "action", "agent-action end requires an action id.");
        const item: AgentAction = repository.endAgentAction(db, project.alias, actionRef, {
          status: asAutonomyValue(options.status) ?? asAutonomyValue("completed"),
          summary: options.summary ?? joinOrUndefined(positionalArgs(rawArgs).slice(1)),
          payload: parseJsonObjectOption(options.payload ?? options["payload-json"], "payload"),
        });
        return success({ agentAction: agentActionSummary(item) }, `Agent action ${displayId(agentActionSummary(item))}: ended`);
      }
      default:
        throw usageError("Unknown agent-action command.", { action });
    }
  });
}

export async function decisionCommand(parsed: ParsedArgs): Promise<CommandSuccess> {
  const [, first, second, ...rest] = parsed.args;
  return await withDb(async (db) => {
    const project = await resolveProject(db, parsed.projectId);
    const repository = await loadAutonomyRepository();

    if (first === "ls") {
      const options = parseOptions([second, ...rest].filter((item): item is string => item !== undefined));
      const decisions: Decision[] = repository.listDecisions(db, project.alias, {
        status: asAutonomyValue(options.status),
        runRef: options.run ?? options["run-id"],
        taskRef: options.task ?? options["task-id"],
      });
      return success(
        { decisions: decisions.map(decisionSummary) },
        decisions.length === 0 ? "No decisions." : decisions.map((decision) => formatDecisionLine(decisionSummary(decision))).join("\n"),
      );
    }

    if (first === "add") {
      const rawArgs = [second, ...rest].filter((item): item is string => item !== undefined);
      const options = parseOptions(rawArgs);
      const question = options.question ?? options.prompt ?? joinOrUndefined(positionalArgs(rawArgs));
      if (question === undefined) throw usageError("decision add requires question text or --question.");
      const decision: Decision = repository.addDecision(db, project.alias, {
        question,
        runRef: options.run ?? options["run-id"],
        taskRef: options.task ?? options["task-id"],
        type: options.type,
        recommendedOption: options.recommended ?? options["recommended-option"],
        required: parseOptionalBoolean(options.required, "required"),
        priority: parseOptionalInteger(options.priority, "priority"),
        options: decisionOptions(rawArgs),
        payload: parseJsonObjectOption(options.payload ?? options["payload-json"], "payload"),
      });
      return success({ decision: decisionSummary(decision) }, formatDecisionLine(decisionSummary(decision)));
    }

    if (first !== undefined && second === "answer") {
      const options = parseOptions(rest);
      const answer = options.answer ?? joinOrUndefined(positionalArgs(rest));
      if (answer === undefined) throw usageError("decision answer requires answer text.");
      const decision: Decision = repository.answerDecision(db, project.alias, first, {
        answer,
        answerSource: options.source,
      });
      return success({ decision: decisionSummary(decision) }, `Decision ${displayId(decisionSummary(decision))}: answered`);
    }

    if (first !== undefined && second === "dismiss") {
      const options = parseOptions(rest);
      const decision: Decision = repository.dismissDecision(db, project.alias, first, {
        reason: options.reason ?? joinOrUndefined(positionalArgs(rest)),
      });
      return success({ decision: decisionSummary(decision) }, `Decision ${displayId(decisionSummary(decision))}: dismissed`);
    }

    throw usageError("Unknown decision command.", { action: first, subcommand: second });
  });
}

function positionalArgs(args: string[]): string[] {
  const values: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === undefined) continue;
    if (arg.startsWith("-")) {
      index += 1;
      continue;
    }
    values.push(arg);
  }
  return values;
}

function requiredRef(args: string[], options: Record<string, string>, optionName: string, message: string): string {
  const ref = options[optionName] ?? options[`${optionName}-id`] ?? positionalArgs(args)[0];
  if (ref === undefined) throw usageError(message);
  return ref;
}

function joinOrUndefined(values: string[]): string | undefined {
  const value = values.join(" ").trim();
  return value.length === 0 ? undefined : value;
}

function parseOptionalInteger(value: string | undefined, field: string): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw usageError(`${field} must be an integer.`, { field, value });
  }
  return parsed;
}

function parseOptionalNumber(value: string | undefined, field: string): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw usageError(`${field} must be a number.`, { field, value });
  }
  return parsed;
}

function parseOptionalBoolean(value: string | undefined, field: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (["1", "true", "yes", "required"].includes(value)) return true;
  if (["0", "false", "no", "optional"].includes(value)) return false;
  throw usageError(`${field} must be a boolean.`, { field, value });
}

function asAutonomyValue<T extends string>(value: string | undefined): T | undefined {
  return value as T | undefined;
}

function asRequiredAutonomyValue<T extends string>(value: string): T {
  return value as T;
}

function parseJsonObjectOption(value: string | undefined, field: string): Record<string, unknown> | undefined {
  if (value === undefined) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw usageError(`${field} must be valid JSON.`, { field });
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw usageError(`${field} must be a JSON object.`, { field });
  }
  return parsed as Record<string, unknown>;
}

function metadataFromOptions(options: Record<string, string>, keys: string[]): Record<string, unknown> | undefined {
  const metadata = parseJsonObjectOption(options.metadata ?? options["metadata-json"], "metadata") ?? {};
  for (const key of keys) {
    const value = options[key];
    if (value !== undefined) metadata[key] = value;
  }
  return Object.keys(metadata).length === 0 ? undefined : metadata;
}

function decisionOptions(args: string[]): Array<Decision["options"][number]> {
  return collectRepeatedOption(args, "option").map((value, index) => {
    const parsed = /^([^:]+):(.*)$/.exec(value);
    const id = parsed?.[1]?.trim() || `option_${index + 1}`;
    const label = parsed?.[2]?.trim() || value;
    return {
      id,
      label,
      description: label,
      consequence: label,
    } as Decision["options"][number];
  });
}

function formatAgentRunLine(summary: Record<string, unknown>): string {
  return `${summary.id ?? ""}\t${summary.status ?? ""}\t${summary.owner ?? summary.agentRole ?? ""}\t${summary.taskId ?? ""}\t${summary.summary ?? ""}`;
}

function formatAgentActionLine(summary: Record<string, unknown>): string {
  return `${summary.id ?? ""}\t${summary.status ?? ""}\t${summary.kind ?? summary.type ?? ""}\t${summary.runId ?? ""}\t${summary.summary ?? ""}`;
}

function formatDecisionLine(summary: Record<string, unknown>): string {
  return `${summary.id ?? ""}\t${summary.status ?? ""}\t${summary.runId ?? ""}\t${summary.question ?? ""}`;
}

function displayId(summary: Record<string, unknown>): string {
  const id = summary.id;
  return typeof id === "string" ? id : "";
}
