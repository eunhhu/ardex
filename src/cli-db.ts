import { openDatabase } from "./db.ts";
import { initializeArdex } from "./init.ts";
import { currentProject, requireProject, type Project } from "./repository.ts";

export async function withDb<T>(callback: (db: ReturnType<typeof openDatabase>) => Promise<T> | T): Promise<T> {
  await initializeArdex();
  const db = openDatabase();
  try {
    return await callback(db);
  } finally {
    db.close();
  }
}

export async function resolveProject(db: ReturnType<typeof openDatabase>, explicitProjectId?: string): Promise<Project> {
  return explicitProjectId === undefined ? await currentProject(db) : requireProject(db, explicitProjectId);
}
