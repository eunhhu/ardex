import { Database } from "bun:sqlite";
import { notFound, transitionRejected, usageError } from "../errors.ts";
import { createId, nextAlias } from "../ids.ts";
import { requireProject } from "./projects.ts";
import { assertImplementationScaleGate } from "./scale.ts";
import { type Session } from "./types.ts";
import { type SessionRow, sessionFromRow } from "./rows.ts";

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
