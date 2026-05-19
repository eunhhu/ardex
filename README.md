# ardex

Local autonomy control plane for Codex work.

Ardex lets Codex agents run long, parallel workflows while keeping project ownership, approvals, progress, artifacts, and risk visible to humans. It installs a local CLI, Codex skill, hooks, SQLite state, and a dashboard served on `127.0.0.1`.

It is currently Bun-based: npm can install and publish the package, but the `ardex` executable uses `#!/usr/bin/env bun`, so Bun must be available on machines that run it.

## Quick Start

Install Bun first if needed:

```bash
curl -fsSL https://bun.sh/install | bash
```

Install globally with npm:

```bash
npm install -g ardex
ardex init
ardex start
open http://127.0.0.1:17373
```

Run without a global install:

```bash
npx ardex init
npx ardex start
open http://127.0.0.1:17373
```

Or with Bun's package runner:

```bash
bunx ardex init
bunx ardex start
open http://127.0.0.1:17373
```

`npx` still needs Bun on `PATH` because the published CLI entrypoint is executed by Bun, not Node.

## Daily Use

Initialize once:

```bash
ardex init
```

Start or check the local daemon:

```bash
ardex start
ardex check --json
```

Open the dashboard:

```bash
open http://127.0.0.1:17373
```

Use the dashboard to review project/session state, visible outputs, decisions, scale risk, and VDD scenario approvals. Use the CLI for agent-owned workflow mutations such as task claim, pause/resume, owner assignment, progress, checklist, and done.

Common CLI flow:

```bash
ardex project add /path/to/project
ardex project current --json
ardex -p p_001 session start --goal "Build MVP"
ardex -p p_001 task add "Implement storage" --priority 1
ardex -p p_001 statement --json
ardex -p p_001 task t_001 claim --json
ardex -p p_001 task t_001 checklist --json
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
bun run index.ts -p p_001 task t_001 scenario --json
bun run index.ts -p p_001 statement --json
```

## Optional Artifact Commands

```bash
bun run index.ts -p p_001 evidence add url --task t_001 --url http://localhost:3000 --summary "local demo"
bun run index.ts -p p_001 evidence add generated_image --task t_001 --path output/scenario.png --kind visual_scenario_confirm --status candidate --summary "expected UX scenario"
bun run index.ts -p p_001 evidence add note --task t_001 --summary "user approved compact layout"
bun run index.ts -p p_001 evidence e_002 accept --comment "approved direction"
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

## Phase A Autonomy Primitives

Phase A adds visibility and control-plane records for agent work. It records `AgentRun`, `AgentAction`, and Decision Queue state through CLI/API/dashboard surfaces. It does not make the daemon spawn Codex subagents, create worktrees, merge patches, or run unattended swarms; Codex still launches and coordinates subagents outside the daemon while Ardex tracks what is happening.

```bash
bun run index.ts -p p_001 agent-run start --task t_001 --owner subagent:docs --model gpt-5 --json
bun run index.ts -p p_001 agent-run ls --status running --json
bun run index.ts -p p_001 agent-run heartbeat <run_id> --status running --json
bun run index.ts -p p_001 agent-run done <run_id> --summary "Docs complete" --json
bun run index.ts -p p_001 agent-run fail <run_id> --reason "Blocked by missing API contract" --json

bun run index.ts -p p_001 agent-action add --run <run_id> --type file --summary "Update API docs" --payload '{"file":"docs/API.md","progress":0.4}' --json
bun run index.ts -p p_001 agent-action ls --run <run_id> --json
bun run index.ts -p p_001 agent-action end <action_id> --status completed --json

bun run index.ts -p p_001 decision ls --status open --json
bun run index.ts -p p_001 decision add --task t_001 --run <run_id> --question "Expand API docs?" --option approve:"Document contract" --option reject:"Keep roadmap only" --priority 1 --json
bun run index.ts -p p_001 decision <decision_id> answer approve --json
bun run index.ts -p p_001 decision <decision_id> dismiss --json
```

Use agent runs for leased work, agent actions for readable timeline chapters, and decisions for approvals or choices that should block only the affected task/run.

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
- VDD visual scenario gate: `qualityGate=visual` or an explicit visual approval/checkpoint request must create a scenario prompt, attach a candidate output with `kind=visual_scenario_confirm`, and get dashboard approval before implementation claim/done. Generic UI/UX/frontend/dashboard/CSS wording alone is advisory and does not force imagegen.
- scale-based child task generation with unique `subagent:<role>` owners and prompt-time delegation guidance
- dashboard output panel for generated images, screenshots, prototypes, URLs, browser diffs, and pending visual scenario approvals with review comments
- session workflow sync on `statement`, scale, ask answer, claim, progress, pause/resume, delete, and done events so stale `planning` state is corrected before Codex plans
- agent activity derived from session `lastSeenAt` and surfaced in CLI/API/dashboard as `running` or `idle`
- sticky dashboard session strip with agent state, session status, goal, current task, and runtime visible while scrolling

The next autonomy layer is specified around `AgentRun`, `AgentAction`, `Decision Queue`, autonomy budgets, async gates, and a control-room dashboard. Gates should not kill autonomy: missing scale should trigger an automatic scale check, missing visual approval should create a candidate output and wait while independent tasks continue, and open decisions should block only affected work.

API contract: [docs/API.md](docs/API.md)

Security notes: [docs/SECURITY.md](docs/SECURITY.md)

## Verification

```bash
bun run check
bun test
```

## Release

Release automation lives in [`.github/workflows/release.yml`](.github/workflows/release.yml). Pull requests, `main` pushes, and version tags run typecheck, tests, and the web build. Tags named `v*` also attempt `npm publish --access public` when `NPM_TOKEN` is configured; without the token, the tag build verifies and skips publishing.

Before publishing locally or tagging a release:

```bash
bun install --frozen-lockfile
bun run check
bun test
bun run build
npm pack --dry-run
```
