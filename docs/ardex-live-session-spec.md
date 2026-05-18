# Ardex Live Session Spec

## 1. Product Intent

Ardex is a local control plane for Codex work.

Goal: make Codex work visible, consistent, and quality-gated across long sessions, multiple threads, and subagents.

Ardex should not rely on instructions alone. It should enforce missing workflow control through local state, CLI commands, web UI, task state machines, and project-level defaults. It must not duplicate Codex-native command logs, file diffs, or test transcripts.

## 2. Problems To Solve

1. Progress is invisible during long Codex chats.
2. Output quality varies because workflow is implicit.
3. Verification can be meaningless and waste tokens.
4. UX/DX is often ignored until too late.
5. Work scope shrinks to whatever is easiest to implement.
6. Final output is hard to experience without screenshots, demos, logs, or runnable URLs.
7. Large files and uneven tasks waste context and weaken modularity.

## 3. Core Principles

1. Local-first: Ardex runs on the user's machine and stores data under `~/.ardex`.
2. CLI-first automation: Codex updates session state through CLI calls, not heavyweight MCP.
3. Web UI for control: the user sees and steers live work from a browser.
4. Project-scoped state: projects are detected from Codex workspace/thread metadata and filesystem paths.
5. Workflow enforcement: important state transitions require state consistency, scale checks, and unresolved blocker checks.
6. SDD + VDD by default: specs and visual artifacts are first-class.
7. Subagent-friendly: tasks can be split into bounded ownership units with independent context.
8. Quality over activity: progress is based on task state, scale discipline, user decisions, and blockers, not token volume.
9. Scale-aware: work is sized before execution so tasks, files, and agent assignments stay balanced.

## 4. Non-Goals

1. Ardex is not a Codex replacement.
2. Ardex is not a general project management SaaS.
3. Ardex is not required to execute model calls itself in MVP.
4. Ardex does not need a remote sync service in MVP.
5. Ardex should not require the user to manually mirror every chat action.

## 5. System Shape

Ardex has four parts:

1. Global npm package: installs `ardex` CLI.
2. Local daemon: HTTP/WebSocket server started by `ardex start`.
3. Local storage: SQLite database and artifacts under `~/.ardex`.
4. Codex integration: installs an Ardex skill into `.agents/skills`, optional Codex hooks into `.codex/hooks.json`, and optional custom agent profiles into `.codex/agents`.

Recommended MVP stack:

1. Runtime: Bun or Node.js.
2. Server: Hono or Fastify.
3. DB: SQLite.
4. Web UI: React + Vite.
5. Realtime: WebSocket or Server-Sent Events.
6. CLI output: human-readable by default, JSON with `--json`.
7. Scale estimator: static heuristics first, optional low-cost model adapter.

## 6. Local Files

```text
~/.ardex/
  config.json
  ardex.db
  install-state.json
  logs/
    daemon.log
  artifacts/
    <project_id>/
      <session_id>/
        screenshots/
        logs/
        reports/

~/.agents/skills/
  ardex/
    SKILL.md

<repo>/.agents/skills/
  ardex/
    SKILL.md

~/.codex/
  hooks.json
  config.toml
  agents/
    ardex-explorer.toml
    ardex-worker.toml

<repo>/.codex/
  hooks.json
  config.toml
  agents/
    ardex-explorer.toml
    ardex-worker.toml
```

Codex integration files are opt-in except the user-level Ardex skill. `ardex init` must record every generated or modified path in `~/.ardex/install-state.json` so upgrades and rollback can be deterministic.

## 6.1 Project Detection

MVP detection order:

1. Explicit `-p <project_id>` flag.
2. Nearest registered project path from current working directory.
3. Later: Codex thread/project metadata under `~/.codex`.

`ARDEX_PROJECT_ID` is allowed only as an explicit override for automation, not as the default `project current` inference source.

Rule: do not depend on private Codex metadata for MVP correctness. Use path-based matching first, then add Codex metadata adapters when the exact file format is confirmed.

## 6.2 Codex Compatibility

Ardex aligns with current Codex integration surfaces:

1. Skills live in repository `.agents/skills` folders or user `$HOME/.agents/skills`.
2. Hooks live next to Codex config layers, usually `~/.codex/hooks.json`, `~/.codex/config.toml`, `<repo>/.codex/hooks.json`, or `<repo>/.codex/config.toml`.
3. Custom agents live in `~/.codex/agents` or `<repo>/.codex/agents`.
4. User-level Codex config lives in `~/.codex/config.toml`; project-scoped override lives in `<repo>/.codex/config.toml`.
5. `codex exec --json` already emits command/file/test events; Ardex should reference or summarize those only when Codex cannot preserve the context itself.

Ardex must treat Codex config writes as managed edits:

1. Detect existing files before writing.
2. Create timestamped backups before modification.
3. Merge only Ardex-owned blocks.
4. Store checksums in `~/.ardex/install-state.json`.
5. Provide rollback through `ardex init rollback`.

## 7. Domain Model

### Project

Represents a workspace.

Fields:

1. `id`: stable generated id.
2. `path`: absolute project path.
3. `name`: display name.
4. `created_at`, `updated_at`.
5. `codex_project_key`: optional key inferred from Codex metadata.
6. `default_workflow`: `sdd_vdd`.

### Feature

Represents a user-visible capability or product slice.

Fields:

1. `id`.
2. `project_id`.
3. `title`.
4. `content`.
5. `status`: `candidate | scoped | active | shipped | dropped`.
6. `importance`: float `0..1`.
7. `estimated_weight`: nullable float from latest scale estimate.
8. `toy_output_required`: boolean.
9. `created_at`, `updated_at`.

### Acceptance Criterion

Represents a user-facing condition that must be proven before release.

Fields:

1. `id`.
2. `project_id`.
3. `feature_id`.
4. `text`.
5. `status`: `open | satisfied | waived`.
6. `evidence_id`: nullable evidence proving the criterion.
7. `created_at`, `updated_at`.

### Session

Represents a Codex thread or active work run.

Fields:

1. `id`.
2. `project_id`.
3. `thread_id`: optional Codex thread id.
4. `status`: `idle | planning | scaling | specifying | implementing | verifying | reviewing | blocked | done`.
5. `current_task_id`.
6. `goal`: nullable text.
7. `mode`: `normal | sdd | vdd | sdd_vdd | review | fix_ci`.
8. `model`: nullable model name.
9. `started_at`, `last_seen_at`, `ended_at`.
10. `runtime_seconds`.

### Task

Represents user-visible work.

Fields:

1. `id`.
2. `project_id`.
3. `session_id`: nullable; task can exist before a session claims it.
4. `title`.
5. `content`.
6. `status`: `todo | active | blocked | review | done | dropped`.
7. `progress`: float `0..1`.
8. `priority`: integer rank, lower means earlier.
9. `importance`: float `0..1`.
10. `owner`: `main | subagent:<id> | user`.
11. `quality_gate`: `none | scale | spec | visual | test | demo | review`.
12. `estimated_weight`: nullable float from latest scale estimate.
13. `context_risk`: nullable float `0..1`.
14. `created_at`, `updated_at`, `completed_at`.

