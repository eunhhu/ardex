import { Database } from "bun:sqlite";
import { getArdexPaths, type ArdexPaths } from "./paths.ts";

type Migration = {
  version: number;
  name: string;
  sql: string;
};

export const LATEST_SCHEMA_VERSION = 4;

const migrations: Migration[] = [
  {
    version: 1,
    name: "phase0_schema_version",
    sql: `
      CREATE TABLE IF NOT EXISTS schema_version (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL
      );
    `,
  },
  {
    version: 2,
    name: "phase1_core_entities",
    sql: `
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        alias TEXT NOT NULL UNIQUE,
        path TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        codex_project_key TEXT,
        default_workflow TEXT NOT NULL DEFAULT 'sdd_vdd'
          CHECK (default_workflow IN ('normal', 'sdd', 'vdd', 'sdd_vdd')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS features (
        id TEXT PRIMARY KEY,
        alias TEXT NOT NULL UNIQUE,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        content TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'candidate'
          CHECK (status IN ('candidate', 'scoped', 'active', 'shipped', 'dropped')),
        importance REAL NOT NULL DEFAULT 0.5 CHECK (importance >= 0 AND importance <= 1),
        estimated_weight REAL,
        toy_output_required INTEGER NOT NULL DEFAULT 1 CHECK (toy_output_required IN (0, 1)),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS acceptance_criteria (
        id TEXT PRIMARY KEY,
        alias TEXT NOT NULL UNIQUE,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        feature_id TEXT NOT NULL REFERENCES features(id) ON DELETE CASCADE,
        text TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'open'
          CHECK (status IN ('open', 'satisfied', 'waived')),
        evidence_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (evidence_id) REFERENCES evidence(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        alias TEXT NOT NULL UNIQUE,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        thread_id TEXT,
        status TEXT NOT NULL DEFAULT 'idle'
          CHECK (status IN ('idle', 'planning', 'scaling', 'specifying', 'implementing', 'verifying', 'reviewing', 'blocked', 'done')),
        previous_status TEXT,
        current_task_id TEXT,
        goal TEXT,
        mode TEXT NOT NULL DEFAULT 'sdd_vdd'
          CHECK (mode IN ('normal', 'sdd', 'vdd', 'sdd_vdd', 'review', 'fix_ci')),
        model TEXT,
        next_expected_action TEXT,
        started_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        ended_at TEXT,
        runtime_seconds INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (current_task_id) REFERENCES tasks(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        alias TEXT NOT NULL UNIQUE,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL,
        feature_id TEXT REFERENCES features(id) ON DELETE SET NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'todo'
          CHECK (status IN ('todo', 'active', 'blocked', 'review', 'done', 'dropped')),
        progress REAL NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 1),
        priority INTEGER NOT NULL CHECK (priority >= 1),
        importance REAL NOT NULL DEFAULT 0.5 CHECK (importance >= 0 AND importance <= 1),
        owner TEXT NOT NULL DEFAULT 'main',
        quality_gate TEXT NOT NULL DEFAULT 'none'
          CHECK (quality_gate IN ('none', 'scale', 'spec', 'visual', 'test', 'demo', 'review')),
        estimated_weight REAL,
        context_risk REAL CHECK (context_risk IS NULL OR (context_risk >= 0 AND context_risk <= 1)),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        completed_at TEXT,
        UNIQUE (project_id, priority)
      );

      CREATE TABLE IF NOT EXISTS evidence (
        id TEXT PRIMARY KEY,
        alias TEXT NOT NULL UNIQUE,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL,
        target_type TEXT NOT NULL CHECK (target_type IN ('feature', 'task', 'session', 'file')),
        target_id TEXT,
        type TEXT NOT NULL CHECK (type IN ('command', 'test', 'screenshot', 'url', 'artifact', 'note', 'advisor', 'scale_report', 'prototype')),
        status TEXT NOT NULL DEFAULT 'accepted'
          CHECK (status IN ('candidate', 'accepted', 'rejected')),
        summary TEXT NOT NULL,
        payload_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS asks (
        id TEXT PRIMARY KEY,
        alias TEXT NOT NULL UNIQUE,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL,
        question TEXT NOT NULL,
        answer TEXT,
        answer_source TEXT CHECK (answer_source IS NULL OR answer_source IN ('user', 'assumed', 'known')),
        attachments_json TEXT NOT NULL DEFAULT '[]',
        status TEXT NOT NULL DEFAULT 'open'
          CHECK (status IN ('open', 'answered', 'dismissed')),
        created_at TEXT NOT NULL,
        answered_at TEXT
      );

      CREATE TABLE IF NOT EXISTS scale_estimates (
        id TEXT PRIMARY KEY,
        alias TEXT NOT NULL UNIQUE,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL,
        target_type TEXT NOT NULL CHECK (target_type IN ('goal', 'feature', 'task', 'file', 'directory', 'roadmap')),
        target_id TEXT,
        weight REAL NOT NULL,
        complexity TEXT NOT NULL CHECK (complexity IN ('low', 'medium', 'high', 'extreme')),
        context_risk REAL NOT NULL CHECK (context_risk >= 0 AND context_risk <= 1),
        modularity_risk REAL NOT NULL CHECK (modularity_risk >= 0 AND modularity_risk <= 1),
        recommended_agent TEXT NOT NULL CHECK (recommended_agent IN ('low', 'standard', 'strong', 'split')),
        recommended_split_json TEXT,
        basis TEXT NOT NULL,
        created_by TEXT NOT NULL CHECK (created_by IN ('heuristic', 'low_model', 'user', 'advisor')),
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS file_scale_findings (
        id TEXT PRIMARY KEY,
        alias TEXT NOT NULL UNIQUE,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        path TEXT NOT NULL,
        line_count INTEGER NOT NULL,
        byte_count INTEGER NOT NULL,
        content_hash TEXT NOT NULL,
        mtime_ms INTEGER NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('source', 'test', 'config', 'generated', 'vendor', 'docs', 'unknown')),
        severity TEXT NOT NULL CHECK (severity IN ('info', 'warn', 'block')),
        reason TEXT NOT NULL,
        recommendation TEXT NOT NULL,
        waived_at TEXT,
        waived_reason TEXT,
        waiver_hash TEXT,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_sessions_project_status ON sessions(project_id, status);
      CREATE INDEX IF NOT EXISTS idx_acceptance_feature_status ON acceptance_criteria(feature_id, status);
      CREATE INDEX IF NOT EXISTS idx_tasks_project_status_priority ON tasks(project_id, status, priority);
      CREATE INDEX IF NOT EXISTS idx_evidence_target ON evidence(target_type, target_id, type);
      CREATE INDEX IF NOT EXISTS idx_asks_project_status ON asks(project_id, status);
      CREATE INDEX IF NOT EXISTS idx_scale_estimates_target ON scale_estimates(target_type, target_id);
      CREATE INDEX IF NOT EXISTS idx_file_scale_findings_project_path ON file_scale_findings(project_id, path);
    `,
  },
  {
    version: 3,
    name: "autonomous_task_runtime_and_artifacts",
    sql: `
      CREATE TABLE tasks_new (
        id TEXT PRIMARY KEY,
        alias TEXT NOT NULL UNIQUE,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL,
        feature_id TEXT REFERENCES features(id) ON DELETE SET NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'todo'
          CHECK (status IN ('todo', 'active', 'paused', 'blocked', 'review', 'done', 'dropped')),
        progress REAL NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 1),
        priority INTEGER NOT NULL CHECK (priority >= 1),
        importance REAL NOT NULL DEFAULT 0.5 CHECK (importance >= 0 AND importance <= 1),
        owner TEXT NOT NULL DEFAULT 'main',
        quality_gate TEXT NOT NULL DEFAULT 'none'
          CHECK (quality_gate IN ('none', 'scale', 'spec', 'visual', 'test', 'demo', 'review')),
        estimated_weight REAL,
        context_risk REAL CHECK (context_risk IS NULL OR (context_risk >= 0 AND context_risk <= 1)),
        started_at TEXT,
        paused_at TEXT,
        resumed_at TEXT,
        active_seconds INTEGER NOT NULL DEFAULT 0 CHECK (active_seconds >= 0),
        pause_reason TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        completed_at TEXT,
        UNIQUE (project_id, priority)
      );

      INSERT INTO tasks_new (
        id, alias, project_id, session_id, feature_id, title, content, status, progress,
        priority, importance, owner, quality_gate, estimated_weight, context_risk,
        created_at, updated_at, completed_at
      )
      SELECT
        id, alias, project_id, session_id, feature_id, title, content, status, progress,
        priority, importance, owner, quality_gate, estimated_weight, context_risk,
        created_at, updated_at, completed_at
      FROM tasks;

      DROP TABLE tasks;
      ALTER TABLE tasks_new RENAME TO tasks;

      CREATE TABLE evidence_new (
        id TEXT PRIMARY KEY,
        alias TEXT NOT NULL UNIQUE,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL,
        target_type TEXT NOT NULL CHECK (target_type IN ('feature', 'task', 'session', 'file')),
        target_id TEXT,
        type TEXT NOT NULL CHECK (
          type IN (
            'command', 'test', 'screenshot', 'generated_image', 'url', 'artifact',
            'note', 'advisor', 'scale_report', 'prototype', 'spec', 'acceptance', 'browser_diff'
          )
        ),
        status TEXT NOT NULL DEFAULT 'accepted'
          CHECK (status IN ('candidate', 'accepted', 'rejected')),
        summary TEXT NOT NULL,
        payload_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL
      );

      INSERT INTO evidence_new (
        id, alias, project_id, session_id, target_type, target_id, type, status, summary, payload_json, created_at
      )
      SELECT id, alias, project_id, session_id, target_type, target_id, type, status, summary, payload_json, created_at
      FROM evidence;

      DROP TABLE evidence;
      ALTER TABLE evidence_new RENAME TO evidence;

      CREATE TABLE IF NOT EXISTS task_events (
        id TEXT PRIMARY KEY,
        alias TEXT NOT NULL UNIQUE,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL,
        task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
        task_alias TEXT NOT NULL,
        type TEXT NOT NULL CHECK (
          type IN (
            'created', 'claimed', 'paused', 'resumed', 'progress', 'owner_changed',
            'priority_changed', 'edited', 'deleted', 'completed', 'checklist'
          )
        ),
        summary TEXT NOT NULL,
        payload_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_tasks_project_status_priority ON tasks(project_id, status, priority);
      CREATE INDEX IF NOT EXISTS idx_evidence_target ON evidence(target_type, target_id, type);
      CREATE INDEX IF NOT EXISTS idx_task_events_project_task ON task_events(project_id, task_id, created_at);
    `,
  },
  {
    version: 4,
    name: "project_archive_metadata",
    sql: `
      ALTER TABLE projects ADD COLUMN archived_at TEXT;
      CREATE INDEX IF NOT EXISTS idx_projects_archived_path ON projects(archived_at, path);
    `,
  },
];

