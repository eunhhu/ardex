import { Database } from "bun:sqlite";
import { requireProject } from "./projects.ts";
import { getScaleSummary } from "./scale.ts";
import { requireTask, taskRuntimeSeconds } from "./tasks.ts";
import { type Statement, type Task } from "./types.ts";
import { type SessionRow, sessionFromRow } from "./rows.ts";

export function buildStatement(db: Database, projectRef: string): Statement {
  const project = requireProject(db, projectRef);
  const sessionRow = db
    .query(
      `
        SELECT * FROM sessions
        WHERE project_id = ? AND status != 'done'
        ORDER BY last_seen_at DESC
        LIMIT 1
      `,
    )
    .get(project.id) as SessionRow | null;
  const session = sessionRow === null ? null : sessionFromRow(sessionRow);
  const currentTask = session?.currentTaskId === null || session === null ? null : activeTaskOrNull(db, session.currentTaskId);
  const blockerRows = db
    .query("SELECT alias, question FROM asks WHERE project_id = ? AND status = 'open' ORDER BY created_at ASC")
    .all(project.id) as Array<{ alias: string; question: string }>;
  const scaleSummary = getScaleSummary(db, project.id);

  return {
    project: {
      id: project.alias,
      alias: project.alias,
      path: project.path,
      name: project.name,
    },
    session:
      session === null
        ? null
        : {
            id: session.alias,
            alias: session.alias,
            status: session.status,
            mode: session.mode,
            goal: session.goal,
            runtimeSeconds: session.runtimeSeconds,
          },
    currentTask:
      currentTask === null
        ? null
        : {
            id: currentTask.alias,
            alias: currentTask.alias,
            title: currentTask.title,
            progress: currentTask.progress,
            qualityGate: currentTask.qualityGate,
            owner: currentTask.owner,
            status: currentTask.status,
            runtimeSeconds: taskRuntimeSeconds(currentTask),
          },
    scale: {
      latestReportId: scaleSummary.latestReportId,
      maxWeight: scaleSummary.maxWeight,
      blockingFindings: scaleSummary.blockingFindings,
      nextSplitRequired: scaleSummary.nextSplitRequired,
    },
    blockers: blockerRows.map((row) => `${row.alias}: ${row.question}`),
    nextExpectedAction: session?.nextExpectedAction ?? null,
  };
}

function activeTaskOrNull(db: Database, taskId: string): Task | null {
  const task = requireTask(db, taskId);
  return task.status === "done" || task.status === "dropped" ? null : task;
}
