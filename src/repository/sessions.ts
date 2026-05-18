import { Database } from "bun:sqlite";
import { notFound, transitionRejected, usageError } from "../errors.ts";
import { createId, nextAlias } from "../ids.ts";
import { requireProject } from "./projects.ts";
import { assertImplementationScaleGate } from "./scale.ts";
import { type AgentActivity, type Session } from "./types.ts";
import { type SessionRow, sessionFromRow } from "./rows.ts";

export type WorkflowEvent =
  | "statement"
  | "scale_checked"
  | "task_claimed"
  | "task_progress"
  | "task_completed"
  | "task_paused"
  | "task_resumed"
  | "task_deleted";

export function listSessions(db: Database, projectRef: string): Session[] {
  const project = requireProject(db, projectRef);
  const rows = db
    .query("SELECT * FROM sessions WHERE project_id = ? ORDER BY started_at DESC")
    .all(project.id) as SessionRow[];
  return rows.map(sessionFromRow);
}

export function startSession(
  db: Database,
  projectRef: string,
  input: { threadId?: string; goal?: string; mode?: string; model?: string },
): Session {
  const project = requireProject(db, projectRef);
  const now = new Date().toISOString();
  const id = createId();
  const alias = nextAlias(db, "sessions");

  db.query(
    `
      INSERT INTO sessions (
        id, alias, project_id, thread_id, status, goal, mode, model, started_at, last_seen_at
      )
      VALUES (?, ?, ?, ?, 'planning', ?, ?, ?, ?, ?)
    `,
  ).run(id, alias, project.id, input.threadId ?? null, input.goal ?? null, input.mode ?? "sdd_vdd", input.model ?? null, now, now);

  return requireSession(db, alias);
}

export function currentSession(db: Database, projectRef: string): Session {
  const project = requireProject(db, projectRef);
  const row = db
    .query(
      `
        SELECT * FROM sessions
        WHERE project_id = ? AND status != 'done'
        ORDER BY last_seen_at DESC
        LIMIT 1
      `,
    )
    .get(project.id) as SessionRow | null;

  if (row === null) {
    throw notFound("No active session found.", { projectId: project.alias });
  }
  return sessionFromRow(row);
}

export function requireSession(db: Database, sessionRef: string): Session {
  const row = db.query("SELECT * FROM sessions WHERE id = ? OR alias = ?").get(sessionRef, sessionRef) as SessionRow | null;
  if (row === null) {
    throw notFound("Session not found.", { sessionRef });
  }
  return sessionFromRow(row);
}

export function setSessionField(db: Database, projectRef: string, field: string, value: string): Session {
  const session = currentSession(db, projectRef);
  const now = new Date().toISOString();
  const allowed: Record<string, string> = {
    status: "status",
    goal: "goal",
    mode: "mode",
    model: "model",
    next: "next_expected_action",
  };
  const column = allowed[field];
  if (column === undefined) {
    throw usageError("Unsupported session field.", { field, allowed: Object.keys(allowed) });
  }
  if (field === "status" && value === "implementing") {
    assertImplementationScaleGate(db, session.projectId);
  }

  db.query(`UPDATE sessions SET ${column} = ?, last_seen_at = ? WHERE id = ?`).run(value, now, session.id);
  return requireSession(db, session.id);
}

export function touchCurrentSession(db: Database, projectRef: string): Session | null {
  const session = currentSessionOrNull(db, projectRef);
  if (session === null) {
    return null;
  }
  const now = new Date().toISOString();
  db.query("UPDATE sessions SET last_seen_at = ? WHERE id = ?").run(now, session.id);
  return requireSession(db, session.id);
}

export function syncSessionWorkflow(db: Database, projectRef: string, event: WorkflowEvent): Session | null {
  const project = requireProject(db, projectRef);
  const session = currentSessionOrNull(db, project.alias);
  if (session === null) {
    return null;
  }

  const now = new Date().toISOString();
  const openAsks = countOpenAsks(db, project.id);
  if (openAsks > 0) {
    db.query(
      `
        UPDATE sessions
        SET previous_status = CASE WHEN status = 'blocked' THEN previous_status ELSE status END,
            status = 'blocked',
            next_expected_action = 'answer_ask',
            last_seen_at = ?
        WHERE id = ?
      `,
    ).run(now, session.id);
    return requireSession(db, session.id);
  }

  const activeTask = currentOrLatestOpenTask(db, project.id, session.currentTaskId);
  const latestScale = latestScaleState(db, project.id);
  const openTasks = countOpenTasks(db, project.id, session.id);
  const totalTasks = countSessionTasks(db, project.id, session.id);
  const desired = desiredWorkflowStatus(event, activeTask, latestScale, openTasks, totalTasks);
  const nextExpectedAction = desiredNextAction(event, desired, activeTask, openTasks);

  db.query(
    `
      UPDATE sessions
      SET status = ?,
          previous_status = NULL,
          current_task_id = ?,
          next_expected_action = ?,
          last_seen_at = ?
      WHERE id = ?
    `,
  ).run(desired, activeTask?.id ?? null, nextExpectedAction, now, session.id);
  return requireSession(db, session.id);
}

export function sessionAgentActivity(session: Session, now = new Date()): AgentActivity {
  const lastSeenMs = Date.parse(session.lastSeenAt);
  const staleSeconds = Number.isFinite(lastSeenMs) ? Math.max(0, Math.floor((now.getTime() - lastSeenMs) / 1000)) : Number.MAX_SAFE_INTEGER;
  const activeStatus = !["done", "idle", "blocked"].includes(session.status);
  return {
    state: activeStatus && staleSeconds <= 90 ? "running" : "idle",
    lastSeenAt: session.lastSeenAt,
    staleSeconds,
  };
}

