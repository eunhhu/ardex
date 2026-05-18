import type { ArdexPaths } from "./paths.ts";
import { openDatabase } from "./db.ts";
import {
  addTask,
  buildProductionChecklist,
  claimTask,
  completeSession,
  completeTask,
  deleteTask,
  pauseTask,
  requireProject,
  resumeTask,
  setSessionField,
  setTaskOwner,
  setTaskField,
  splitTaskFromScale,
  startSession,
  storeScaleReport,
  waiveScaleFinding,
} from "./repository.ts";
import { scanScale } from "./scale.ts";

export function startSessionForDashboard(
  paths: ArdexPaths,
  projectRef: string,
  input: { goal?: string; mode?: string; model?: string },
): unknown {
  return mutateDb(paths, (db) => startSession(db, projectRef, input));
}

export function setSessionStatusForDashboard(paths: ArdexPaths, projectRef: string, status: string): unknown {
  return mutateDb(paths, (db) => setSessionField(db, projectRef, "status", status));
}

export function completeSessionForDashboard(paths: ArdexPaths, projectRef: string): unknown {
  return mutateDb(paths, (db) => completeSession(db, projectRef));
}

export function addTaskForDashboard(
  paths: ArdexPaths,
  projectRef: string,
  input: { title: string; content?: string; priority?: number; importance?: number; qualityGate?: string; owner?: string },
): unknown {
  return mutateDb(paths, (db) => {
    const task = addTask(db, projectRef, input);
    if (input.owner !== undefined) {
      return setTaskOwner(db, projectRef, task.alias, input.owner);
    }
    return task;
  });
}

export function claimTaskForDashboard(paths: ArdexPaths, projectRef: string, taskRef: string): unknown {
  return mutateDb(paths, (db) => claimTask(db, projectRef, taskRef));
}

export function pauseTaskForDashboard(paths: ArdexPaths, projectRef: string, taskRef: string, reason?: string): unknown {
  return mutateDb(paths, (db) => pauseTask(db, projectRef, taskRef, reason));
}

export function resumeTaskForDashboard(paths: ArdexPaths, projectRef: string, taskRef: string): unknown {
  return mutateDb(paths, (db) => resumeTask(db, projectRef, taskRef));
}

export function setTaskOwnerForDashboard(paths: ArdexPaths, projectRef: string, taskRef: string, owner: string): unknown {
  return mutateDb(paths, (db) => setTaskOwner(db, projectRef, taskRef, owner));
}

export function setTaskProgressForDashboard(paths: ArdexPaths, projectRef: string, taskRef: string, progress: number): unknown {
  return mutateDb(paths, (db) => setTaskField(db, projectRef, taskRef, "progress", String(progress)));
}

export function setTaskPriorityForDashboard(paths: ArdexPaths, projectRef: string, taskRef: string, priority: number): unknown {
  return mutateDb(paths, (db) => setTaskField(db, projectRef, taskRef, "priority", String(priority)));
}

export function deleteTaskForDashboard(paths: ArdexPaths, projectRef: string, taskRef: string): unknown {
  return mutateDb(paths, (db) => deleteTask(db, projectRef, taskRef));
}

export function taskChecklistForDashboard(paths: ArdexPaths, projectRef: string, taskRef: string): unknown {
  return mutateDb(paths, (db) => buildProductionChecklist(db, projectRef, taskRef));
}

export function completeTaskForDashboard(paths: ArdexPaths, projectRef: string, taskRef: string): unknown {
  return mutateDb(paths, (db) => completeTask(db, projectRef, taskRef));
}

export async function runScaleCheckForDashboard(
  paths: ArdexPaths,
  projectRef: string,
  input: { paths?: string[]; goal?: string },
): Promise<unknown> {
  const db = openDatabase(paths);
  try {
    const project = requireProject(db, projectRef);
    const scan = await scanScale({ projectPath: project.path, paths: input.paths ?? [], goal: input.goal });
    return storeScaleReport(db, projectRef, scan);
  } finally {
    db.close();
  }
}

export function splitTaskFromScaleForDashboard(paths: ArdexPaths, projectRef: string, taskRef: string): unknown {
  return mutateDb(paths, (db) => splitTaskFromScale(db, projectRef, taskRef));
}

export function waiveScaleFindingForDashboard(paths: ArdexPaths, projectRef: string, findingRef: string, reason: string): unknown {
  return mutateDb(paths, (db) => waiveScaleFinding(db, projectRef, findingRef, reason));
}

function mutateDb<T>(paths: ArdexPaths, callback: (db: ReturnType<typeof openDatabase>) => T): T {
  const db = openDatabase(paths);
  try {
    return callback(db);
  } finally {
    db.close();
  }
}
