import { Database } from "bun:sqlite";
import { notFound, usageError } from "../errors.ts";
import { createId, nextAlias } from "../ids.ts";
import { sanitizeEvidencePayload, sanitizeEvidenceSummary } from "../redaction.ts";
import { requireProject } from "./projects.ts";
import { requireSession, findCurrentSessionId } from "./sessions.ts";
import { requireTask } from "./tasks.ts";
import { type Evidence } from "./types.ts";
import { type EvidenceRow, evidenceFromRow } from "./rows.ts";

export function addEvidence(
  db: Database,
  projectRef: string,
  input: {
    type: string;
    targetType: string;
    targetRef?: string;
    summary: string;
    payload?: Record<string, unknown>;
    status?: string;
  },
): Evidence {
  const project = requireProject(db, projectRef);
  const targetId = resolveEvidenceTargetId(db, project.id, input.targetType, input.targetRef);
  const sessionId = findCurrentSessionId(db, project.id);
  const id = createId();
  const alias = nextAlias(db, "evidence");
  const now = new Date().toISOString();
  const payload = sanitizeEvidencePayload(input.payload ?? {});
  const summary = sanitizeEvidenceSummary(input.summary);

  db.query(
    `
      INSERT INTO evidence (
        id, alias, project_id, session_id, target_type, target_id, type, status, summary, payload_json, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
  ).run(id, alias, project.id, sessionId, input.targetType, targetId, input.type, input.status ?? "accepted", summary, JSON.stringify(payload), now);

  return requireEvidence(db, alias);
}

export function listEvidence(
  db: Database,
  projectRef: string,
  filter: { taskRef?: string; featureRef?: string; status?: string } = {},
): Evidence[] {
  const project = requireProject(db, projectRef);
  let sql = "SELECT * FROM evidence WHERE project_id = ?";
  const params: Array<string> = [project.id];

  if (filter.taskRef !== undefined) {
    sql += " AND target_type = 'task' AND target_id = ?";
    params.push(requireTask(db, filter.taskRef).id);
  }
  if (filter.featureRef !== undefined) {
    sql += " AND target_type = 'feature' AND target_id = ?";
    params.push(filter.featureRef);
  }
  if (filter.status !== undefined) {
    sql += " AND status = ?";
    params.push(filter.status);
  }
  sql += " ORDER BY created_at DESC";

  const rows = db.query(sql).all(...params) as EvidenceRow[];
  return rows.map(evidenceFromRow);
}

export function requireEvidence(db: Database, evidenceRef: string): Evidence {
  const row = db.query("SELECT * FROM evidence WHERE id = ? OR alias = ?").get(evidenceRef, evidenceRef) as EvidenceRow | null;
  if (row === null) {
    throw notFound("Evidence not found.", { evidenceRef });
  }
  return evidenceFromRow(row);
}

export function setEvidenceStatus(
  db: Database,
  projectRef: string,
  evidenceRef: string,
  status: "accepted" | "rejected",
  input: { comment?: string } = {},
): Evidence {
  const project = requireProject(db, projectRef);
  const evidence = requireEvidence(db, evidenceRef);
  if (evidence.projectId !== project.id) {
    throw notFound("Evidence is not in selected project.", { projectRef, evidenceRef });
  }
  const payload = sanitizeEvidencePayload({
    ...evidence.payload,
    reviewComment: input.comment ?? evidence.payload["reviewComment"],
    reviewedAt: new Date().toISOString(),
  });
  db.query("UPDATE evidence SET status = ?, payload_json = ? WHERE id = ?").run(status, JSON.stringify(payload), evidence.id);
  return requireEvidence(db, evidence.id);
}

function resolveEvidenceTargetId(db: Database, projectId: string, targetType: string, targetRef?: string): string | null {
  if (targetType === "session") {
    return targetRef === undefined ? findCurrentSessionId(db, projectId) : requireSession(db, targetRef).id;
  }
  if (targetType === "task") {
    if (targetRef === undefined) {
      throw usageError("Task evidence requires a task target.");
    }
    const task = requireTask(db, targetRef);
    if (task.projectId !== projectId) {
      throw notFound("Task is not in selected project.", { targetRef });
    }
    return task.id;
  }
  if (targetType === "feature" || targetType === "file") {
    return targetRef ?? null;
  }
  throw usageError("Unsupported evidence target type.", { targetType });
}
