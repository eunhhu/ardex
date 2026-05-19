import type {
  AgentAction,
  AgentActionStatus,
  AgentActionType,
  AgentRun,
  AgentRunStatus,
  Ask,
  Decision,
  DecisionOption,
  DecisionStatus,
  Evidence,
  FileScaleFinding,
  Project,
  ScaleEstimate,
  Session,
  Task,
  TaskEvent,
} from "./types.ts";

export type ProjectRow = {
  id: string;
  alias: string;
  path: string;
  name: string;
  codex_project_key: string | null;
  default_workflow: string;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export type SessionRow = {
  id: string;
  alias: string;
  project_id: string;
  thread_id: string | null;
  status: string;
  previous_status: string | null;
  current_task_id: string | null;
  goal: string | null;
  mode: string;
  model: string | null;
  next_expected_action: string | null;
  started_at: string;
  last_seen_at: string;
  ended_at: string | null;
  runtime_seconds: number;
};

export type TaskRow = {
  id: string;
  alias: string;
  project_id: string;
  session_id: string | null;
  feature_id: string | null;
  title: string;
  content: string;
  status: string;
  progress: number;
  priority: number;
  importance: number;
  owner: string;
  quality_gate: string;
  estimated_weight: number | null;
  context_risk: number | null;
  started_at: string | null;
  paused_at: string | null;
  resumed_at: string | null;
  active_seconds: number;
  pause_reason: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

export type TaskEventRow = {
  id: string;
  alias: string;
  project_id: string;
  session_id: string | null;
  task_id: string | null;
  task_alias: string;
  type: string;
  summary: string;
  payload_json: string;
  created_at: string;
};

export type AgentRunRow = {
  id: string;
  alias: string;
  project_id: string;
  session_id: string | null;
  task_id: string | null;
  agent_role: string;
  status: AgentRunStatus;
  goal: string;
  summary: string;
  metadata_json: string;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type AgentActionRow = {
  id: string;
  alias: string;
  project_id: string;
  session_id: string | null;
  task_id: string | null;
  run_id: string;
  sequence: number;
  type: AgentActionType;
  status: AgentActionStatus;
  title: string;
  summary: string;
  payload_json: string;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type DecisionRow = {
  id: string;
  alias: string;
  project_id: string;
  session_id: string | null;
  task_id: string | null;
  run_id: string | null;
  action_id: string | null;
  status: DecisionStatus;
  priority: number;
  question: string;
  context: string;
  options_json: string;
  answer: string | null;
  dismissed_reason: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  metadata_json: string;
  created_at: string;
  updated_at: string;
};

export type EvidenceRow = {
  id: string;
  alias: string;
  project_id: string;
  session_id: string | null;
  target_type: string;
  target_id: string | null;
  type: string;
  status: string;
  summary: string;
  payload_json: string;
  created_at: string;
};

export type AskRow = {
  id: string;
  alias: string;
  project_id: string;
  session_id: string | null;
  question: string;
  answer: string | null;
  answer_source: string | null;
  attachments_json: string;
  status: string;
  created_at: string;
  answered_at: string | null;
};

export type ScaleEstimateRow = {
  id: string;
  alias: string;
  project_id: string;
  session_id: string | null;
  target_type: string;
  target_id: string | null;
  weight: number;
  complexity: string;
  context_risk: number;
  modularity_risk: number;
  recommended_agent: string;
  recommended_split_json: string | null;
  basis: string;
  created_by: string;
  created_at: string;
};

export type FileScaleFindingRow = {
  id: string;
  alias: string;
  project_id: string;
  path: string;
  line_count: number;
  byte_count: number;
  content_hash: string;
  mtime_ms: number;
  role: string;
  severity: string;
  reason: string;
  recommendation: string;
  waived_at: string | null;
  waived_reason: string | null;
  waiver_hash: string | null;
  created_at: string;
};

export function projectFromRow(row: ProjectRow): Project {
  return {
    id: row.id,
    alias: row.alias,
    path: row.path,
    name: row.name,
    codexProjectKey: row.codex_project_key,
    defaultWorkflow: row.default_workflow,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function sessionFromRow(row: SessionRow): Session {
  return {
    id: row.id,
    alias: row.alias,
    projectId: row.project_id,
    threadId: row.thread_id,
    status: row.status,
    previousStatus: row.previous_status,
    currentTaskId: row.current_task_id,
    goal: row.goal,
    mode: row.mode,
    model: row.model,
    nextExpectedAction: row.next_expected_action,
    startedAt: row.started_at,
    lastSeenAt: row.last_seen_at,
    endedAt: row.ended_at,
    runtimeSeconds: row.runtime_seconds,
  };
}

export function taskFromRow(row: TaskRow): Task {
  return {
    id: row.id,
    alias: row.alias,
    projectId: row.project_id,
    sessionId: row.session_id,
    featureId: row.feature_id,
    title: row.title,
    content: row.content,
    status: row.status,
    progress: row.progress,
    priority: row.priority,
    importance: row.importance,
    owner: row.owner,
    qualityGate: row.quality_gate,
    estimatedWeight: row.estimated_weight,
    contextRisk: row.context_risk,
    startedAt: row.started_at,
    pausedAt: row.paused_at,
    resumedAt: row.resumed_at,
    activeSeconds: row.active_seconds,
    pauseReason: row.pause_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
  };
}

export function taskEventFromRow(row: TaskEventRow): TaskEvent {
  return {
    id: row.id,
    alias: row.alias,
    projectId: row.project_id,
    sessionId: row.session_id,
    taskId: row.task_id,
    taskAlias: row.task_alias,
    type: row.type,
    summary: row.summary,
    payload: parseJsonObject(row.payload_json),
    createdAt: row.created_at,
  };
}

export function agentRunFromRow(row: AgentRunRow): AgentRun {
  const metadata = parseJsonObject(row.metadata_json);
  return {
    id: row.id,
    alias: row.alias,
    projectId: row.project_id,
    sessionId: row.session_id,
    taskId: row.task_id,
    agentRole: row.agent_role,
    owner: row.agent_role,
    status: row.status,
    goal: row.goal,
    summary: row.summary,
    metadata,
    pid: numberFromValue(metadata["pid"]),
    worktreePath: stringFromValue(metadata["worktreePath"]),
    branchName: stringFromValue(metadata["branchName"]),
    model: stringFromValue(metadata["model"]),
    autonomyBudget: recordFromValue(metadata["autonomyBudget"]),
    startedAt: row.started_at,
    lastSeenAt: row.updated_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function agentActionFromRow(row: AgentActionRow): AgentAction {
  const payload = parseJsonObject(row.payload_json);
  return {
    id: row.id,
    alias: row.alias,
    projectId: row.project_id,
    sessionId: row.session_id,
    taskId: row.task_id,
    runId: row.run_id,
    sequence: row.sequence,
    type: row.type,
    kind: row.type,
    status: row.status,
    title: row.title,
    summary: row.summary,
    payload,
    currentFile: stringFromValue(payload["currentFile"] ?? payload["file"]),
    command: stringFromValue(payload["command"] ?? payload["cmd"]),
    progress: numberFromValue(payload["progress"]),
    startedAt: row.started_at,
    endedAt: row.completed_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function decisionFromRow(row: DecisionRow): Decision {
  const metadata = parseJsonObject(row.metadata_json);
  return {
    id: row.id,
    alias: row.alias,
    projectId: row.project_id,
    sessionId: row.session_id,
    taskId: row.task_id,
    runId: row.run_id,
    agentRunId: row.run_id,
    actionId: row.action_id,
    type: decisionTypeFromValue(metadata["type"]),
    status: row.status,
    priority: row.priority,
    question: row.question,
    context: row.context,
    options: parseDecisionOptions(row.options_json),
    recommendedOption: stringFromValue(metadata["recommendedOption"]),
    required: booleanFromValue(metadata["required"]) ?? row.priority > 0,
    answer: row.answer,
    dismissedReason: row.dismissed_reason,
    resolvedBy: row.resolved_by,
    resolvedAt: row.resolved_at,
    answeredAt: row.resolved_at,
    metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function evidenceFromRow(row: EvidenceRow): Evidence {
  return {
    id: row.id,
    alias: row.alias,
    projectId: row.project_id,
    sessionId: row.session_id,
    targetType: row.target_type,
    targetId: row.target_id,
    type: row.type,
    status: row.status,
    summary: row.summary,
    payload: parseJsonObject(row.payload_json),
    createdAt: row.created_at,
  };
}

export function askFromRow(row: AskRow): Ask {
  return {
    id: row.id,
    alias: row.alias,
    projectId: row.project_id,
    sessionId: row.session_id,
    question: row.question,
    answer: row.answer,
    answerSource: row.answer_source,
    attachments: parseJsonArray(row.attachments_json),
    status: row.status,
    createdAt: row.created_at,
    answeredAt: row.answered_at,
  };
}

export function scaleEstimateFromRow(row: ScaleEstimateRow): ScaleEstimate {
  return {
    id: row.id,
    alias: row.alias,
    projectId: row.project_id,
    sessionId: row.session_id,
    targetType: row.target_type,
    targetId: row.target_id,
    weight: row.weight,
    complexity: row.complexity,
    contextRisk: row.context_risk,
    modularityRisk: row.modularity_risk,
    recommendedAgent: row.recommended_agent,
    recommendedSplit: row.recommended_split_json === null ? null : parseJsonObject(row.recommended_split_json),
    basis: row.basis,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

export function fileScaleFindingFromRow(row: FileScaleFindingRow): FileScaleFinding {
  return {
    id: row.id,
    alias: row.alias,
    projectId: row.project_id,
    path: row.path,
    lineCount: row.line_count,
    byteCount: row.byte_count,
    contentHash: row.content_hash,
    mtimeMs: row.mtime_ms,
    role: row.role,
    severity: row.severity,
    reason: row.reason,
    recommendation: row.recommendation,
    waivedAt: row.waived_at,
    waivedReason: row.waived_reason,
    waiverHash: row.waiver_hash,
    createdAt: row.created_at,
  };
}

function parseJsonObject(raw: string): Record<string, unknown> {
  const parsed = JSON.parse(raw) as unknown;
  return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
}

function parseJsonArray(raw: string): string[] {
  const parsed = JSON.parse(raw) as unknown;
  return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
}

function parseDecisionOptions(raw: string): DecisionOption[] {
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) {
    return [];
  }
  return parsed.filter((item): item is DecisionOption => {
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      return false;
    }
    const option = item as Record<string, unknown>;
    return (
      typeof option["id"] === "string" &&
      typeof option["label"] === "string" &&
      (option["description"] === undefined || typeof option["description"] === "string")
    );
  });
}

function stringFromValue(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function numberFromValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function booleanFromValue(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function recordFromValue(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function decisionTypeFromValue(value: unknown): Decision["type"] {
  if (
    value === "product_choice" ||
    value === "visual_approval" ||
    value === "scope_change" ||
    value === "risk_waiver" ||
    value === "merge_approval" ||
    value === "deployment_approval"
  ) {
    return value;
  }
  return null;
}