Priority rule: when a task moves to priority N, existing tasks at N or later shift down.

### Evidence

Proof that work is real and user-experienceable.

Fields:

1. `id`.
2. `project_id`.
3. `session_id`.
4. `target_type`: `feature | task | session | file`.
5. `target_id`: nullable id or path.
6. `type`.
7. `status`: `candidate | accepted | rejected`.
8. `summary`.
9. `payload`: JSON details such as command, path, URL, viewport, pass/fail.
10. `created_at`.

Types:

1. `command`: command and summarized output.
2. `test`: test command, pass/fail, relevant failures.
3. `screenshot`: local image path.
4. `url`: local or remote URL.
5. `artifact`: file path, report, generated doc.
6. `note`: structured note.
7. `advisor`: model critique or recommendation.
8. `scale_report`: size estimate, split decision, file findings.
9. `prototype`: toy demo, mock, storyboard, screenshot, or runnable URL.

### Ask

User question queue item.

Fields:

1. `id`.
2. `project_id`.
3. `session_id`.
4. `question`.
5. `answer`: nullable text.
6. `answer_source`: nullable `user | assumed | known`.
7. `attachments`: image/file paths.
8. `status`: `open | answered | dismissed`.
9. `created_at`, `answered_at`.

### Scale Estimate

Represents predicted work size before implementation.

Scale estimates can target a goal, feature, task, file, directory, or proposed roadmap item.

Fields:

1. `id`.
2. `project_id`.
3. `session_id`.
4. `target_type`: `goal | feature | task | file | directory | roadmap`.
5. `target_id`: nullable id or path.
6. `weight`: float work estimate, usually `1..13`.
7. `complexity`: `low | medium | high | extreme`.
8. `context_risk`: float `0..1`.
9. `modularity_risk`: float `0..1`.
10. `recommended_agent`: `low | standard | strong | split`.
11. `recommended_split`: nullable structured split plan.
12. `basis`: short explanation: file count, line count, dependency surface, UI states, unknowns.
13. `created_by`: `heuristic | low_model | user | advisor`.
14. `created_at`.

Default weight meaning:

1. `1..3`: small, low-model safe, one focused task.
2. `4..8`: normal task, standard agent.
3. `9..13`: large task, strong agent or split recommended.
4. `>13`: too large; must split before implementation.

### File Scale Finding

Represents a file-level context or modularity risk.

Fields:

1. `id`.
2. `project_id`.
3. `path`.
4. `line_count`.
5. `byte_count`.
6. `role`: `source | test | config | generated | vendor | docs | unknown`.
7. `severity`: `info | warn | block`.
8. `reason`.
9. `recommendation`.

Default source-file thresholds:

1. `<=400` lines: healthy target.
2. `401..800` lines: watch.
3. `801..1500` lines: refactor/split recommended.
4. `>1500` lines: block new large edits unless explicitly waived.

Generated, vendored, lock, and fixture files are excluded from blocking by default.

## 7.1 Canonical SQLite Schema

Rules:

1. Internal ids are ULID strings.
2. User-facing aliases are short stable ids such as `p_001`, `s_001`, `t_001`.
3. Timestamps are UTC ISO-8601 strings.
4. Enum fields are stored as `TEXT` with `CHECK` constraints.
5. Paths are stored as canonical absolute realpaths.
6. `schema_version` is monotonically increased by migrations.
7. Foreign keys are enabled with `PRAGMA foreign_keys = ON`.

```sql
CREATE TABLE schema_version (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE projects (
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

CREATE TABLE features (
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

CREATE TABLE acceptance_criteria (
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

CREATE TABLE sessions (
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

CREATE TABLE tasks (
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

CREATE TABLE evidence (
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

CREATE TABLE asks (
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

CREATE TABLE scale_estimates (
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

CREATE TABLE file_scale_findings (
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

CREATE INDEX idx_sessions_project_status ON sessions(project_id, status);
CREATE INDEX idx_acceptance_feature_status ON acceptance_criteria(feature_id, status);
CREATE INDEX idx_tasks_project_status_priority ON tasks(project_id, status, priority);
CREATE INDEX idx_evidence_target ON evidence(target_type, target_id, type);
CREATE INDEX idx_asks_project_status ON asks(project_id, status);
CREATE INDEX idx_scale_estimates_target ON scale_estimates(target_type, target_id);
CREATE INDEX idx_file_scale_findings_project_path ON file_scale_findings(project_id, path);
```

Integrity rules:

1. `sessions.current_task_id` cannot point to a `done` or `dropped` task.
2. Task priority updates run in a transaction and must leave no duplicate `(project_id, priority)`.
3. Evidence target integrity is checked in application code because `target_id` can reference multiple tables or a file path.
4. Waivers become stale when `line_count`, `byte_count`, `mtime_ms`, or `content_hash` differs from the stored waiver values.
5. Session deletion does not delete tasks or evidence; project deletion deletes all project-owned rows.

## 8. State Machine

Session transition rules:

1. `idle -> planning`: goal or task selected.
2. `planning -> scaling`: initial scope exists and scale check starts.
3. `scaling -> specifying`: scale report exists and oversized work is split or waived.
4. `specifying -> implementing`: task list exists and current task chosen.
5. `implementing -> verifying`: code/artifact changes exist.
6. `verifying -> reviewing`: verification evidence attached.
7. `reviewing -> done`: final evidence attached and all active tasks done.
8. Any state -> `blocked`: open ask or external blocker.
9. `blocked -> previous_state`: ask answered or blocker cleared.

Enforcement:

1. A task cannot be marked `done` with `progress < 1`.
2. A task with `quality_gate=test` needs test evidence.
3. A task with `quality_gate=visual` needs screenshot or URL evidence.
4. A task with `quality_gate=scale` needs scale evidence.
5. A session cannot enter `implementing` while unsplit work has weight `>13`.
6. A session cannot enter `implementing` when targeted source files have blocking file scale findings.
7. A session cannot be `done` while open tasks remain.
8. A final summary should reference evidence ids.

## 8.1 Session Statement

The session statement is the compact canonical snapshot Codex should read before major work and update after meaningful changes.

It answers:

1. What project is active?
2. What goal is active?
3. What mode is active?
4. What task is active?
5. What is blocked?
6. What evidence exists?
7. What should happen next?

Shape:

```json
{
  "project": {
    "id": "ardex",
    "path": "/Users/sunwoo/work/ardex"
  },
  "session": {
    "id": "s_123",
    "status": "implementing",
    "mode": "sdd_vdd",
    "goal": "Build Ardex live session MVP",
    "runtimeSeconds": 1840
  },
  "currentTask": {
    "id": "t_003",
    "title": "Implement task state machine",
    "progress": 0.7,
    "qualityGate": "test"
  },
  "scale": {
    "latestReportId": "sc_014",
    "maxWeight": 8,
    "blockingFindings": 0,
    "nextSplitRequired": false
  },
  "blockers": [],
  "nextExpectedAction": "verify"
}
```

