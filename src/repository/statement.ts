import { Database } from "bun:sqlite";
import { requireProject } from "./projects.ts";
import { getScaleSummary } from "./scale.ts";
import { sessionAgentActivity } from "./sessions.ts";
import { requireTask, taskRuntimeSeconds } from "./tasks.ts";
import { visualScenarioState } from "./visual-scenarios.ts";
import { type Session, type Statement, type Task } from "./types.ts";
import { type SessionRow, type TaskRow, sessionFromRow, taskFromRow } from "./rows.ts";

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
  const visualScenario = currentTask === null ? null : visualScenarioState(db, project.id, currentTask);
  const subagentRows = db
    .query(
      `
        SELECT * FROM tasks
        WHERE project_id = ?
          AND owner LIKE 'subagent:%'
          AND status NOT IN ('done', 'dropped')
        ORDER BY priority ASC
      `,
    )
    .all(project.id) as TaskRow[];
  const subagentTasks = subagentRows.map(taskFromRow);

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
            runtimeSeconds: sessionRuntimeSeconds(session),
            lastSeenAt: session.lastSeenAt,
            agent: sessionAgentActivity(session),
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
    visualScenario,
    subagents: buildSubagentPlan(subagentTasks, scaleSummary.nextSplitRequired),
    blockers: blockerRows.map((row) => `${row.alias}: ${row.question}`),
    nextExpectedAction: visualScenario?.nextAction ?? session?.nextExpectedAction ?? null,
  };
}

function sessionRuntimeSeconds(session: Session): number {
  if (session.endedAt !== null) {
    return session.runtimeSeconds;
  }
  const startedAt = Date.parse(session.startedAt);
  return Number.isFinite(startedAt) ? Math.max(session.runtimeSeconds, Math.floor((Date.now() - startedAt) / 1000)) : session.runtimeSeconds;
}

function activeTaskOrNull(db: Database, taskId: string): Task | null {
  const task = requireTask(db, taskId);
  return task.status === "done" || task.status === "dropped" ? null : task;
}

function buildSubagentPlan(tasks: Task[], splitRequired: boolean): Statement["subagents"] {
  const pending = tasks.map((task) => ({
    id: task.alias,
    alias: task.alias,
    title: task.title,
    owner: task.owner,
    role: task.owner.slice("subagent:".length),
    status: task.status,
    priority: task.priority,
    estimatedWeight: task.estimatedWeight,
  }));
  if (pending.length > 0) {
    return {
      required: true,
      reason: "project has open subagent-owned tasks",
      instruction:
        "Spawn separate Codex subagents for pending subagent-owned tasks before main-context implementation. Main agent coordinates, integrates, and verifies; it should not silently implement subagent-owned work in the main context.",
      pending,
    };
  }
  return {
    required: false,
    reason: splitRequired ? "scale split required before subagent delegation" : null,
    instruction: splitRequired ? "Run scale split first, then assign generated child tasks to bounded subagent owners." : null,
    pending,
  };
}
