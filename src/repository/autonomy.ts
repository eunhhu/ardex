import { Database } from "bun:sqlite";
import { notFound, transitionRejected, usageError } from "../errors.ts";
import { createId } from "../ids.ts";
import { requireProject } from "./projects.ts";
import { findCurrentSessionId, requireSession } from "./sessions.ts";
import { requireTask } from "./tasks.ts";
import { agentActionFromRow, agentRunFromRow, decisionFromRow, type AgentActionRow, type AgentRunRow, type DecisionRow } from "./rows.ts";
import type {
  AgentAction,
  AgentActionStatus,
  AgentActionType,
  AgentRun,
  AgentRunStatus,
  Decision,
  DecisionOption,
  DecisionStatus,
  DecisionType,
} from "./types.ts";

type SqlValue = string | number | null;

type AgentRunCreateInput = {
  agentRole?: string;
  owner?: string;
  role?: string;
  goal?: string;
  taskRef?: string;
  sessionRef?: string;
  sessionId?: string | null;
  status?: string;
  summary?: string;
  model?: string;
  worktreePath?: string;
  branchName?: string;
  pid?: number;
  autonomyBudget?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  startedAt?: string | null;
  completedAt?: string | null;
};

type AgentRunListFilter = {
  status?: string;
  taskRef?: string;
  sessionRef?: string;
  agentRole?: string;
  owner?: string;
  role?: string;
};

type AgentRunUpdateInput = {
  status?: string;
  summary?: string;
  detail?: string;
  model?: string;
  worktreePath?: string;
  branchName?: string;
  pid?: number;
  autonomyBudget?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  startedAt?: string | null;
  completedAt?: string | null;
};

type AgentActionCreateInput = {
  runRef: string;
  taskRef?: string;
  type?: string;
  kind?: string;
  title?: string;
  sequence?: number;
  status?: string;
  summary?: string;
  currentFile?: string;
  command?: string;
  progress?: number;
  payload?: Record<string, unknown>;
  startedAt?: string | null;
  completedAt?: string | null;
};

type AgentActionListFilter = {
  runRef?: string;
  taskRef?: string;
  status?: string;
  type?: string;
  kind?: string;
};

type AgentActionUpdateInput = {
  status?: string;
  title?: string;
  summary?: string;
  currentFile?: string;
  command?: string;
  progress?: number;
  payload?: Record<string, unknown>;
  startedAt?: string | null;
  completedAt?: string | null;
};

type DecisionCreateInput = {
  question: string;
  context?: string;
  options?: DecisionOption[];
  priority?: number;
  taskRef?: string;
  runRef?: string;
  actionRef?: string;
  sessionRef?: string;
  sessionId?: string | null;
  type?: string;
  recommendedOption?: string;
  required?: boolean;
  payload?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};

type DecisionListFilter = {
  status?: string;
  taskRef?: string;
  runRef?: string;
  actionRef?: string;
};

type DecisionUpdateInput = {
  question?: string;
  context?: string;
  options?: DecisionOption[];
  priority?: number;
  type?: string;
  recommendedOption?: string;
  required?: boolean;
  metadata?: Record<string, unknown>;
};

const agentRunStatuses = new Set<AgentRunStatus>(["queued", "running", "blocked", "merging", "verifying", "completed", "failed", "cancelled"]);
const terminalAgentRunStatuses = new Set<AgentRunStatus>(["completed", "failed", "cancelled"]);
const agentActionTypes = new Set<AgentActionType>([
  "note",
  "command",
  "file",
  "decision",
  "status",
  "error",
  "planning",
  "reading",
  "editing",
  "running_command",
  "testing",
  "generating_output",
  "asking_user",
  "waiting_approval",
  "merging",
  "reviewing",
]);
const agentActionStatuses = new Set<AgentActionStatus>(["pending", "running", "completed", "failed", "skipped"]);
const terminalAgentActionStatuses = new Set<AgentActionStatus>(["completed", "failed", "skipped"]);
const decisionStatuses = new Set<DecisionStatus>(["open", "answered", "dismissed"]);
const decisionTypes = new Set<DecisionType>(["product_choice", "visual_approval", "scope_change", "risk_waiver", "merge_approval", "deployment_approval"]);

