import { Database } from "bun:sqlite";
import { notFound, transitionRejected, usageError } from "../errors.ts";
import { createId, nextAlias } from "../ids.ts";
import { requireProject } from "./projects.ts";
import { currentSession, findCurrentSessionId, syncSessionWorkflow } from "./sessions.ts";
import { assertImplementationScaleGate } from "./scale.ts";
import { assertVisualScenarioReadyForClaim, visualScenarioChecklistItem } from "./visual-scenarios.ts";
import { type Task, type TaskEvent } from "./types.ts";
import { type TaskEventRow, type TaskRow, taskEventFromRow, taskFromRow } from "./rows.ts";

export type ProductionChecklistItem = {
  id: string;
  label: string;
  required: boolean;
  passed: boolean;
  detail: string;
};

export type ProductionChecklist = {
  taskId: string;
  passed: boolean;
  items: ProductionChecklistItem[];
};

export function listTasks(db: Database, projectRef: string): Task[] {
  const project = requireProject(db, projectRef);
  const rows = db.query("SELECT * FROM tasks WHERE project_id = ? ORDER BY priority ASC").all(project.id) as TaskRow[];
  return rows.map(taskFromRow);
}

export function addTask(
  db: Database,
  projectRef: string,
  input: { title: string; content?: string; priority?: number; importance?: number; qualityGate?: string; sessionId?: string },
): Task {
  const project = requireProject(db, projectRef);
  const now = new Date().toISOString();
  const id = createId();
  const alias = nextAlias(db, "tasks");
  const maxPriority = getMaxPriority(db, project.id);
  const priority = clampPriority(input.priority ?? maxPriority + 1, maxPriority + 1);
  const sessionId = input.sessionId ?? findCurrentSessionId(db, project.id);

  db.exec("BEGIN;");
  try {
    shiftPrioritiesForInsert(db, project.id, priority);
    db.query(
      `
        INSERT INTO tasks (
          id, alias, project_id, session_id, title, content, priority, importance, quality_gate, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    ).run(id, alias, project.id, sessionId, input.title, input.content ?? "", priority, input.importance ?? 0.5, input.qualityGate ?? "none", now, now);
    recordTaskEvent(db, {
      projectId: project.id,
      sessionId,
      taskId: id,
      taskAlias: alias,
      type: "created",
      summary: `Task ${alias} created`,
      payload: { title: input.title, priority, qualityGate: input.qualityGate ?? "none" },
      createdAt: now,
    });
    db.exec("COMMIT;");
  } catch (error) {
    db.exec("ROLLBACK;");
    throw error;
  }

  return requireTask(db, alias);
}

export function requireTask(db: Database, taskRef: string): Task {
  const row = db.query("SELECT * FROM tasks WHERE id = ? OR alias = ?").get(taskRef, taskRef) as TaskRow | null;
  if (row === null) {
    throw notFound("Task not found.", { taskRef });
  }
  return taskFromRow(row);
}

export function setTaskField(db: Database, projectRef: string, taskRef: string, field: string, value: string): Task {
  const project = requireProject(db, projectRef);
  const task = requireTask(db, taskRef);
  if (task.projectId !== project.id) {
    throw notFound("Task is not in selected project.", { projectRef, taskRef });
  }
  if (field === "priority") {
    const previousPriority = task.priority;
    moveTaskPriority(db, task.id, Number(value));
    const moved = requireTask(db, task.id);
    recordTaskEvent(db, {
      projectId: project.id,
      sessionId: moved.sessionId,
      taskId: moved.id,
      taskAlias: moved.alias,
      type: "priority_changed",
      summary: `Task ${moved.alias} priority ${previousPriority} -> ${moved.priority}`,
      payload: { previousPriority, priority: moved.priority },
    });
    return requireTask(db, task.id);
  }

  const allowed: Record<string, { column: string; parse: (input: string) => string | number | null }> = {
    title: { column: "title", parse: String },
    content: { column: "content", parse: String },
    status: { column: "status", parse: String },
    progress: { column: "progress", parse: parseRatio },
    importance: { column: "importance", parse: parseRatio },
    owner: { column: "owner", parse: String },
    quality_gate: { column: "quality_gate", parse: String },
    qualityGate: { column: "quality_gate", parse: String },
    estimated_weight: { column: "estimated_weight", parse: Number },
    context_risk: { column: "context_risk", parse: parseRatio },
  };
  const spec = allowed[field];
  if (spec === undefined) {
    throw usageError("Unsupported task field.", { field, allowed: Object.keys(allowed) });
  }

  const now = new Date().toISOString();
  const completedAt = field === "status" && value === "done" ? now : null;
  if (spec.column === "owner") {
    assertOwner(value);
  }
  const parsedValue = spec.column === "content" ? preserveParentTaskMarker(task.content, String(spec.parse(value))) : spec.parse(value);
  db.query(
    `
      UPDATE tasks
      SET ${spec.column} = ?, updated_at = ?, completed_at = COALESCE(?, completed_at)
      WHERE id = ?
    `,
  ).run(parsedValue, now, completedAt, task.id);

  const updated = requireTask(db, task.id);
  if (spec.column === "progress" && updated.sessionId !== null) {
    syncSessionWorkflow(db, project.alias, "task_progress");
  }
  recordTaskEvent(db, {
    projectId: project.id,
    sessionId: updated.sessionId,
    taskId: updated.id,
    taskAlias: updated.alias,
    type: spec.column === "progress" ? "progress" : spec.column === "owner" ? "owner_changed" : "edited",
    summary: `Task ${updated.alias} ${field} updated`,
    payload: { field, value: parsedValue },
    createdAt: now,
  });
  return updated;
}

export function claimTask(db: Database, projectRef: string, taskRef: string): Task {
  const project = requireProject(db, projectRef);
  const task = requireTask(db, taskRef);
  if (task.projectId !== project.id) {
    throw notFound("Task is not in selected project.", { projectRef, taskRef });
  }
  if (task.status === "done" || task.status === "dropped") {
    throw transitionRejected("Closed task cannot be claimed.", { taskId: task.alias, status: task.status });
  }

  const session = currentSession(db, project.alias);
  assertImplementationScaleGate(db, project.id);
  assertVisualScenarioReadyForClaim(db, project.id, task);
  const now = new Date().toISOString();
  db.query(
    `
      UPDATE tasks
      SET status = 'active',
          session_id = ?,
          started_at = COALESCE(started_at, ?),
          resumed_at = ?,
          paused_at = NULL,
          pause_reason = NULL,
          updated_at = ?
      WHERE id = ?
    `,
  ).run(session.id, now, now, now, task.id);
  db.query("UPDATE sessions SET current_task_id = ?, last_seen_at = ? WHERE id = ?").run(task.id, now, session.id);
  const updated = requireTask(db, task.id);
  syncSessionWorkflow(db, project.alias, "task_claimed");
  recordTaskEvent(db, {
    projectId: project.id,
    sessionId: session.id,
    taskId: updated.id,
    taskAlias: updated.alias,
    type: "claimed",
    summary: `Task ${updated.alias} claimed`,
    payload: { owner: updated.owner },
    createdAt: now,
  });
  return updated;
}

export function completeTask(db: Database, projectRef: string, taskRef: string): Task {
  const project = requireProject(db, projectRef);
  const task = requireTask(db, taskRef);
  if (task.projectId !== project.id) {
    throw notFound("Task is not in selected project.", { projectRef, taskRef });
  }
  const checklist = buildProductionChecklist(db, project.alias, task.alias);
  recordTaskEvent(db, {
    projectId: project.id,
    sessionId: task.sessionId,
    taskId: task.id,
    taskAlias: task.alias,
    type: "checklist",
    summary: `Task ${task.alias} production checklist ${checklist.passed ? "passed" : "failed"}`,
    payload: checklist,
  });
  if (!checklist.passed) {
    if (task.progress < 1) {
      throw transitionRejected("Task progress must be 1 before done.", { taskId: task.alias, progress: task.progress });
    }
    throw transitionRejected("Production checklist failed before task done.", {
      taskId: task.alias,
      failed: checklist.items.filter((item) => item.required && !item.passed).map((item) => item.id),
    });
  }

  const now = new Date().toISOString();
  const activeSeconds = runtimeSecondsAt(task, now);
  db.query("UPDATE tasks SET status = 'done', active_seconds = ?, completed_at = ?, updated_at = ? WHERE id = ?").run(activeSeconds, now, now, task.id);
  db.query("UPDATE sessions SET current_task_id = NULL, last_seen_at = ? WHERE current_task_id = ?").run(now, task.id);
  syncSessionWorkflow(db, project.alias, "task_completed");
  const completed = requireTask(db, task.id);
  recordTaskEvent(db, {
    projectId: project.id,
    sessionId: completed.sessionId,
    taskId: completed.id,
    taskAlias: completed.alias,
    type: "completed",
    summary: `Task ${completed.alias} completed`,
    payload: { activeSeconds },
    createdAt: now,
  });
  return completed;
}

export function pauseTask(db: Database, projectRef: string, taskRef: string, reason?: string): Task {
  const project = requireProject(db, projectRef);
  const task = requireTask(db, taskRef);
  if (task.projectId !== project.id) {
    throw notFound("Task is not in selected project.", { projectRef, taskRef });
  }
  if (task.status === "done" || task.status === "dropped") {
    throw transitionRejected("Closed task cannot be paused.", { taskId: task.alias, status: task.status });
  }

  const now = new Date().toISOString();
  const activeSeconds = runtimeSecondsAt(task, now);
  db.query(
    `
      UPDATE tasks
      SET status = 'paused',
          active_seconds = ?,
          paused_at = ?,
          resumed_at = NULL,
          pause_reason = ?,
          updated_at = ?
      WHERE id = ?
    `,
  ).run(activeSeconds, now, reason ?? null, now, task.id);
  db.query("UPDATE sessions SET current_task_id = NULL, last_seen_at = ? WHERE current_task_id = ?").run(now, task.id);
  syncSessionWorkflow(db, project.alias, "task_paused");
  const paused = requireTask(db, task.id);
  recordTaskEvent(db, {
    projectId: project.id,
    sessionId: paused.sessionId,
    taskId: paused.id,
    taskAlias: paused.alias,
    type: "paused",
    summary: `Task ${paused.alias} paused`,
    payload: { reason: reason ?? null, activeSeconds },
    createdAt: now,
  });
  return paused;
}

export function resumeTask(db: Database, projectRef: string, taskRef: string): Task {
  const project = requireProject(db, projectRef);
  const task = requireTask(db, taskRef);
  if (task.projectId !== project.id) {
    throw notFound("Task is not in selected project.", { projectRef, taskRef });
  }
  if (task.status === "done" || task.status === "dropped") {
    throw transitionRejected("Closed task cannot be resumed.", { taskId: task.alias, status: task.status });
  }

  const session = currentSession(db, project.alias);
  const now = new Date().toISOString();
  db.query(
    `
      UPDATE tasks
      SET status = 'active',
          session_id = ?,
          started_at = COALESCE(started_at, ?),
          resumed_at = ?,
          paused_at = NULL,
          pause_reason = NULL,
          updated_at = ?
      WHERE id = ?
    `,
  ).run(session.id, now, now, now, task.id);
  db.query("UPDATE sessions SET current_task_id = ?, last_seen_at = ?, next_expected_action = ? WHERE id = ?").run(
    task.id,
    now,
    `resume:${task.alias}`,
    session.id,
  );
  syncSessionWorkflow(db, project.alias, "task_resumed");
  const resumed = requireTask(db, task.id);
  recordTaskEvent(db, {
    projectId: project.id,
    sessionId: session.id,
    taskId: resumed.id,
    taskAlias: resumed.alias,
    type: "resumed",
    summary: `Task ${resumed.alias} resumed`,
    payload: { owner: resumed.owner },
    createdAt: now,
  });
  return resumed;
}

export function setTaskOwner(db: Database, projectRef: string, taskRef: string, owner: string): Task {
  return setTaskField(db, projectRef, taskRef, "owner", owner);
}

export function deleteTask(db: Database, projectRef: string, taskRef: string): TaskEvent {
  const project = requireProject(db, projectRef);
  const task = requireTask(db, taskRef);
  if (task.projectId !== project.id) {
    throw notFound("Task is not in selected project.", { projectRef, taskRef });
  }
  const now = new Date().toISOString();

  db.exec("BEGIN;");
  try {
    const event = recordTaskEvent(db, {
      projectId: project.id,
      sessionId: task.sessionId,
      taskId: task.id,
      taskAlias: task.alias,
      type: "deleted",
      summary: `Task ${task.alias} deleted`,
      payload: { title: task.title, priority: task.priority },
      createdAt: now,
    });
    db.query("UPDATE sessions SET current_task_id = NULL, last_seen_at = ? WHERE current_task_id = ?").run(now, task.id);
    db.query("DELETE FROM tasks WHERE id = ?").run(task.id);
    compactPrioritiesAfterDelete(db, project.id, task.priority, now);
    syncSessionWorkflow(db, project.alias, "task_deleted");
    db.exec("COMMIT;");
    return event;
  } catch (error) {
    db.exec("ROLLBACK;");
    throw error;
  }
}

export function listTaskEvents(db: Database, projectRef: string, taskRef?: string): TaskEvent[] {
  const project = requireProject(db, projectRef);
  const params: string[] = [project.id];
  let sql = "SELECT * FROM task_events WHERE project_id = ?";
  if (taskRef !== undefined) {
    const task = requireTask(db, taskRef);
    sql += " AND (task_id = ? OR task_alias = ?)";
    params.push(task.id, task.alias);
  }
  sql += " ORDER BY created_at DESC";
  const rows = db.query(sql).all(...params) as TaskEventRow[];
  return rows.map(taskEventFromRow);
}

export function buildProductionChecklist(db: Database, projectRef: string, taskRef: string): ProductionChecklist {
  const project = requireProject(db, projectRef);
  const task = requireTask(db, taskRef);
  if (task.projectId !== project.id) {
    throw notFound("Task is not in selected project.", { projectRef, taskRef });
  }

  const items: ProductionChecklistItem[] = [
    {
      id: "progress",
      label: "Progress complete",
      required: true,
      passed: task.progress >= 1,
      detail: `progress=${task.progress}`,
    },
    {
      id: "quality_gate_label",
      label: "Quality gate label",
      required: false,
      passed: true,
      detail: `gate=${task.qualityGate}`,
    },
    scaleChecklistItem(db, project.id),
    visualScenarioChecklistItem(db, project.id, task),
    {
      id: "open_asks",
      label: "No open project asks",
      required: false,
      passed: openAskCount(db, project.id) === 0,
      detail: `${openAskCount(db, project.id)} open asks`,
    },
    {
      id: "runtime_state",
      label: "Runtime state coherent",
      required: true,
      passed: task.status !== "paused" && task.status !== "dropped",
      detail: `status=${task.status}; runtime=${runtimeSecondsAt(task)}s`,
    },
  ];

  return {
    taskId: task.alias,
    passed: items.every((item) => !item.required || item.passed),
    items,
  };
}

export function taskRuntimeSeconds(task: Task): number {
  return runtimeSecondsAt(task);
}

function scaleChecklistItem(db: Database, projectId: string): ProductionChecklistItem {
  const estimate = db
    .query("SELECT alias, weight FROM scale_estimates WHERE project_id = ? ORDER BY created_at DESC LIMIT 1")
    .get(projectId) as { alias: string; weight: number } | null;
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
  return {
    id: "scale",
    label: "Scale gate clear",
    required: estimate !== null || blocking.count > 0,
    passed: blocking.count === 0 && (estimate?.weight ?? 0) <= 13,
    detail: estimate === null ? "no scale report" : `report=${estimate.alias}; weight=${estimate.weight}; blocks=${blocking.count}`,
  };
}

function openAskCount(db: Database, projectId: string): number {
  const row = db.query("SELECT COUNT(*) as count FROM asks WHERE project_id = ? AND status = 'open'").get(projectId) as { count: number };
  return row.count;
}

function moveTaskPriority(db: Database, taskId: string, nextPriorityRaw: number): void {
  if (!Number.isInteger(nextPriorityRaw) || nextPriorityRaw < 1) throw usageError("Priority must be a positive integer.", { priority: nextPriorityRaw });
  const task = requireTask(db, taskId);
  const maxPriority = getMaxPriority(db, task.projectId);
  const nextPriority = Math.min(nextPriorityRaw, maxPriority);
  if (nextPriority === task.priority) return;

  db.exec("BEGIN;");
  try {
    const tempPriority = maxPriority + 1_000_000;
    db.query("UPDATE tasks SET priority = ? WHERE id = ?").run(tempPriority, task.id);
    if (nextPriority < task.priority) {
      db.query("UPDATE tasks SET priority = priority + 1000000 WHERE project_id = ? AND priority >= ? AND priority < ?").run(task.projectId, nextPriority, task.priority);
      db.query("UPDATE tasks SET priority = priority - 999999 WHERE project_id = ? AND priority >= 1000000 AND id != ?").run(task.projectId, task.id);
    } else {
      db.query("UPDATE tasks SET priority = priority + 1000000 WHERE project_id = ? AND priority > ? AND priority <= ?").run(task.projectId, task.priority, nextPriority);
      db.query("UPDATE tasks SET priority = priority - 1000001 WHERE project_id = ? AND priority >= 1000000 AND id != ?").run(task.projectId, task.id);
    }
    db.query("UPDATE tasks SET priority = ?, updated_at = ? WHERE id = ?").run(nextPriority, new Date().toISOString(), task.id);
    db.exec("COMMIT;");
  } catch (error) {
    db.exec("ROLLBACK;");
    throw error;
  }
}

function shiftPrioritiesForInsert(db: Database, projectId: string, priority: number): void {
  db.query("UPDATE tasks SET priority = priority + 1000000 WHERE project_id = ? AND priority >= ?").run(projectId, priority);
  db.query("UPDATE tasks SET priority = priority - 999999 WHERE project_id = ? AND priority >= 1000000").run(projectId);
}

function compactPrioritiesAfterDelete(db: Database, projectId: string, deletedPriority: number, updatedAt: string): void {
  const offset = getMaxPriority(db, projectId) + 1_000_000;
  db.query("UPDATE tasks SET priority = priority + ?, updated_at = ? WHERE project_id = ? AND priority > ?").run(offset, updatedAt, projectId, deletedPriority);
  db.query("UPDATE tasks SET priority = priority - ? - 1, updated_at = ? WHERE project_id = ? AND priority > ?").run(offset, updatedAt, projectId, offset);
}

function getMaxPriority(db: Database, projectId: string): number {
  const row = db.query("SELECT MAX(priority) as maxPriority FROM tasks WHERE project_id = ?").get(projectId) as { maxPriority: number | null };
  return row.maxPriority ?? 0;
}

function clampPriority(priority: number, max: number): number {
  if (!Number.isInteger(priority) || priority < 1) throw usageError("Priority must be a positive integer.", { priority });
  return Math.min(priority, max);
}

function parseRatio(input: string): number {
  const value = Number(input);
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw usageError("Value must be a number from 0 to 1.", { value: input });
  }
  return value;
}

function preserveParentTaskMarker(previous: string, next: string): string {
  if (/Parent task:\s*[A-Za-z0-9_-]+/.test(next)) {
    return next;
  }
  const marker = previous.match(/Parent task:\s*[A-Za-z0-9_-]+\.?/)?.[0];
  if (marker === undefined) {
    return next;
  }
  return `${next.trimEnd()}\n\n${marker}`;
}

function runtimeSecondsAt(task: Task, at = new Date().toISOString()): number {
  if (task.status !== "active") {
    return task.activeSeconds;
  }
  const anchor = Date.parse(task.resumedAt ?? task.startedAt ?? at);
  const end = Date.parse(at);
  if (!Number.isFinite(anchor) || !Number.isFinite(end) || end <= anchor) {
    return task.activeSeconds;
  }
  return task.activeSeconds + Math.floor((end - anchor) / 1000);
}

function assertOwner(owner: string): void {
  if (owner === "main" || owner === "user" || owner.startsWith("subagent:")) {
    return;
  }
  throw usageError("Task owner must be main, user, or subagent:<role>.", { owner });
}

function recordTaskEvent(
  db: Database,
  input: {
    projectId: string;
    sessionId: string | null;
    taskId: string | null;
    taskAlias: string;
    type: string;
    summary: string;
    payload?: Record<string, unknown>;
    createdAt?: string;
  },
): TaskEvent {
  const id = createId();
  const alias = nextAlias(db, "task_events");
  const createdAt = input.createdAt ?? new Date().toISOString();
  db.query(
    `
      INSERT INTO task_events (
        id, alias, project_id, session_id, task_id, task_alias, type, summary, payload_json, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
  ).run(
    id,
    alias,
    input.projectId,
    input.sessionId,
    input.taskId,
    input.taskAlias,
    input.type,
    input.summary,
    JSON.stringify(input.payload ?? {}),
    createdAt,
  );
  const row = db.query("SELECT * FROM task_events WHERE id = ?").get(id) as TaskEventRow;
  return taskEventFromRow(row);
}
