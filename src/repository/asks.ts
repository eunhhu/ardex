import { Database } from "bun:sqlite";
import { notFound } from "../errors.ts";
import { createId, nextAlias } from "../ids.ts";
import { requireProject } from "./projects.ts";
import { findCurrentSessionId, syncSessionWorkflow } from "./sessions.ts";
import { type Ask } from "./types.ts";
import { type AskRow, askFromRow } from "./rows.ts";

export function addAsk(
  db: Database,
  projectRef: string,
  input: { question: string; answer?: string; answerSource?: "user" | "assumed" | "known"; attachments?: string[] },
): Ask {
  const project = requireProject(db, projectRef);
  const sessionId = findCurrentSessionId(db, project.id);
  const id = createId();
  const alias = nextAlias(db, "asks");
  const now = new Date().toISOString();
  const status = input.answer === undefined ? "open" : "answered";
  const answeredAt = input.answer === undefined ? null : now;
  const answerSource = input.answer === undefined ? null : input.answerSource ?? "assumed";

  db.query(
    `
      INSERT INTO asks (
        id, alias, project_id, session_id, question, answer, answer_source, attachments_json, status, created_at, answered_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
  ).run(
    id,
    alias,
    project.id,
    sessionId,
    input.question,
    input.answer ?? null,
    answerSource,
    JSON.stringify(input.attachments ?? []),
    status,
    now,
    answeredAt,
  );

  if (status === "open" && sessionId !== null) {
    db.query("UPDATE sessions SET previous_status = status, status = 'blocked', last_seen_at = ? WHERE id = ?").run(now, sessionId);
  }

  return requireAsk(db, alias);
}

export function listAsks(db: Database, projectRef: string, status?: string): Ask[] {
  const project = requireProject(db, projectRef);
  const rows =
    status === undefined
      ? (db.query("SELECT * FROM asks WHERE project_id = ? ORDER BY created_at DESC").all(project.id) as AskRow[])
      : (db.query("SELECT * FROM asks WHERE project_id = ? AND status = ? ORDER BY created_at DESC").all(project.id, status) as AskRow[]);
  return rows.map(askFromRow);
}

export function requireAsk(db: Database, askRef: string): Ask {
  const row = db.query("SELECT * FROM asks WHERE id = ? OR alias = ?").get(askRef, askRef) as AskRow | null;
  if (row === null) {
    throw notFound("Ask not found.", { askRef });
  }
  return askFromRow(row);
}

export function answerAsk(db: Database, projectRef: string, askRef: string, answer: string): Ask {
  const project = requireProject(db, projectRef);
  const ask = requireAsk(db, askRef);
  if (ask.projectId !== project.id) {
    throw notFound("Ask is not in selected project.", { projectRef, askRef });
  }

  const now = new Date().toISOString();
  db.query("UPDATE asks SET answer = ?, answer_source = 'user', status = 'answered', answered_at = ? WHERE id = ?").run(answer, now, ask.id);
  clearBlockedSessionIfNoOpenAsks(db, project.id, now);
  syncSessionWorkflow(db, project.alias, "statement");
  return requireAsk(db, ask.id);
}

function clearBlockedSessionIfNoOpenAsks(db: Database, projectId: string, now: string): void {
  const openAsks = db.query("SELECT COUNT(*) as count FROM asks WHERE project_id = ? AND status = 'open'").get(projectId) as {
    count: number;
  };
  if (openAsks.count > 0) {
    return;
  }

  const resumeTask = db
    .query(
      `
        SELECT alias FROM tasks
        WHERE project_id = ? AND status IN ('active', 'paused', 'blocked', 'review')
        ORDER BY updated_at DESC
        LIMIT 1
      `,
    )
    .get(projectId) as { alias: string } | null;

  db.query(
    `
      UPDATE sessions
      SET status = COALESCE(previous_status, 'planning'),
          previous_status = NULL,
          next_expected_action = COALESCE(?, next_expected_action),
          last_seen_at = ?
      WHERE project_id = ? AND status = 'blocked'
    `,
  ).run(resumeTask === null ? null : `resume:${resumeTask.alias}`, now, projectId);
}