export function createAgentRun(db: Database, projectRef: string, input: AgentRunCreateInput): AgentRun {
  const project = requireProject(db, projectRef);
  const taskId = resolveTaskId(db, project.id, input.taskRef);
  const agentRole = normalizeAgentRole(input.agentRole ?? input.owner ?? input.role ?? "subagent");
  const goal = requireNonEmpty(input.goal ?? input.summary ?? "Agent run", "Agent run goal");
  const sessionId =
    input.sessionId === undefined ? resolveSessionId(db, project.id, input.sessionRef) ?? findCurrentSessionId(db, project.id) : input.sessionId;
  const status = parseAgentRunStatus(input.status ?? "queued");
  const now = new Date().toISOString();
  const id = createId();
  const alias = nextAutonomyAlias(db, "agent_runs");
  const startedAt = input.startedAt ?? (status === "running" ? now : null);
  const completedAt = input.completedAt ?? (terminalAgentRunStatuses.has(status) ? now : null);

  db.query(
    `
      INSERT INTO agent_runs (
        id, alias, project_id, session_id, task_id, agent_role, status, goal, summary, metadata_json,
        started_at, completed_at, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
  ).run(
    id,
    alias,
    project.id,
    sessionId,
    taskId,
    agentRole,
    status,
    goal,
    input.summary ?? "",
    JSON.stringify(agentRunMetadata(input)),
    startedAt,
    completedAt,
    now,
    now,
  );

  return requireAgentRun(db, alias);
}

export function startAgentRun(db: Database, projectRef: string, input: AgentRunCreateInput): AgentRun {
  return createAgentRun(db, projectRef, { ...input, status: input.status ?? "running" });
}

export function listAgentRuns(db: Database, projectRef: string, filter: AgentRunListFilter = {}): AgentRun[] {
  const project = requireProject(db, projectRef);
  const params: SqlValue[] = [project.id];
  let sql = "SELECT * FROM agent_runs WHERE project_id = ?";
  if (filter.status !== undefined) {
    sql += " AND status = ?";
    params.push(parseAgentRunStatus(filter.status));
  }
  if (filter.taskRef !== undefined) {
    sql += " AND task_id = ?";
    params.push(resolveTaskId(db, project.id, filter.taskRef));
  }
  if (filter.sessionRef !== undefined) {
    sql += " AND session_id = ?";
    params.push(resolveSessionId(db, project.id, filter.sessionRef));
  }
  const agentRole = filter.agentRole ?? filter.owner ?? filter.role;
  if (agentRole !== undefined) {
    sql += " AND agent_role = ?";
    params.push(normalizeAgentRole(agentRole));
  }
  sql += " ORDER BY created_at DESC, alias DESC";
  return (db.query(sql).all(...params) as AgentRunRow[]).map(agentRunFromRow);
}

export function requireAgentRun(db: Database, runRef: string): AgentRun {
  const row = db.query("SELECT * FROM agent_runs WHERE id = ? OR alias = ?").get(runRef, runRef) as AgentRunRow | null;
  if (row === null) {
    throw notFound("Agent run not found.", { runRef });
  }
  return agentRunFromRow(row);
}

export function updateAgentRun(db: Database, projectRef: string, runRef: string, input: AgentRunUpdateInput): AgentRun {
  const project = requireProject(db, projectRef);
  const run = requireAgentRunInProject(db, project.id, runRef);
  const now = new Date().toISOString();
  const fields = agentRunUpdateFields(run, input, now);
  updateColumns(db, "agent_runs", run.id, fields, now);
  return requireAgentRun(db, run.id);
}

export function heartbeatAgentRun(db: Database, projectRef: string, runRef: string, input: AgentRunUpdateInput = {}): AgentRun {
  const project = requireProject(db, projectRef);
  const run = requireAgentRunInProject(db, project.id, runRef);
  const now = new Date().toISOString();
  const fields = agentRunUpdateFields(run, input, now);
  if (fields.length === 0) {
    db.query("UPDATE agent_runs SET updated_at = ? WHERE id = ?").run(now, run.id);
  } else {
    updateColumns(db, "agent_runs", run.id, fields, now);
  }
  return requireAgentRun(db, run.id);
}

export function completeAgentRun(
  db: Database,
  projectRef: string,
  runRef: string,
  input: { summary?: string; metadata?: Record<string, unknown>; exitCode?: number } = {},
): AgentRun {
  const metadata = input.exitCode === undefined ? input.metadata : { ...(input.metadata ?? {}), exitCode: input.exitCode };
  return updateAgentRun(db, projectRef, runRef, { status: "completed", summary: input.summary, metadata });
}

export function failAgentRun(
  db: Database,
  projectRef: string,
  runRef: string,
  input: { reason?: string; summary?: string; metadata?: Record<string, unknown>; exitCode?: number } = {},
): AgentRun {
  const metadata = { ...(input.metadata ?? {}) };
  if (input.reason !== undefined) metadata["reason"] = input.reason;
  if (input.exitCode !== undefined) metadata["exitCode"] = input.exitCode;
  return updateAgentRun(db, projectRef, runRef, { status: "failed", summary: input.summary ?? input.reason, metadata });
}

export function createAgentAction(db: Database, projectRef: string, input: AgentActionCreateInput): AgentAction {
  const project = requireProject(db, projectRef);
  const run = requireAgentRunInProject(db, project.id, input.runRef);
  const type = parseAgentActionType(input.type ?? input.kind ?? "note");
  const status = parseAgentActionStatus(input.status ?? "completed");
  const summary = input.summary ?? input.title ?? "";
  const title = requireNonEmpty(input.title ?? summary, "Agent action title");
  const taskId = resolveActionTaskId(db, project.id, input.taskRef, run);
  const now = new Date().toISOString();
  const id = createId();
  const alias = nextAutonomyAlias(db, "agent_actions");
  const sequence = input.sequence ?? nextAgentActionSequence(db, run.id);
  assertSequence(sequence);
  const startedAt = input.startedAt ?? (status === "running" ? now : null);
  const completedAt = input.completedAt ?? (terminalAgentActionStatuses.has(status) ? now : null);

  db.query(
    `
      INSERT INTO agent_actions (
        id, alias, project_id, session_id, task_id, run_id, sequence, type, status, title, summary,
        payload_json, started_at, completed_at, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
  ).run(
    id,
    alias,
    project.id,
    run.sessionId,
    taskId,
    run.id,
    sequence,
    type,
    status,
    title,
    summary,
    JSON.stringify(agentActionPayload(input)),
    startedAt,
    completedAt,
    now,
    now,
  );

  return requireAgentAction(db, alias);
}

export function addAgentAction(db: Database, projectRef: string, input: AgentActionCreateInput): AgentAction {
  return createAgentAction(db, projectRef, input);
}

export function listAgentActions(db: Database, projectRef: string, filter: AgentActionListFilter = {}): AgentAction[] {
  const project = requireProject(db, projectRef);
  const params: SqlValue[] = [project.id];
  let sql = "SELECT * FROM agent_actions WHERE project_id = ?";
  if (filter.runRef !== undefined) {
    sql += " AND run_id = ?";
    params.push(requireAgentRunInProject(db, project.id, filter.runRef).id);
  }
  if (filter.taskRef !== undefined) {
    sql += " AND task_id = ?";
    params.push(resolveTaskId(db, project.id, filter.taskRef));
  }
  if (filter.status !== undefined) {
    sql += " AND status = ?";
    params.push(parseAgentActionStatus(filter.status));
  }
  const actionType = filter.type ?? filter.kind;
  if (actionType !== undefined) {
    sql += " AND type = ?";
    params.push(parseAgentActionType(actionType));
  }
  sql += filter.runRef === undefined ? " ORDER BY created_at DESC, alias DESC" : " ORDER BY sequence ASC, created_at ASC, alias ASC";
  return (db.query(sql).all(...params) as AgentActionRow[]).map(agentActionFromRow);
}

export function requireAgentAction(db: Database, actionRef: string): AgentAction {
  const row = db.query("SELECT * FROM agent_actions WHERE id = ? OR alias = ?").get(actionRef, actionRef) as AgentActionRow | null;
  if (row === null) {
    throw notFound("Agent action not found.", { actionRef });
  }
  return agentActionFromRow(row);
}

export function updateAgentAction(db: Database, projectRef: string, actionRef: string, input: AgentActionUpdateInput): AgentAction {
  const project = requireProject(db, projectRef);
  const action = requireAgentActionInProject(db, project.id, actionRef);
  const now = new Date().toISOString();
  const fields: Array<[string, SqlValue]> = [];
  if (input.status !== undefined) {
    const status = parseAgentActionStatus(input.status);
    fields.push(["status", status]);
    if (status === "running" && input.startedAt === undefined && action.startedAt === null) fields.push(["started_at", now]);
    if (terminalAgentActionStatuses.has(status) && input.completedAt === undefined) fields.push(["completed_at", now]);
  }
  if (input.title !== undefined) fields.push(["title", requireNonEmpty(input.title, "Agent action title")]);
  if (input.summary !== undefined) fields.push(["summary", input.summary]);
  const payload = agentActionPayload(input, action.payload);
  if (Object.keys(payload).length > 0) fields.push(["payload_json", JSON.stringify(payload)]);
  if (input.startedAt !== undefined) fields.push(["started_at", input.startedAt]);
  if (input.completedAt !== undefined) fields.push(["completed_at", input.completedAt]);
  updateColumns(db, "agent_actions", action.id, fields, now);
  return requireAgentAction(db, action.id);
}

export function endAgentAction(db: Database, projectRef: string, actionRef: string, input: AgentActionUpdateInput = {}): AgentAction {
  return updateAgentAction(db, projectRef, actionRef, { ...input, status: input.status ?? "completed" });
}

export function createDecision(db: Database, projectRef: string, input: DecisionCreateInput): Decision {
  const project = requireProject(db, projectRef);
  const question = requireNonEmpty(input.question, "Decision question");
  const action = input.actionRef === undefined ? null : requireAgentActionInProject(db, project.id, input.actionRef);
  const run = resolveDecisionRun(db, project.id, input.runRef, action);
  const taskId = resolveDecisionTaskId(db, project.id, input.taskRef, run, action);
  const sessionId =
    input.sessionId === undefined
      ? resolveSessionId(db, project.id, input.sessionRef) ?? action?.sessionId ?? run?.sessionId ?? findCurrentSessionId(db, project.id)
      : input.sessionId;
  const priority = input.priority ?? 0;
  assertPriority(priority);
  const metadata = decisionMetadata(input);
  const now = new Date().toISOString();
  const id = createId();
  const alias = nextAutonomyAlias(db, "decisions");

  db.query(
    `
      INSERT INTO decisions (
        id, alias, project_id, session_id, task_id, run_id, action_id, status, priority, question,
        context, options_json, metadata_json, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, ?, ?)
    `,
  ).run(
    id,
    alias,
    project.id,
    sessionId,
    taskId,
    run?.id ?? null,
    action?.id ?? null,
    priority,
    question,
    input.context ?? "",
    serializeDecisionOptions(input.options ?? []),
    JSON.stringify(metadata),
    now,
    now,
  );
  return requireDecision(db, alias);
}

export function addDecision(db: Database, projectRef: string, input: DecisionCreateInput): Decision {
  return createDecision(db, projectRef, input);
}

export function listDecisions(db: Database, projectRef: string, filter: DecisionListFilter = {}): Decision[] {
  const project = requireProject(db, projectRef);
  const params: SqlValue[] = [project.id];
  let sql = "SELECT * FROM decisions WHERE project_id = ?";
  if (filter.status !== undefined) {
    sql += " AND status = ?";
    params.push(parseDecisionStatus(filter.status));
  }
  if (filter.taskRef !== undefined) {
    sql += " AND task_id = ?";
    params.push(resolveTaskId(db, project.id, filter.taskRef));
  }
  if (filter.runRef !== undefined) {
    sql += " AND run_id = ?";
    params.push(requireAgentRunInProject(db, project.id, filter.runRef).id);
  }
  if (filter.actionRef !== undefined) {
    sql += " AND action_id = ?";
    params.push(requireAgentActionInProject(db, project.id, filter.actionRef).id);
  }
  sql += `
    ORDER BY
      CASE status WHEN 'open' THEN 0 WHEN 'answered' THEN 1 ELSE 2 END,
      priority DESC,
      created_at ASC,
      alias ASC
  `;
  return (db.query(sql).all(...params) as DecisionRow[]).map(decisionFromRow);
}

export function requireDecision(db: Database, decisionRef: string): Decision {
  const row = db.query("SELECT * FROM decisions WHERE id = ? OR alias = ?").get(decisionRef, decisionRef) as DecisionRow | null;
  if (row === null) {
    throw notFound("Decision not found.", { decisionRef });
  }
  return decisionFromRow(row);
}

export function updateDecision(db: Database, projectRef: string, decisionRef: string, input: DecisionUpdateInput): Decision {
  const project = requireProject(db, projectRef);
  const decision = requireDecisionInProject(db, project.id, decisionRef);
  const now = new Date().toISOString();
  const fields: Array<[string, SqlValue]> = [];
  if (input.question !== undefined) fields.push(["question", requireNonEmpty(input.question, "Decision question")]);
  if (input.context !== undefined) fields.push(["context", input.context]);
  if (input.options !== undefined) fields.push(["options_json", serializeDecisionOptions(input.options)]);
  if (input.priority !== undefined) {
    assertPriority(input.priority);
    fields.push(["priority", input.priority]);
  }
  const metadata = decisionMetadata(input, decision.metadata);
  if (Object.keys(metadata).length > 0) fields.push(["metadata_json", JSON.stringify(metadata)]);
  updateColumns(db, "decisions", decision.id, fields, now);
  return requireDecision(db, decision.id);
}

export function answerDecision(
  db: Database,
  projectRef: string,
  decisionRef: string,
  input: string | { answer: string; resolvedBy?: string; answerSource?: string },
): Decision {
  const project = requireProject(db, projectRef);
  const decision = requireOpenDecision(db, project.id, decisionRef);
  const cleanAnswer = requireNonEmpty(typeof input === "string" ? input : input.answer, "Decision answer");
  const resolvedBy = typeof input === "string" ? "user" : input.resolvedBy ?? input.answerSource ?? "user";
  const now = new Date().toISOString();
  db.query(
    `
      UPDATE decisions
      SET status = 'answered',
          answer = ?,
          dismissed_reason = NULL,
          resolved_by = ?,
          resolved_at = ?,
          updated_at = ?
      WHERE id = ?
    `,
  ).run(cleanAnswer, resolvedBy, now, now, decision.id);
  return requireDecision(db, decision.id);
}

export function dismissDecision(
  db: Database,
  projectRef: string,
  decisionRef: string,
  input: string | { reason?: string; resolvedBy?: string } | undefined = undefined,
): Decision {
  const project = requireProject(db, projectRef);
  const decision = requireOpenDecision(db, project.id, decisionRef);
  const reason = typeof input === "string" ? input : input?.reason;
  const resolvedBy = typeof input === "string" ? "user" : input?.resolvedBy ?? "user";
  const now = new Date().toISOString();
  db.query(
    `
      UPDATE decisions
      SET status = 'dismissed',
          answer = NULL,
          dismissed_reason = ?,
          resolved_by = ?,
          resolved_at = ?,
          updated_at = ?
      WHERE id = ?
    `,
  ).run(reason ?? null, resolvedBy, now, now, decision.id);
  return requireDecision(db, decision.id);
}

function agentRunUpdateFields(run: AgentRun, input: AgentRunUpdateInput, now: string): Array<[string, SqlValue]> {
  const fields: Array<[string, SqlValue]> = [];
  if (input.status !== undefined) {
    const status = parseAgentRunStatus(input.status);
    fields.push(["status", status]);
    if (status === "running" && input.startedAt === undefined && run.startedAt === null) fields.push(["started_at", now]);
    if (terminalAgentRunStatuses.has(status) && input.completedAt === undefined) fields.push(["completed_at", now]);
  }
  if (input.summary !== undefined) fields.push(["summary", input.summary]);
  const metadata = agentRunMetadata(input, run.metadata);
  if (Object.keys(metadata).length > 0) fields.push(["metadata_json", JSON.stringify(metadata)]);
  if (input.startedAt !== undefined) fields.push(["started_at", input.startedAt]);
  if (input.completedAt !== undefined) fields.push(["completed_at", input.completedAt]);
  return fields;
}

function requireAgentRunInProject(db: Database, projectId: string, runRef: string): AgentRun {
  const run = requireAgentRun(db, runRef);
  if (run.projectId !== projectId) throw notFound("Agent run is not in selected project.", { runRef });
  return run;
}

function requireAgentActionInProject(db: Database, projectId: string, actionRef: string): AgentAction {
  const action = requireAgentAction(db, actionRef);
  if (action.projectId !== projectId) throw notFound("Agent action is not in selected project.", { actionRef });
  return action;
}

function requireDecisionInProject(db: Database, projectId: string, decisionRef: string): Decision {
  const decision = requireDecision(db, decisionRef);
  if (decision.projectId !== projectId) throw notFound("Decision is not in selected project.", { decisionRef });
  return decision;
}

function requireOpenDecision(db: Database, projectId: string, decisionRef: string): Decision {
  const decision = requireDecisionInProject(db, projectId, decisionRef);
  if (decision.status !== "open") throw transitionRejected("Decision is already resolved.", { decisionRef, status: decision.status });
  return decision;
}

function resolveTaskId(db: Database, projectId: string, taskRef: string | undefined): string | null {
  if (taskRef === undefined) return null;
  const task = requireTask(db, taskRef);
  if (task.projectId !== projectId) throw notFound("Task is not in selected project.", { taskRef });
  return task.id;
}

function resolveSessionId(db: Database, projectId: string, sessionRef: string | undefined): string | null {
  if (sessionRef === undefined) return null;
  const session = requireSession(db, sessionRef);
  if (session.projectId !== projectId) throw notFound("Session is not in selected project.", { sessionRef });
  return session.id;
}

function resolveActionTaskId(db: Database, projectId: string, taskRef: string | undefined, run: AgentRun): string | null {
  const explicitTaskId = resolveTaskId(db, projectId, taskRef);
  if (explicitTaskId !== null && run.taskId !== null && explicitTaskId !== run.taskId) {
    throw usageError("Agent action task does not match agent run task.", { taskRef, runRef: run.alias });
  }
  return explicitTaskId ?? run.taskId;
}

function resolveDecisionRun(db: Database, projectId: string, runRef: string | undefined, action: AgentAction | null): AgentRun | null {
  const run = runRef === undefined ? (action === null ? null : requireAgentRunInProject(db, projectId, action.runId)) : requireAgentRunInProject(db, projectId, runRef);
  if (run !== null && action !== null && action.runId !== run.id) {
    throw usageError("Decision action does not belong to selected agent run.", { runRef: run.alias, actionRef: action.alias });
  }
  return run;
}

function resolveDecisionTaskId(db: Database, projectId: string, taskRef: string | undefined, run: AgentRun | null, action: AgentAction | null): string | null {
  const explicitTaskId = resolveTaskId(db, projectId, taskRef);
  const linkedTaskId = action?.taskId ?? run?.taskId ?? null;
  if (explicitTaskId !== null && linkedTaskId !== null && explicitTaskId !== linkedTaskId) {
    throw usageError("Decision task does not match linked agent context.", { taskRef });
  }
  return explicitTaskId ?? linkedTaskId;
}

function nextAgentActionSequence(db: Database, runId: string): number {
  const row = db.query("SELECT MAX(sequence) as maxSequence FROM agent_actions WHERE run_id = ?").get(runId) as { maxSequence: number | null };
  return (row.maxSequence ?? 0) + 1;
}

type AutonomyTable = "agent_runs" | "agent_actions" | "decisions";

const aliasPrefixes: Record<AutonomyTable, string> = {
  agent_runs: "ar",
  agent_actions: "aa",
  decisions: "d",
};

function nextAutonomyAlias(db: Database, table: AutonomyTable): string {
  const prefix = aliasPrefixes[table];
  const rows = db.query(`SELECT alias FROM ${table} WHERE alias LIKE ?`).all(`${prefix}_%`) as Array<{ alias: string }>;
  const max = rows.reduce((currentMax, row) => {
    const suffix = new RegExp(`^${prefix}_(\\d+)$`).exec(row.alias)?.[1];
    return suffix === undefined ? currentMax : Math.max(currentMax, Number(suffix));
  }, 0);
  return `${prefix}_${String(max + 1).padStart(3, "0")}`;
}

function updateColumns(db: Database, table: AutonomyTable, id: string, fields: Array<[string, SqlValue]>, updatedAt: string): void {
  if (fields.length === 0) throw usageError("No update fields provided.", { table });
  const sets = fields.map(([column]) => `${column} = ?`);
  const params = fields.map(([, value]) => value);
  sets.push("updated_at = ?");
  params.push(updatedAt, id);
  db.query(`UPDATE ${table} SET ${sets.join(", ")} WHERE id = ?`).run(...params);
}

function agentRunMetadata(input: AgentRunCreateInput | AgentRunUpdateInput, base: Record<string, unknown> = {}): Record<string, unknown> {
  const metadata = { ...base, ...(input.metadata ?? {}) };
  if (input.model !== undefined) metadata["model"] = input.model;
  if (input.worktreePath !== undefined) metadata["worktreePath"] = input.worktreePath;
  if (input.branchName !== undefined) metadata["branchName"] = input.branchName;
  if (input.pid !== undefined) metadata["pid"] = input.pid;
  if (input.autonomyBudget !== undefined) metadata["autonomyBudget"] = input.autonomyBudget;
  if ("detail" in input && input.detail !== undefined) metadata["detail"] = input.detail;
  return metadata;
}

function agentActionPayload(input: AgentActionCreateInput | AgentActionUpdateInput, base: Record<string, unknown> = {}): Record<string, unknown> {
  const payload = { ...base, ...(input.payload ?? {}) };
  if (input.currentFile !== undefined) payload["currentFile"] = input.currentFile;
  if (input.command !== undefined) payload["command"] = input.command;
  if (input.progress !== undefined) payload["progress"] = input.progress;
  return payload;
}

function decisionMetadata(input: DecisionCreateInput | DecisionUpdateInput, base: Record<string, unknown> = {}): Record<string, unknown> {
  const payload = "payload" in input ? input.payload ?? {} : {};
  const metadata = { ...base, ...(input.metadata ?? {}), ...payload };
  if (input.type !== undefined) metadata["type"] = parseDecisionType(input.type);
  if (input.recommendedOption !== undefined) metadata["recommendedOption"] = input.recommendedOption;
  if (input.required !== undefined) metadata["required"] = input.required;
  return metadata;
}

function serializeDecisionOptions(options: DecisionOption[]): string {
  return JSON.stringify(
    options.map((option) => ({
      id: requireNonEmpty(option.id, "Decision option id"),
      label: requireNonEmpty(option.label, "Decision option label"),
      ...(option.description === undefined ? {} : { description: option.description }),
      ...(option.consequence === undefined ? {} : { consequence: option.consequence }),
    })),
  );
}

function normalizeAgentRole(role: string): string {
  const clean = requireNonEmpty(role, "Agent role");
  if (clean === "main" || clean === "user" || clean.startsWith("subagent:")) return clean;
  return `subagent:${clean}`;
}

function requireNonEmpty(value: string, label: string): string {
  const clean = value.trim();
  if (clean.length === 0) throw usageError(`${label} cannot be empty.`);
  return clean;
}

function assertSequence(sequence: number): void {
  if (!Number.isInteger(sequence) || sequence < 1) throw usageError("Agent action sequence must be a positive integer.", { sequence });
}

function assertPriority(priority: number): void {
  if (!Number.isInteger(priority)) throw usageError("Decision priority must be an integer.", { priority });
}

function parseAgentRunStatus(status: string): AgentRunStatus {
  const normalized = status === "done" ? "completed" : status;
  if (!agentRunStatuses.has(normalized as AgentRunStatus)) throw usageError("Unsupported agent run status.", { status });
  return normalized as AgentRunStatus;
}

function parseAgentActionType(type: string): AgentActionType {
  if (!agentActionTypes.has(type as AgentActionType)) throw usageError("Unsupported agent action type.", { type });
  return type as AgentActionType;
}

function parseAgentActionStatus(status: string): AgentActionStatus {
  if (!agentActionStatuses.has(status as AgentActionStatus)) throw usageError("Unsupported agent action status.", { status });
  return status as AgentActionStatus;
}

function parseDecisionStatus(status: string): DecisionStatus {
  if (!decisionStatuses.has(status as DecisionStatus)) throw usageError("Unsupported decision status.", { status });
  return status as DecisionStatus;
}

function parseDecisionType(type: string): DecisionType {
  if (!decisionTypes.has(type as DecisionType)) throw usageError("Unsupported decision type.", { type });
  return type as DecisionType;
}
