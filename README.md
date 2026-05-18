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

## Phase 2 Commands

```bash
bun run index.ts -p p_001 evidence add test --task t_001 --cmd "bun test" --pass true --summary "passed"
bun run index.ts -p p_001 evidence add screenshot --task t_001 --path ./shot.png --status candidate
bun run index.ts -p p_001 evidence e_002 accept
bun run index.ts -p p_001 evidence ls --task t_001 --json
bun run index.ts -p p_001 ask "Which UX direction?"
bun run index.ts -p p_001 ask a_001 answer "Use compact dashboard"
```

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
- `$HOME/.ardex/hooks/stop-check.mjs`
- `$HOME/.ardex/hooks/post-tool-use-evidence.mjs`
- `$HOME/.codex/hooks.json` entries for `Stop` and `PostToolUse`

For tests or isolated installs:

```bash
ARDEX_HOME=/tmp/ardex \
ARDEX_SKILL_ROOT=/tmp/skills \
ARDEX_CODEX_HOME=/tmp/codex \
bun run index.ts init
```

Dashboard controls support session start/status/done, task add/claim/progress/done, scale check/waiver, ask answer, and evidence accept/reject.

Autonomous workflow controls now also include:

- daemon auto-start for stateful CLI/hook paths
- `project migrate-codex` for best-effort `$HOME/.codex` project migration
- task pause/resume/delete/owner assignment with runtime and event history
- ask answer resume markers through `statement.nextExpectedAction`
- SDD/VDD artifact evidence: `spec`, `acceptance`, `generated_image`, `browser_diff`, `prototype`
- production checklist before `task done`
- scale-based child task generation with `subagent:<role>` owner routing
- dashboard output panel for generated images, screenshots, prototypes, URLs, and browser diffs

API contract: [docs/API.md](docs/API.md)

Security notes: [docs/SECURITY.md](docs/SECURITY.md)

## Verification

```bash
bun run check
bun test
```