export function completeSession(db: Database, projectRef: string): Session {
  const session = currentSession(db, projectRef);
  const openTasks = db
    .query("SELECT COUNT(*) as count FROM tasks WHERE session_id = ? AND status NOT IN ('done', 'dropped')")
    .get(session.id) as { count: number };

  if (openTasks.count > 0) {
    throw transitionRejected("Session has open tasks.", { sessionId: session.alias, openTasks: openTasks.count });
  }

  const openAsks = db
    .query("SELECT COUNT(*) as count FROM asks WHERE project_id = ? AND status = 'open'")
    .get(session.projectId) as { count: number };
  if (openAsks.count > 0) {
    throw transitionRejected("Session has open asks.", { sessionId: session.alias, openAsks: openAsks.count });
  }

  const now = new Date().toISOString();
  db.query("UPDATE sessions SET status = 'done', ended_at = ?, last_seen_at = ? WHERE id = ?").run(now, now, session.id);
  return requireSession(db, session.id);
}

export function findCurrentSessionId(db: Database, projectId: string): string | null {
  const row = db
    .query("SELECT id FROM sessions WHERE project_id = ? AND status != 'done' ORDER BY last_seen_at DESC LIMIT 1")
    .get(projectId) as { id: string } | null;
  return row?.id ?? null;
}

function currentSessionOrNull(db: Database, projectRef: string): Session | null {
  try {
    return currentSession(db, projectRef);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "NOT_FOUND") {
      return null;
    }
    throw error;
  }
}

function desiredWorkflowStatus(
  event: WorkflowEvent,
  task: { id: string; alias: string; status: string; progress: number } | null,
  scale: { exists: boolean; blocked: boolean },
  openTasks: number,
  totalTasks: number,
): string {
  if (task !== null) {
    if (task.status === "paused" || task.status === "blocked") {
      return "blocked";
    }
    if (task.progress >= 1 || event === "task_progress") {
      return task.progress >= 1 ? "verifying" : "implementing";
    }
    return "implementing";
  }
  if (event === "task_completed") {
    return openTasks > 0 ? "implementing" : "reviewing";
  }
  if (openTasks === 0 && totalTasks > 0) {
    return "reviewing";
  }
  if (scale.exists) {
    return scale.blocked ? "scaling" : "specifying";
  }
  return "planning";
}

function desiredNextAction(
  event: WorkflowEvent,
  status: string,
  task: { alias: string; status: string; progress: number } | null,
  openTasks: number,
): string | null {
  if (status === "scaling") {
    return "split_or_waive_scale";
  }
  if (status === "specifying") {
    return openTasks > 0 ? "claim_task" : "create_task";
  }
  if (status === "implementing" && task !== null) {
    return `work:${task.alias}`;
  }
  if (status === "verifying" && task !== null) {
    return `verify:${task.alias}`;
  }
  if (status === "reviewing") {
    return "review_session";
  }
  if (status === "blocked" && task !== null) {
    return task.status === "paused" ? `wait_for_resume:${task.alias}` : `unblock:${task.alias}`;
  }
  return null;
}

function currentOrLatestOpenTask(
  db: Database,
  projectId: string,
  currentTaskId: string | null,
): { id: string; alias: string; status: string; progress: number } | null {
  const current =
    currentTaskId === null
      ? null
      : (db
          .query("SELECT id, alias, status, progress FROM tasks WHERE id = ? AND status NOT IN ('done', 'dropped')")
          .get(currentTaskId) as { id: string; alias: string; status: string; progress: number } | null);
  if (current !== null) {
    return current;
  }
  return db
    .query(
      `
        SELECT id, alias, status, progress FROM tasks
        WHERE project_id = ? AND status IN ('active', 'review', 'blocked', 'paused')
        ORDER BY updated_at DESC
        LIMIT 1
      `,
    )
    .get(projectId) as { id: string; alias: string; status: string; progress: number } | null;
}

function latestScaleState(db: Database, projectId: string): { exists: boolean; blocked: boolean } {
  const estimate = db
    .query("SELECT weight FROM scale_estimates WHERE project_id = ? ORDER BY created_at DESC LIMIT 1")
    .get(projectId) as { weight: number } | null;
  if (estimate === null) {
    return { exists: false, blocked: false };
  }
  const blocking = db
    .query(
      `
        SELECT COUNT(*) as count FROM file_scale_findings
        WHERE project_id = ?
          AND severity = 'block'
          AND (waived_at IS NULL OR waiver_hash IS NULL OR waiver_hash != content_hash)
      `,
    )
    .get(projectId) as { count: number };
  return { exists: true, blocked: estimate.weight > 13 || blocking.count > 0 };
}

function countOpenTasks(db: Database, projectId: string, sessionId: string): number {
  const row = db
    .query("SELECT COUNT(*) as count FROM tasks WHERE project_id = ? AND session_id = ? AND status NOT IN ('done', 'dropped')")
    .get(projectId, sessionId) as { count: number };
  return row.count;
}

function countSessionTasks(db: Database, projectId: string, sessionId: string): number {
  const row = db.query("SELECT COUNT(*) as count FROM tasks WHERE project_id = ? AND session_id = ?").get(projectId, sessionId) as { count: number };
  return row.count;
}

function countOpenAsks(db: Database, projectId: string): number {
  const row = db.query("SELECT COUNT(*) as count FROM asks WHERE project_id = ? AND status = 'open'").get(projectId) as { count: number };
  return row.count;
}