CLI:

```bash
ardex -p <project_id> statement
ardex -p <project_id> statement --json
ardex -p <project_id> statement set next "verify visual output"
```

## 9. CLI Commands

### Global

```bash
ardex init
ardex check
ardex start
ardex stop
ardex status
```

`ardex init`:

1. Creates `~/.ardex`.
2. Creates SQLite database.
3. Installs/updates `$HOME/.agents/skills/ardex/SKILL.md`.
4. Optionally installs repo-scoped `<repo>/.agents/skills/ardex/SKILL.md`.
5. Optionally installs Codex hooks in `~/.codex/hooks.json` or `<repo>/.codex/hooks.json`.
6. Optionally installs custom Codex agents in `~/.codex/agents` or `<repo>/.codex/agents`.
7. Optionally installs shell completions.

`ardex check`:

1. Prints daemon health.
2. Prints server URL.
3. Prints DB path.
4. Exits non-zero if daemon is unavailable.

### Project

```bash
ardex project ls
ardex project add <path>
ardex project show <project_id>
ardex project current
```

### Session

```bash
ardex -p <project_id> session ls
ardex -p <project_id> session current
ardex -p <project_id> session start --thread <thread_id>
ardex -p <project_id> session set status <status>
ardex -p <project_id> session set goal "goal text"
ardex -p <project_id> session set mode <mode>
ardex -p <project_id> session set model <model>
ardex -p <project_id> session done
```

### Feature

```bash
ardex -p <project_id> feature ls
ardex -p <project_id> feature add "title"
ardex -p <project_id> feature <feature_id> check
ardex -p <project_id> feature <feature_id> set importance 0.8
ardex -p <project_id> feature <feature_id> set toy_output_required true
ardex -p <project_id> acceptance add --feature <feature_id> "criterion"
ardex -p <project_id> acceptance link --criterion <criterion_id> --evidence <evidence_id>
```

### Task

```bash
ardex -p <project_id> task ls
ardex -p <project_id> task add "title"
ardex -p <project_id> task <task_id> check
ardex -p <project_id> task <task_id> claim
ardex -p <project_id> task <task_id> block "reason"
ardex -p <project_id> task <task_id> done
ardex -p <project_id> task <task_id> set title "string"
ardex -p <project_id> task <task_id> set content "string"
ardex -p <project_id> task <task_id> set progress 0.7
ardex -p <project_id> task <task_id> set priority 2
ardex -p <project_id> task <task_id> set importance 0.9
ardex -p <project_id> task <task_id> set quality_gate visual
```

### Scale

```bash
ardex -p <project_id> scale check --goal "goal text"
ardex -p <project_id> scale check --task <task_id>
ardex -p <project_id> scale check --path .
ardex -p <project_id> scale check --files src/a.ts src/b.ts
ardex -p <project_id> scale report
ardex -p <project_id> scale report --json
ardex -p <project_id> scale split --task <task_id>
ardex -p <project_id> scale waive <finding_id> --reason "reason"
ardex -p <project_id> roadmap draft --from-scale
```

Scale check behavior:

1. Uses cheap static heuristics first: file tree, line counts, file roles, dependency surface, existing task sizes.
2. Optionally calls a configured low-cost model for weight estimates.
3. Produces scale estimates and file scale findings.
4. Recommends task splits and agent tiers.
5. Blocks implementation when a task is too large or a target file is too large.

Recommended agent mapping:

1. `low`: routine scan, simple edit, small doc, small isolated task.
2. `standard`: normal implementation or integration.
3. `strong`: ambiguous architecture, risky migration, cross-cutting behavior.
4. `split`: work must be divided before assigning agents.

### Evidence

```bash
ardex -p <project_id> evidence add command --task <task_id> --cmd "bun test" --summary "passed"
ardex -p <project_id> evidence add screenshot --task <task_id> --path ./generated/img.png
ardex -p <project_id> evidence add url --task <task_id> --url http://localhost:3000
ardex -p <project_id> evidence add prototype --feature <feature_id> --path ./prototype.md
ardex -p <project_id> evidence ls --task <task_id>
ardex -p <project_id> evidence <evidence_id> accept
ardex -p <project_id> evidence <evidence_id> reject --reason "reason"
```

### Ask

```bash
ardex -p <project_id> ask "question"
ardex -p <project_id> ask "question" -a "yes"
ardex -p <project_id> ask "question" -a "custom answer"
ardex -p <project_id> ask "question" -i ./generated/img.png
ardex -p <project_id> ask ls
ardex -p <project_id> ask <ask_id> answer "answer"
```

Meaning:

1. Without `-a`, creates an open user question and marks session blocked.
2. With `-a`, records an assumed/default answer for traceability.
3. With `-i`, attaches image evidence so the web UI can show visual choices.

### Advisor

```bash
ardex -p <project_id> advisor request --task <task_id>
ardex -p <project_id> advisor ls --task <task_id>
ardex -p <project_id> advisor accept <advisor_id>
ardex -p <project_id> advisor dismiss <advisor_id>
```

MVP can store advisor requests without executing a premium model. Later versions can route to GPT-5.5 Pro or another configured model.

## 9.1 CLI Contract

Codex-facing calls should use `--json`. Human output can change; JSON output is stable within a major version.

Exit codes:

1. `0`: success.
2. `1`: internal error.
3. `2`: validation or usage error.
4. `3`: daemon unavailable.
5. `4`: not found.
6. `5`: quality gate or state transition rejected.
7. `6`: stale config, stale waiver, or project path mismatch.

Success envelope:

```json
{
  "ok": true,
  "data": {},
  "meta": {
    "command": "task.done",
    "projectId": "p_001",
    "sessionId": "s_001",
    "version": "0.1.3"
  }
}
```

Error envelope:

```json
{
  "ok": false,
  "error": {
    "code": "QUALITY_GATE_MISSING_EVIDENCE",
    "message": "Task requires passing test evidence before done.",
    "details": {
      "taskId": "t_003",
      "missing": ["test"]
    }
  },
  "meta": {
    "command": "task.done",
    "version": "0.1.3"
  }
}
```

Required JSON outputs:

```bash
ardex check --json
```

```json
{
  "ok": true,
  "data": {
    "daemon": "running",
    "url": "http://127.0.0.1:17373",
    "dbPath": "/Users/me/.ardex/ardex.db",
    "version": "0.1.3"
  }
}
```

```bash
ardex -p p_001 task t_003 done --json
```

```json
{
  "ok": true,
  "data": {
    "task": {
      "id": "t_003",
      "status": "done",
      "progress": 1,
      "evidenceIds": ["e_011"]
    }
  }
}
```

```bash
ardex -p p_001 scale report --json
```

