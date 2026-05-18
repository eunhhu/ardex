# ardex

Local control plane for Codex work.

## Install

Ardex is Bun-based.

```bash
npm i -g ardex
ardex init
ardex start
open http://127.0.0.1:17373
```

For local development:

```bash
bun install
bun run index.ts init
```

## Development

Install dependencies:

```bash
bun install
```

Run the CLI:

```bash
bun run index.ts
```

Typecheck:

```bash
bun run check
```

## Phase 0 Commands

```bash
bun run index.ts init
bun run index.ts start
bun run index.ts check --json
bun run index.ts status
bun run index.ts stop
```

Use `ARDEX_HOME=/tmp/ardex-test` to test without touching `~/.ardex`.

## Phase 1 Commands

```bash
bun run index.ts project add /path/to/project
bun run index.ts project current --json
bun run index.ts -p p_001 session start --goal "Build MVP"
bun run index.ts -p p_001 task add "Implement storage" --priority 1
bun run index.ts -p p_001 task t_001 claim
bun run index.ts -p p_001 task t_001 pause --reason "waiting for user feedback"
bun run index.ts -p p_001 task t_001 resume
bun run index.ts -p p_001 task t_001 assign subagent:worker
bun run index.ts -p p_001 task t_001 set progress 1
bun run index.ts -p p_001 task t_001 checklist --json
bun run index.ts -p p_001 task t_001 done
bun run index.ts -p p_001 task t_001 events --json
bun run index.ts -p p_001 statement --json
```

## Optional Artifact Commands

```bash
bun run index.ts -p p_001 evidence add url --task t_001 --url http://localhost:3000 --summary "local demo"
bun run index.ts -p p_001 evidence add note --task t_001 --summary "user approved compact layout"
bun run index.ts -p p_001 evidence e_002 accept
bun run index.ts -p p_001 evidence ls --task t_001 --json
bun run index.ts -p p_001 ask "Which UX direction?"
bun run index.ts -p p_001 ask a_001 answer "Use compact dashboard"
```

Ardex evidence is optional. Do not duplicate Codex command logs, file diffs, or test output. Use evidence only for user decisions, external URLs, manual QA notes, deploy links, and artifacts Codex cannot reconstruct from its own transcript.

## Phase 3 Commands

```bash
bun run index.ts -p p_001 scale check --path src
bun run index.ts -p p_001 scale report --json
bun run index.ts -p p_001 scale report --all
bun run index.ts -p p_001 scale split --task t_001
bun run index.ts -p p_001 scale waive sf_001 --reason "Temporary waiver with tracked hash"
bun run index.ts -p p_001 session set status implementing
```

`session set status implementing` fails when the latest scale report has weight `>13` or unresolved blocking file findings.

## Phase 4 Dashboard

```bash
bun run index.ts start
open http://127.0.0.1:17373
curl http://127.0.0.1:17373/api/projects
curl http://127.0.0.1:17373/api/projects/p_001/dashboard
curl -N 'http://127.0.0.1:17373/events?project=p_001'
```

The daemon serves a local dashboard, JSON dashboard snapshots, and SSE updates. The UI can answer open asks and accept or reject candidate evidence.

## Production Harness Features

`ardex init` installs:

- `$HOME/.agents/skills/ardex/SKILL.md`
- `$HOME/.ardex/hooks/user-prompt-context.mjs`
- `$HOME/.ardex/hooks/stop-check.mjs`
- `$HOME/.codex/hooks.json` entries for `UserPromptSubmit` and `Stop`

`ardex init` is idempotent. It removes stale Ardex-managed hook entries before writing the current entries, while preserving non-Ardex hooks.

Existing installs are migrated automatically. `ardex check`, `ardex start`, `ardex status`, and stateful CLI commands refresh the managed skill, hook scripts, hook config entries, install-state, and SQLite migrations before continuing. Managed Ardex files are overwritten when stale; non-Ardex hook entries are preserved. If an older daemon is already running, `ardex start` and stateful CLI auto-start paths restart it with the current package version.

For tests or isolated installs:

```bash
ARDEX_HOME=/tmp/ardex \
ARDEX_SKILL_ROOT=/tmp/skills \
ARDEX_CODEX_HOME=/tmp/codex \
bun run index.ts init
```

Dashboard controls support searchable project switching, session start, detailed task creation, priority reorder, scale check/split/waiver, ask answer, and optional artifact accept/reject. Task status, progress, pause/resume, done, delete, and owner assignment are agent-owned CLI/API controls, so the dashboard shows them as state instead of casual buttons.

The dashboard first viewport is optimized for project review rather than raw evidence browsing: project implementation level, progress, current focus, readiness, visible outputs, and risks are shown first. Evidence remains in storage as agent receipts, but the UI demotes it to a collapsed `Verification Log` so users are not forced to parse command-like proof trails.

Autonomous workflow controls now also include:

- daemon auto-start for stateful CLI/hook paths
- automatic migration for existing managed skill/hook installs after package upgrades
- prompt-time Ardex statement injection through `UserPromptSubmit`
- `project migrate-codex` for best-effort `$HOME/.codex` project migration
- task pause/resume/delete/owner assignment with runtime and event history
- ask answer resume markers through `statement.nextExpectedAction`
- lightweight checklist before `task done`
- scale-based child task generation with unique `subagent:<role>` owners and prompt-time delegation guidance
- dashboard output panel for generated images, screenshots, prototypes, URLs, and browser diffs
- session workflow sync on `statement`, scale, ask answer, claim, progress, pause/resume, delete, and done events so stale `planning` state is corrected before Codex plans
- agent activity derived from session `lastSeenAt` and surfaced in CLI/API/dashboard as `running` or `idle`
- sticky dashboard session strip with agent state, session status, goal, current task, and runtime visible while scrolling

API contract: [docs/API.md](docs/API.md)

Security notes: [docs/SECURITY.md](docs/SECURITY.md)

## Verification

```bash
bun run check
bun test
```