export function openDatabase(paths: ArdexPaths = getArdexPaths()): Database {
  const db = new Database(paths.dbPath);
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA busy_timeout = 3000;");
  return db;
}

export function migrateDatabase(db: Database): number {
  const currentVersion = getCurrentSchemaVersion(db);

  for (const migration of migrations) {
    if (migration.version <= currentVersion) {
      continue;
    }

    db.exec("PRAGMA foreign_keys = OFF;");
    db.exec("BEGIN;");
    try {
      db.exec(migration.sql);
      db.query("INSERT INTO schema_version (version, name, applied_at) VALUES (?, ?, ?)").run(
        migration.version,
        migration.name,
        new Date().toISOString(),
      );
      db.exec("COMMIT;");
      db.exec("PRAGMA foreign_keys = ON;");
    } catch (error) {
      db.exec("ROLLBACK;");
      db.exec("PRAGMA foreign_keys = ON;");
      throw error;
    }
  }

  return LATEST_SCHEMA_VERSION;
}

export function getCurrentSchemaVersion(db: Database): number {
  const table = db
    .query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_version'")
    .get() as { name: string } | null;

  if (table === null) {
    return 0;
  }

  const row = db.query("SELECT MAX(version) as version FROM schema_version").get() as { version: number | null };
  return row.version ?? 0;
}