```json
{
  "ok": true,
  "data": {
    "reportId": "sc_014",
    "maxWeight": 8,
    "blockingFindings": [],
    "estimates": [
      {
        "targetType": "task",
        "targetId": "t_003",
        "weight": 5,
        "recommendedAgent": "standard"
      }
    ]
  }
}
```

CLI behavior:

1. Commands that need the daemon auto-start it by default.
2. `--no-start` disables auto-start and returns exit code `3` when daemon is unavailable.
3. Mutating commands are idempotent when an explicit `--idempotency-key` is supplied.
4. Long command output is truncated before storage; raw full output is never stored by default.
5. All command arguments that reference files must be normalized to canonical absolute paths.

## 10. HTTP API

The CLI talks to the local daemon over HTTP.

Core endpoints:

```text
GET  /health
GET  /projects
POST /projects
GET  /projects/:projectId

GET  /projects/:projectId/sessions
POST /projects/:projectId/sessions
PATCH /sessions/:sessionId

GET  /projects/:projectId/features
POST /projects/:projectId/features
GET  /features/:featureId
PATCH /features/:featureId
GET  /features/:featureId/acceptance
POST /features/:featureId/acceptance
POST /acceptance/:criterionId/link-evidence

GET  /projects/:projectId/tasks
POST /projects/:projectId/tasks
GET  /tasks/:taskId
PATCH /tasks/:taskId
POST /tasks/:taskId/claim
POST /tasks/:taskId/done

POST /projects/:projectId/scale/check
GET  /projects/:projectId/scale/reports
GET  /scale/reports/:scaleReportId
POST /scale/findings/:findingId/waive
POST /tasks/:taskId/scale/split

GET  /tasks/:taskId/evidence
POST /tasks/:taskId/evidence
POST /evidence/:evidenceId/accept
POST /evidence/:evidenceId/reject

GET  /projects/:projectId/asks
POST /projects/:projectId/asks
POST /asks/:askId/answer

GET  /events
```

`GET /events` streams project/session/task updates to the web UI.

## 10.1 HTTP Contract

All JSON responses use one of two shapes.

Success:

```json
{
  "ok": true,
  "data": {}
}
```

Error:

```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid progress.",
    "details": {
      "field": "progress",
      "min": 0,
      "max": 1
    }
  }
}
```

Status mapping:

1. `400`: malformed JSON or invalid field.
2. `404`: project/session/task/evidence/ask not found.
3. `409`: transition, priority, stale waiver, or quality gate conflict.
4. `422`: semantically valid request rejected by policy.
5. `500`: internal daemon error.

Common error codes:

1. `VALIDATION_ERROR`.
2. `NOT_FOUND`.
3. `QUALITY_GATE_MISSING_EVIDENCE`.
4. `QUALITY_GATE_FAILED_EVIDENCE`.
5. `TRANSITION_REJECTED`.
6. `SCALE_BLOCKING_FINDING`.
7. `SCALE_SPLIT_REQUIRED`.
8. `STALE_WAIVER`.
9. `PROJECT_PATH_STALE`.
10. `DAEMON_INTERNAL_ERROR`.

Key request/response contracts:

```http
POST /projects/:projectId/tasks
```

Request:

```json
{
  "title": "Implement evidence storage",
  "content": "Persist command/test evidence with redaction.",
  "featureId": "f_001",
  "priority": 2,
  "importance": 0.8,
  "qualityGate": "test"
}
```

Response:

```json
{
  "ok": true,
  "data": {
    "task": {
      "id": "t_004",
      "status": "todo",
      "priority": 2,
      "progress": 0
    }
  }
}
```

```http
PATCH /tasks/:taskId
```

Allowed fields: `title`, `content`, `status`, `progress`, `priority`, `importance`, `owner`, `qualityGate`, `estimatedWeight`, `contextRisk`.

Priority changes must return the updated ordered task list when `?includeOrder=true`.

```http
POST /tasks/:taskId/done
```

Request:

```json
{
  "evidenceIds": ["e_011"],
  "waiverIds": []
}
```

Rejected response:

```json
{
  "ok": false,
  "error": {
    "code": "QUALITY_GATE_MISSING_EVIDENCE",
    "message": "Task has quality_gate=test but no passing test evidence.",
    "details": {
      "taskId": "t_004",
      "missing": ["test:pass=true"]
    }
  }
}
```

```http
POST /projects/:projectId/scale/check
```

Request:

```json
{
  "targetType": "path",
  "paths": ["src"],
  "goal": "Add live dashboard",
  "candidateTaskIds": ["t_001", "t_002"],
  "useLowModel": false
}
```

Response:

```json
{
  "ok": true,
  "data": {
    "reportId": "sc_014",
    "estimates": [],
    "findings": [],
    "blocked": false
  }
}
```

```http
GET /events
```

Uses SSE in MVP.

Event shape:

```json
{
  "type": "task.updated",
  "projectId": "p_001",
  "sessionId": "s_001",
  "data": {
    "taskId": "t_004",
    "progress": 0.7
  },
  "createdAt": "2026-05-18T00:00:00.000Z"
}
```

## 11. Web UI

MVP screens:

1. Project command switcher: searchable non-archived projects with clean name, path, and id.
2. Project dashboard: implementation level, progress, current focus, readiness, visible outputs, and risks.
3. Feature map: features, importance, estimated weight, toy output status.
4. Task board: ordered tasks with read-only progress/status/owner and user-editable priority.
5. Task detail: content, asks, owner, advisor notes, and verification receipts.
6. Ask inbox: open user questions with attached images/files.
7. Verification log: collapsed receipt/debug view for screenshots, URLs, command/test summaries, user decisions, and manual QA notes.
8. Scale map: feature/task weights, oversized files, split recommendations, agent tier suggestions.

UX requirements:

1. Progress visible in first viewport.
2. Active task and blocker visible without clicking.
3. Every `done` task must show why it is done through compact readiness/checklist status, not by forcing users into raw evidence.
4. Visual work should show screenshot, generated image, prototype, or runnable URL as visible output when such artifact is attached.
5. User can add a task through a modal with title, content, priority, importance, owner hint, and quality-gate label.
6. User can reorder priority from UI.
7. User can answer asks from UI.
8. User can see when one task or file dominates the roadmap.
9. User can approve or waive scale recommendations with a reason.
10. Realtime refresh must not steal focus from inputs, textareas, selects, project search, or task modal fields.
11. Meaningless disabled controls are not allowed; controls must either mutate state or be rendered as read-only status.

## 11.1 UI Acceptance Spec

Project dashboard first viewport:

1. Header: project name, path, daemon status, live connection status.
2. Sticky session strip: agent running/idle state, current goal, session status, current task, next action, and runtime. It remains visible while scrolling and does not steal focus during SSE updates.
3. Project review cards: implementation level, total progress, current focus, and readiness.
4. Active work: current task, progress, quality gate, owner, next expected action.
5. Blocker and risk visibility: open asks, stale waivers, paused work, scale blocks, or oversized scope.
6. Latest visible outputs: screenshot, generated image, URL, prototype, browser result, or manual QA note when attached.
7. Primary actions: answer ask, add task, reorder priority, run scale check, open demo.
8. Evidence/receipts are not first-class progress UI. They appear as a collapsed `Verification Log` for audit/debug use.

