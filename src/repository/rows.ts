import type { Ask, Evidence, FileScaleFinding, Project, ScaleEstimate, Session, Task, TaskEvent } from "./types.ts";

export type ProjectRow = {
  id: string;
  alias: string;
  path: string;
  name: string;
  codex_project_key: string | null;
  default_workflow: string;
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
