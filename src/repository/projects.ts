import { Database } from "bun:sqlite";
import { realpath } from "node:fs/promises";
import { basename, isAbsolute, relative, resolve } from "node:path";
import { notFound, usageError } from "../errors.ts";
import { createId, nextAlias } from "../ids.ts";
import { type Project } from "./types.ts";
import { type ProjectRow, projectFromRow } from "./rows.ts";

export async function addProject(db: Database, inputPath: string): Promise<Project> {
  const path = await canonicalPath(inputPath);
  const existing = getProjectByPath(db, path);
  if (existing !== null) {
    return existing;
  }

  const now = new Date().toISOString();
  const id = createId();
  const alias = nextAlias(db, "projects");
  const name = basename(path);

  db.query(
    `
      INSERT INTO projects (id, alias, path, name, default_workflow, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'sdd_vdd', ?, ?)
    `,
  ).run(id, alias, path, name, now, now);

  return requireProject(db, alias);
}

export function listProjects(db: Database): Project[] {
  const rows = db.query("SELECT * FROM projects WHERE archived_at IS NULL ORDER BY name ASC, path ASC").all() as ProjectRow[];
  return rows.map(projectFromRow);
}

export function listAllProjects(db: Database): Project[] {
  const rows = db.query("SELECT * FROM projects ORDER BY archived_at IS NOT NULL ASC, name ASC, path ASC").all() as ProjectRow[];
  return rows.map(projectFromRow);
}

export function requireProject(db: Database, projectRef: string): Project {
  const project = findProject(db, projectRef);
  if (project === null) {
    throw notFound("Project not found.", { projectRef });
  }
  return project;
}

export function findProject(db: Database, projectRef: string): Project | null {
  const row = db.query("SELECT * FROM projects WHERE id = ? OR alias = ?").get(projectRef, projectRef) as ProjectRow | null;
  return row === null ? null : projectFromRow(row);
}

export async function currentProject(db: Database, cwd = process.cwd()): Promise<Project> {
  const envProjectId = process.env["ARDEX_PROJECT_ID"];
  if (envProjectId !== undefined && envProjectId.length > 0) {
    return requireProject(db, envProjectId);
  }

  const cwdPath = await canonicalPath(cwd);
  const projects = listProjects(db)
    .filter((project) => isPathInside(cwdPath, project.path))
    .sort((left, right) => right.path.length - left.path.length);
  const project = projects[0];
  if (project === undefined) {
    throw notFound("No Ardex project matches current directory.", { cwd: cwdPath });
  }
  return project;
}

export function setProjectName(db: Database, projectRef: string, name: string): Project {
  const cleanName = name.trim();
  if (cleanName.length === 0) {
    throw usageError("Project name cannot be empty.");
  }
  const project = requireProject(db, projectRef);
  const now = new Date().toISOString();
  db.query("UPDATE projects SET name = ?, updated_at = ? WHERE id = ?").run(cleanName, now, project.id);
  return requireProject(db, project.id);
}

export function archiveProject(db: Database, projectRef: string): Project {
  const project = requireProject(db, projectRef);
  const now = new Date().toISOString();
  db.query("UPDATE projects SET archived_at = COALESCE(archived_at, ?), updated_at = ? WHERE id = ?").run(now, now, project.id);
  return requireProject(db, project.id);
}

export function restoreProject(db: Database, projectRef: string): Project {
  const project = requireProject(db, projectRef);
  const now = new Date().toISOString();
  db.query("UPDATE projects SET archived_at = NULL, updated_at = ? WHERE id = ?").run(now, project.id);
  return requireProject(db, project.id);
}

async function canonicalPath(path: string): Promise<string> {
  return await realpath(resolve(path));
}

function getProjectByPath(db: Database, path: string): Project | null {
  const row = db.query("SELECT * FROM projects WHERE path = ?").get(path) as ProjectRow | null;
  return row === null ? null : projectFromRow(row);
}

function isPathInside(child: string, parent: string): boolean {
  const result = relative(parent, child);
  return result === "" || (!result.startsWith("..") && !isAbsolute(result));
}