Empty states:

1. No project: show `ardex project add <path>` and `ardex init`.
2. No session: show `ardex session start`.
3. No task: show create task and scale check actions.
4. No visible output: show that no demo, screenshot, generated image, or browser result is attached yet.
5. No verification receipts: keep the collapsed log and explain receipts are for external artifacts, user decisions, and manual QA notes.

Loading states:

1. Initial load uses skeleton rows for dashboard, task board, and evidence list.
2. Mutating actions disable only the affected button.
3. SSE reconnect shows stale badge after `5s`, disconnected badge after `20s`.

Error states:

1. Daemon unavailable: show command to run `ardex start`.
2. Gate failure: show exact missing evidence and direct action to add/waive.
3. Stale project path: show old path, detected path, and rebind action.
4. Hook install conflict: show conflicting file and rollback path.

Blocked state:

1. Open ask appears above task board.
2. The main CTA is answer/dismiss ask.
3. Session status cannot be shown as healthy while blockers exist.

Task done UX:

1. Done button is disabled until required gate evidence exists.
2. If clicked anyway through direct URL or stale state, API returns `409` and UI shows missing evidence list.
3. Every done task row shows evidence badges.

## 12. Codex Skill Contract

`ardex init` installs a skill that tells Codex:

1. Run `ardex check` at start if available.
2. Resolve current project via `ardex project current`.
3. Start or attach session.
4. Set goal when user gives a goal.
5. Run scale check before finalizing roadmap or assigning agents.
6. Break oversized work into smaller tasks before implementation.
7. Break work into tasks before implementation.
8. Claim one active task at a time.
9. Update task progress after meaningful milestones.
10. Add evidence after real verification.
11. Use `ask` when blocked or when UX choice needs user input.
12. Do not mark task done without evidence.

This still uses instructions, but the daemon enforces critical transitions.

## 12.1 Scale Checking Workflow

Scale checking runs before detailed specs, roadmap commitment, or subagent assignment.

Inputs:

1. Goal or feature description.
2. Current file tree.
3. Candidate files and directories.
4. Existing tasks and priorities.
5. Optional user constraints: deadline, preferred scope, max file size, max task count.

Outputs:

1. Weighted feature/task list.
2. File scale findings.
3. Context risk score.
4. Modularity risk score.
5. Agent tier recommendation.
6. Split/merge recommendations.
7. Roadmap draft ordered by weight, importance, and dependency.

Default enforcement:

1. Sibling tasks should stay within a `3x` weight ratio unless a reason is recorded.
2. A single task over weight `13` must be split.
3. A task estimated to require more than `30000` tokens of context must be split.
4. A new source file should target `<=400` lines.
5. Editing a source file over `1500` lines requires a scale waiver or refactor task.
6. Adding a feature to an already oversized file should create a split/refactor task first.

Low-model estimator:

1. Reads compact file-tree and line-count summaries, not full source by default.
2. Estimates relative feature/task/file weights.
3. Flags unknowns rather than pretending certainty.
4. Produces a JSON report that a stronger model or user can override.

Scale check does not need perfect estimates. It prevents pathological work shape: one huge task, one huge file, or equal agents assigned to unequal scopes.

## 12.2 Scale Heuristic v0

Scale v0 must be deterministic. Same tree and same task inputs produce the same report.

Default ignore globs:

```text
.git/**
node_modules/**
dist/**
build/**
coverage/**
.next/**
.nuxt/**
.turbo/**
target/**
vendor/**
*.lock
bun.lock
package-lock.json
pnpm-lock.yaml
yarn.lock
*.min.js
*.map
```

Role classification:

1. `test`: path contains `test`, `spec`, `__tests__`, or extension matches common test suffix.
2. `docs`: path under `docs`, or extension is `.md`, `.mdx`, `.txt`.
3. `config`: known config names and dotfiles.
4. `generated`: path contains `generated`, file contains common generated header, or extension is source map.
5. `vendor`: path under `vendor`, dependency cache, or third-party folder.
6. `source`: code extension not classified above.
7. `unknown`: everything else.

File risk:

```text
line_factor = source_lines / 400
byte_factor = byte_count / 60000
file_weight = max(line_factor, byte_factor)
```

File severity:

```text
source <= 400 lines       -> info
source 401..800 lines     -> warn
source 801..1500 lines    -> warn
source >1500 lines        -> block
generated/vendor/lock     -> info
```

Task weight formula:

```text
base = 1
touched_file_weight = min(8, touched_source_files * 1.2)
line_weight = min(8, touched_source_lines / 400)
ui_weight = ui_state_count * 1.5
api_weight = api_surface_count * 1.2
migration_weight = migration_count * 2
unknown_weight = unknown_count * 2
cross_cutting_weight = cross_module_count * 1.5

raw_weight =
  base +
  touched_file_weight +
  line_weight +
  ui_weight +
  api_weight +
  migration_weight +
  unknown_weight +
  cross_cutting_weight

weight = round_up_to_half(raw_weight)
```

Risk formulas:

```text
context_risk = clamp((touched_source_lines / 30000) + (touched_source_files / 20), 0, 1)
modularity_risk = clamp((max_source_file_lines / 1500) + (cross_module_count / 8), 0, 1)
```

Complexity:

1. `low`: weight `<=3`.
2. `medium`: weight `>3` and `<=8`.
3. `high`: weight `>8` and `<=13`.
4. `extreme`: weight `>13`.

Recommended agent:

1. `low`: weight `<=3`, context risk `<0.3`, no blocking findings.
2. `standard`: weight `<=8`, context risk `<0.6`.
3. `strong`: weight `<=13`, or context risk `>=0.6`.
4. `split`: weight `>13`, context risk `>=0.9`, or blocking source file without waiver.

Low-model estimate can adjust weight by at most `+/-30%` unless it returns `unknown`. Heuristic blocking findings always win over low-model optimism.

## 12.3 Codex Integration v1

`ardex init` modes:

```bash
ardex init
ardex init --repo
ardex init --hooks
ardex init --agents
ardex init rollback
```

Skill install:

1. Default user skill: `$HOME/.agents/skills/ardex/SKILL.md`.
2. Optional repo skill: `<repo>/.agents/skills/ardex/SKILL.md`.
3. `SKILL.md` must include `name` and `description` frontmatter.
4. Description must front-load trigger words: `Ardex`, `session`, `evidence`, `quality gate`, `scale check`, `readiness`.

Minimal skill frontmatter:

```markdown
---
name: ardex
description: Ardex session, evidence, quality gate, scale check, readiness workflow for Codex work in local projects.
---
```

Hook install:

1. User hooks: `~/.codex/hooks.json`.
2. Repo hooks: `<repo>/.codex/hooks.json`.
3. Ardex-owned hooks call `ardex hook <event> --json`.
4. Existing hooks are preserved.
5. If hook config merge is unsafe, `ardex init --hooks` fails with rollback instructions.

MVP hook events:

1. `UserPromptSubmit`: record prompt start and refresh session statement.
2. `Stop`: block or warn when hard Ardex state gates fail, such as open asks, paused current work, or stale scale findings.

Hook policy:

1. Ardex does not install `PostToolUse` by default.
2. Ardex must not auto-record command/file evidence from every tool call.
3. `Stop` may block final response only when a hard Ardex state gate is violated.
4. Hooks must not run network calls.
5. Hooks must finish quickly; target max runtime is `500ms`.

Custom agents:

1. Optional user agents: `~/.codex/agents/ardex-explorer.toml`, `~/.codex/agents/ardex-worker.toml`.
2. Optional repo agents: `<repo>/.codex/agents/ardex-explorer.toml`, `<repo>/.codex/agents/ardex-worker.toml`.
3. Ardex task owners are routing instructions, not passive labels. When a statement contains pending `subagent:<role>` tasks, prompt injection must tell Codex to spawn/use separated subagent contexts when available.
4. `ardex task <id> assign subagent:explorer` records intended ownership and emits prompt guidance. Main Codex coordinates, integrates, and verifies instead of silently implementing subagent-owned work in the main context.

Deferred JSONL adapter:

1. `codex exec --json` can stream events such as command executions, file changes, plan updates, and usage.
2. Later Ardex versions can import this stream through `ardex codex import-jsonl <file>`.
3. MVP does not require Ardex to execute Codex directly.

## 13. SDD Workflow

Required artifacts:

1. Problem statement.
2. Scope and non-goals.
3. User-visible behavior.
4. Data/API changes.
5. Scale report.
6. Toy-level expected output or demo sketch.
7. Verification plan.
8. Task split.

Flow:

```text
goal -> scale check -> expected output -> spec -> tasks -> implementation -> verification -> review -> final evidence
```

Spec quality gate:

1. At least one user-facing acceptance criterion.
2. At least one verification method.
3. Explicit non-goals for scope control.
4. Scale report attached or explicitly waived.

Expected-output gate:

1. Before full implementation, show what the feature should feel like when done.
2. Acceptable forms: toy CLI transcript, wireframe, mocked screenshot, storyboard, small prototype, or local demo URL.
3. Ask user for feedback when UX, scope, or workflow assumptions are material.

## 14. VDD Workflow

Required artifacts for UI work:

1. Target user and main workflow.
2. Screen/state inventory.
3. Responsive constraints.
4. Toy-level visual output before full implementation.
5. Visual evidence: screenshot or recording.
6. Interaction evidence when relevant.

Visual quality gate:

1. Must run local UI or open generated artifact.
2. Must attach screenshot.
3. Must note viewport/device used.
4. Must record defects found and fixed, or explain residual risk.
5. Must collect user feedback on toy output when the final UX is still ambiguous.

## 15. Subagent Workflow

Ardex models subagent work as task ownership.

Rules:

1. Each subagent gets a bounded task.
2. Each task has a disjoint file or responsibility scope.
3. Parent session owns integration and final evidence.
4. Subagent result is not done until parent attaches verification evidence.
5. Agent assignment follows scale estimate instead of giving equal agents to unequal work.
6. If sibling task weights differ by more than `3x`, split or merge before spawning agents.
7. `statement.subagents.required` is true when open tasks have `subagent:<role>` owners.
8. UserPromptSubmit hook context must include pending subagent task ids, roles, status, and instruction to spawn/use one bounded subagent per task when available.
9. If subagent tools are unavailable, Codex must report that limitation instead of silently doing subagent-owned implementation in the main context.

Task owner examples:

```text
main
subagent:explorer-1
subagent:worker-2
user
```

## 16. Quality Gates

Gate types:

1. `none`: planning or note task.
2. `scale`: scale-sensitive task.
3. `spec`: spec-sensitive task.
4. `test`: test-sensitive task.
5. `visual`: visual-sensitive task.
6. `demo`: demo-sensitive task.
7. `review`: review-sensitive task.

Default mapping:

1. Roadmap/planning: `scale`.
2. Backend code: `test`.
3. Frontend UI: `visual`.
4. Docs/spec: `review`.
5. Generated asset: `visual`.
6. Release/PR: `demo`.

## 16.1 Gate Enforcement Matrix

Quality gate labels are routing and UX hints by default. Hard failures are reserved for Ardex-only missing controls: progress, paused state, open asks, and scale blocks.

| Operation | Required condition | Failure code |
| --- | --- | --- |
| `session set status scaling` | goal or selected task exists | `TRANSITION_REJECTED` |
| `session set status specifying` | latest scale report exists, or scale waiver exists | `SCALE_SPLIT_REQUIRED` |
| `session set status implementing` | no unsplit estimate `>13`; no blocking file finding; current task exists | `SCALE_BLOCKING_FINDING` |
| `task done` | `progress == 1` and task is not paused/dropped | `TRANSITION_REJECTED` |
| `task done` while latest scale has blocking findings | blocking findings waived or resolved | `SCALE_BLOCKING_FINDING` |
| `task done` with open project asks | no open asks | `TRANSITION_REJECTED` |
| `session done` | no open tasks; no open asks | `TRANSITION_REJECTED` |

Waiver rules:

1. Waiver requires `--reason` with at least 20 characters.
2. Waiver is stored on the relevant finding row, not as generic evidence unless the user explicitly asks.
3. Waiver must record actor, target, reason, and current target hash when available.
4. Stale waiver cannot satisfy a gate.

## 16.2 Production Readiness Gate

Production quality tasks can require a release-candidate gate before `session done`.

Readiness checklist:

1. Acceptance criteria mapped to evidence.
2. Happy path demonstrated.
3. Error, empty, and loading states handled for UI work.
4. Meaningful tests or explicit test waiver exists.
5. UX/DX review note exists.
6. Logs, config, and run instructions are sufficient.
7. No unrelated large diff, debug leftovers, or untracked generated junk.
8. Golden path demo exists: local URL, screenshot, transcript, or minimal usage example.

CLI:

```bash
ardex -p <project_id> readiness check
ardex -p <project_id> readiness check --json
ardex -p <project_id> acceptance add --feature <feature_id> "criterion"
ardex -p <project_id> acceptance link --criterion <id> --evidence <evidence_id>
```

## 17. Progress Calculation

Task progress is manually settable but constrained.

Recommended defaults:

1. `0.0`: created.
2. `0.2`: accepted scope.
3. `0.3`: scale checked and split decisions recorded.
4. `0.4`: implementation started.
5. `0.7`: implementation complete.
6. `0.9`: verification complete.
7. `1.0`: reviewed and done.

Project progress:

```text
sum(task.progress * task.importance) / sum(task.importance)
```

If importance is missing, use `0.5`.

## 18. Install And Runtime

Expected user flow:

```bash
npm i -g ardex
ardex init
ardex start
ardex project ls
```

`ardex start` behavior:

1. Starts daemon if not running.
2. Prints web UI URL.
3. Reuses existing daemon when alive.
4. Writes PID/port to `~/.ardex/config.json`.

Daemon port:

1. Default `17373`.
2. If busy, choose next open port and persist it.

## 19. MVP Scope

MVP should ship:

1. `ardex init/check/start/stop/status`.
2. SQLite storage.
3. Project add/list/current.
4. Session current/start/set.
5. Scale check for file tree, line counts, task weights, and split recommendations.
6. Task CRUD with priority shifting.
7. Evidence add/list.
8. Ask add/list/answer.
9. Web dashboard with live updates.
10. Ardex Codex skill injection.
11. Optional Ardex Codex hook install.

Defer:

1. GPT-5.5 Pro advisor execution.
2. Automatic Codex metadata parsing beyond path-based project matching.
3. Remote sync.
4. Authentication beyond local-only binding.
5. Full task dependency graph.
6. Sophisticated semantic scale estimation beyond heuristic plus low-model summaries.

## 20. Security And Privacy

1. Bind daemon to `127.0.0.1` by default.
2. Do not expose web UI on LAN unless explicitly configured.
3. Store only local file paths and summaries by default.
4. Avoid storing full command output unless requested.
5. Redact obvious secrets from command evidence.
6. Keep model advisor opt-in because it may send code/context externally.
7. Enforce strict `Origin` checks for browser requests.
8. Disable wildcard CORS.
9. Require a local CSRF token for mutating web UI requests.
10. Reject artifact paths outside `~/.ardex/artifacts` unless explicitly attached as external references.
11. Normalize and realpath all file paths before storage.
12. Reject symlink traversal from artifact operations.
13. Truncate command output before storage; default max is `12000` characters.
14. Store `raw_truncated=true` when output is truncated.
15. Copy screenshots into Ardex artifacts by default; external references are allowed only with explicit `--reference`.

Secret redaction v0:

```text
sk-[A-Za-z0-9_-]{20,}
[A-Za-z0-9_]*API_KEY[A-Za-z0-9_]*=\\S+
[A-Za-z0-9_]*TOKEN[A-Za-z0-9_]*=\\S+
[A-Za-z0-9_]*SECRET[A-Za-z0-9_]*=\\S+
-----BEGIN [A-Z ]*PRIVATE KEY-----
```

Redacted values are stored as `[REDACTED:<kind>]`.

## 21. Open Design Questions

MVP decisions:

1. `project current` uses cwd/path matching only.
2. `ask -a` records an assumed answer with `answer_source=assumed`.
3. Internal ids use ULID; CLI display uses aliases like `t_001`.
4. Daemon auto-start is enabled for most commands; `--no-start` disables it.
5. Quality gates are hard fail by default.
6. Line-count thresholds have global defaults and project overrides.
7. Scale waivers become stale when target file metadata or hash changes.

Remaining open questions:

1. Should web UI be bundled into the npm package or generated under `~/.ardex/server`?
2. Which low-cost model should run scale estimation, and how much context can it receive?
3. What exact Codex thread metadata adapter should be added after cwd/path MVP?
4. Should Ardex later ship as a Codex plugin rather than only npm package + skill/hooks?

## 21.1 Required Validation Scenarios

Init/start/check:

1. `ardex init` creates `~/.ardex/config.json`, DB, log dir, artifact dir, and `$HOME/.agents/skills/ardex/SKILL.md`.
2. `ardex start` binds to `127.0.0.1`.
3. Running `ardex start` again reuses the existing daemon.
4. `ardex check --json` returns daemon URL and DB path.

Project detection:

1. Nested cwd under a registered project returns that project.
2. When registered project paths are nested, nearest path wins.
3. Stale project path returns `PROJECT_PATH_STALE`.

Task priority:

1. Moving a task to priority `2` shifts existing priority `2+` tasks down.
2. No duplicate `(project_id, priority)` remains after transaction.

Gate failure:

1. `quality_gate=test` task cannot be done without passing test evidence.
2. `pass=false` test evidence does not satisfy the test gate.
3. Visual gate requires screenshot or URL evidence.
4. Session done fails with open tasks, open asks, or missing final evidence.

Scale blocking:

1. Source file over `1500` lines creates block finding.
2. Generated/vendor/lock files are excluded from block findings.
3. Stale waiver does not permit implementation.
4. Task weight `>13` requires split before implementation.

Evidence security:

1. API-key-like strings are redacted before storage.
2. Long output is truncated.
3. Artifact path traversal is rejected.

UI e2e:

1. First viewport shows implementation level, progress, current focus, readiness, blocker, and latest visible outputs.
2. CLI task progress update appears through SSE without reload.
3. Answering an ask in UI clears blocked state when no other blockers remain.

Codex integration smoke:

1. Installed skill appears in Codex skill list after restart or reload.
2. Running `ardex init` repeatedly leaves exactly one Ardex entry per managed hook event.
3. `UserPromptSubmit` hook injects current statement context.
4. `Stop` hook reports hard Ardex blockers.
5. No Ardex-managed `PostToolUse` hook is installed by default.

## 22. Autonomous Production Scope

The production harness is not complete until the following behaviors are deterministic and visible in CLI, API, hooks, and dashboard.

### Daemon Auto-Start

All CLI and hook entry points except `init`, `start`, `stop`, `check`, `status`, and `daemon run` auto-start the daemon by default before reading or mutating Ardex state. `--no-start` disables this behavior and returns `DAEMON_UNAVAILABLE` when the daemon is required but not healthy.

Hooks must degrade gracefully:

1. Try `ardex check --json`.
2. If unavailable, run `ardex start --json`.
3. If start fails, allow the Codex turn to continue and emit short diagnostic context instead of crashing the hook.

Hook installation must be idempotent. `ardex init` removes stale Ardex-managed hook entries for `UserPromptSubmit`, `Stop`, and legacy `PostToolUse` before installing the current entries, and it preserves non-Ardex hook entries.

`UserPromptSubmit` injects the current Ardex statement into Codex context every turn. This is the fallback for cases where a Codex agent does not spontaneously follow the Ardex skill instructions. The injected context includes project, session, agent activity, current task, owner, next expected action, blockers, and mandatory workflow rules.

`ardex statement --json` is an enforcing read, not a passive read. Before returning the statement it synchronizes the current session workflow from authoritative state:

1. Open asks force `blocked` and `next_expected_action = answer_ask`.
2. Active task forces `implementing`.
3. Active task with `progress >= 1` forces `verifying`.
4. Paused task forces `blocked` and `next_expected_action = wait_for_resume:<task>`.
5. Clear scale report with open tasks forces `specifying` and `next_expected_action = claim_task`.
6. Split-required scale report forces `scaling` and `next_expected_action = split_or_waive_scale`.
7. Completed final task moves the session to `reviewing`.
8. Every workflow mutation updates `last_seen_at`; dashboard polling must not update `last_seen_at`.

Agent running state is derived from `sessions.last_seen_at`, not from dashboard polling. A session is `running` when it is in a non-terminal, non-blocked status and was seen within the configured freshness window; otherwise it is `idle`.

Existing installs must migrate automatically after package upgrades:

1. `ardex check`, `ardex start`, `ardex status`, and stateful CLI commands run install migration before their normal operation.
2. Migration runs SQLite migrations, refreshes managed `$HOME/.agents/skills/ardex/SKILL.md`, refreshes managed hook scripts, removes stale Ardex-owned hook entries, and writes current hook entries.
3. Managed Ardex files may be overwritten when stale.
4. Non-Ardex hooks and config entries must be preserved.
5. Repeated migration must be idempotent and avoid rewriting files when generated content is already current.
6. If a daemon is already running with an older package version, `ardex start` and stateful CLI auto-start paths stop it and start the current daemon version.

### Codex Project/Thread Migration

`ardex project migrate-codex` scans `$CODEX_HOME` or `$HOME/.codex` for project-like absolute paths in known JSON/JSONL/TOML/text metadata. It must:

1. Register only paths that exist on disk.
2. Canonicalize by realpath.
3. Deduplicate nested and repeated records.
4. Prefer the closest matching project root when nested paths overlap.
5. Record migration evidence with discovered count and skipped count.

Migration is best-effort because Codex internal metadata is not a stable API. Ardex must not require private Codex metadata for normal operation.

### Task Runtime And Pause/Resume

Tasks must record active execution history, not only current status.

Required task fields:

1. `started_at`: first claim/resume timestamp.
2. `paused_at`: current pause timestamp, nullable.
3. `resumed_at`: last resume timestamp, nullable.
4. `active_seconds`: accumulated runtime excluding paused time.
5. `pause_reason`: latest pause reason, nullable.

Required task event types:

`created | claimed | paused | resumed | progress | owner_changed | priority_changed | edited | deleted | completed | checklist`

Pause semantics:

1. `task <id> pause --reason "..."` sets status `paused`, accumulates runtime, clears session `current_task_id`, and records an event.
2. `task <id> resume` sets status `active`, sets session `current_task_id`, updates `resumed_at`, and records an event.
3. A paused task is not counted as active work but remains an open task.
4. Dashboard must show paused tasks, pause reason, and runtime.

### Task Edit/Delete/Reorder

Task edit, delete, and priority reorder must be available from CLI/API. The dashboard exposes task creation and priority reorder as user-facing mutations; status, progress, owner, pause/resume, done, and delete are agent-owned controls.

1. `task <id> set priority N` shifts other priorities and leaves no duplicates.
2. `task <id> delete` drops the task, compacts priorities, clears session references, and records a delete event before removal.
3. UI priority updates use the same repository functions as CLI.
4. SSE updates must show create/reorder/delete/status/progress changes without reload and without stealing focused input.

### Subagent Ownership

Task owner is a first-class routing hint:

1. `main`: current Codex agent owns the task.
2. `subagent:<role>`: work should be delegated to a subagent role such as `explorer`, `worker`, `reviewer`, or custom role.
3. `user`: blocked on user action.

Dashboard must show owner on every task. Owner reassignment is CLI/API controlled so Codex or scale split can route work without turning the user dashboard into an agent control panel. Scale recommendations may set owner automatically when generating split tasks.

### Ask Answer Resume Loop

When an ask is answered:

1. Ask status becomes `answered`.
2. If no other open asks exist, blocked sessions restore `previous_status`.
3. `next_expected_action` becomes `resume:<task_id>` when a current or latest paused/active task exists.
4. Dashboard shows the answered ask and the resumed next action immediately through SSE.
5. Codex startup/Stop hooks read `ardex statement --json` and continue from `resume:<task_id>` instead of asking the same question again.

### SDD/VDD Context Artifacts

Spec-driven and visual-driven tasks may attach external artifacts, but Ardex must not require artifacts that Codex already tracks in the transcript.

Optional artifact types:

1. `note`: user decision, manual QA note, or handoff summary.
2. `url`: demo, deploy preview, or external reference.
3. `screenshot` / `generated_image`: visual artifact that is useful in the dashboard.
4. `prototype`: runnable toy/demo scenario output outside Codex transcript.

Generated images may be stored as `generated_image` evidence with `payload.path` or `payload.url`. Dashboard renders HTTP image URLs inline and lists local artifact paths safely.

### Scale-Based Roadmap Split And Assignment

Scale reports must drive planning, not only blocking.

1. Weight `>13`, `recommendedAgent=split`, or blocking source files create split recommendations.
2. `scale split --task <id>` creates child tasks with balanced estimated weights.
3. Generated child tasks inherit quality gate, acceptance context, and priority order.
4. Child owners are assigned to unique roles such as `subagent:worker-1`, `subagent:worker-2`, and remain bounded to their generated slice. Main context owns integration/review.
5. The dashboard shows roadmap imbalance and owner distribution before implementation starts.

### Production Checklist

Before `task done`, Ardex runs a deterministic checklist:

1. Progress is `1`.
2. Latest scale report is not blocking implementation.
3. Open asks do not target the task.
4. Runtime/pause state is coherent.
5. `quality_gate` is shown as an advisory label, not an evidence requirement.

The checklist is returned by `task <id> checklist --json`, shown in the dashboard, and stored as a `checklist` task event when `done` is attempted.

## 23. First Implementation Plan

Phase 0: Core shell

1. Create command parser.
2. Create SQLite migration runner.
3. Create daemon lifecycle.
4. Add JSON envelope and exit code handling.

Phase 1: CLI and storage

1. Implement canonical schema.
2. Implement project/session/task CRUD.
3. Implement priority shifting transaction.
4. Implement session statement.

Phase 2: Evidence and asks

1. Add evidence model.
2. Add ask model.
3. Enforce task done gates.
4. Add JSON output mode.

Phase 3: Scale and gates

1. Add file tree scanner with ignore rules.
2. Add line count and file role classification.
3. Add scale estimate and file finding tables.
4. Add `scale check/report/waive` commands.
5. Enforce scale gate before implementation.

Phase 4: Web UI

1. Add local dashboard.
2. Add realtime events.
3. Add task board.
4. Add evidence/ask detail views.

Phase 5: Codex integration

1. Generate Ardex skill.
2. Add optional hooks.
3. Add optional custom agents.
4. Add bootstrapping instructions.
5. Test from a real Codex session.
6. Tune workflow friction.

Phase 6: Deferred automation

1. Add `codex exec --json` import adapter.
2. Add low-model scale estimator.
3. Add advisor execution.

Phase 7: Autonomous production harness

1. Enforce daemon auto-start in CLI and hooks.
2. Add Codex project/thread migration adapter.
3. Add task runtime events, pause/resume, edit/delete/reorder, and owner assignment.
4. Add ask answered resume loop.
5. Add optional SDD/VDD artifact display and lightweight production checklist.
6. Add scale split to roadmap tasks with owner routing.
7. Add generated image/scenario output panels to dashboard.
