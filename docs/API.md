# Ardex API Contract

Daemon binds to `127.0.0.1` by default. Responses use one envelope:

```json
{ "ok": true, "data": {}, "meta": { "surface": "dashboard", "version": "0.1.3" } }
```

Errors use:

```json
{
  "ok": false,
  "error": { "code": "VALIDATION_ERROR", "message": "Field title is required.", "details": {} },
  "meta": { "surface": "dashboard", "version": "0.1.3" }
}
```

HTTP status mapping:

- `400`: validation or bad request
- `404`: project/task/evidence/ask not found
- `409`: transition, quality gate, or scale gate rejected
- `500`: internal daemon failure
- `503`: daemon unavailable

## Endpoints

- `GET /health`
- `GET /`
- `GET /api/projects`
  Returns non-archived projects by default.
- `GET /api/projects/:project/dashboard`
  Returns `project: null` when `:project` is archived, while still returning the visible project list.
- `POST /api/projects/:project/rename`
  Body: `{ "name": "string" }`
- `POST /api/projects/:project/archive`
  Soft-archives the project. Archived projects are hidden from `GET /api/projects` and normal dashboard project search.
- `GET /api/projects/:project/artifacts?path=:projectRelativeOrAbsoluteImagePath`
- `GET /events?project=:project`
- `POST /api/projects/:project/session/start`
  Body: `{ "goal": "string", "mode": "sdd_vdd", "model": "string" }`
- `POST /api/projects/:project/session/status`
  Body: `{ "status": "planning|scaling|specifying|implementing|verifying|reviewing|blocked|done" }`
- `POST /api/projects/:project/session/done`
- `POST /api/projects/:project/tasks`
  Body: `{ "title": "string", "content": "string", "priority": 1, "importance": 0.5, "owner": "main|subagent:<role>|user", "qualityGate": "none|scale|spec|visual|test|demo|review" }`
- `POST /api/projects/:project/tasks/:task/claim`
- `POST /api/projects/:project/tasks/:task/pause`
  Body: `{ "reason": "optional string" }`
- `POST /api/projects/:project/tasks/:task/resume`
- `POST /api/projects/:project/tasks/:task/owner`
  Body: `{ "owner": "main|user|subagent:<role>" }`
- `POST /api/projects/:project/tasks/:task/progress`
  Body: `{ "progress": 0.75 }`
- `POST /api/projects/:project/tasks/:task/priority`
  Body: `{ "priority": 2 }`
- `POST /api/projects/:project/tasks/:task/delete`
- `POST /api/projects/:project/tasks/:task/done`
- `GET /api/projects/:project/tasks/:task/checklist`
  Returns deterministic production checklist items.
- `POST /api/projects/:project/asks/:ask/answer`
  Body: `{ "answer": "string" }`
- `POST /api/projects/:project/evidence/:evidence/accept`
  Body: `{ "comment": "optional review comment" }`
- `POST /api/projects/:project/evidence/:evidence/reject`
  Body: `{ "comment": "optional rejection reason" }`
- `POST /api/projects/:project/scale/check`
  Body: `{ "paths": ["src", "web"], "goal": "optional string" }`
- `POST /api/projects/:project/scale/split`
  Body: `{ "taskId": "t_001" }`
- `POST /api/projects/:project/scale/findings/:finding/waive`
  Body: `{ "reason": "at least 20 characters" }`

Dashboard snapshots include task runtime fields (`startedAt`, `pausedAt`, `resumedAt`, `activeSeconds`, `runtimeSeconds`, `pauseReason`), production checklist state, `statement.subagents` delegation guidance, `statement.visualScenario` approval state, `statement.session.agent` activity (`running|idle`, `lastSeenAt`, `staleSeconds`), and output artifacts extracted from accepted `screenshot`, `generated_image`, `prototype`, `url`, and `browser_diff` evidence. Candidate or rejected `generated_image` evidence with `payload.kind="visual_scenario_confirm"` is also included in Visible Outputs for VDD approval.

The dashboard UI exposes user-facing controls for searchable project switching, project rename/archive cleanup, session start, detailed task creation, task priority reorder, ask answer, scale operations, and visual scenario approve/reject with comments. Agent-owned task status, progress, pause/resume, done, delete, and owner mutation remain CLI/API surfaces and are not presented as casual dashboard buttons. A sticky session strip remains visible while scrolling and shows agent activity, session status, goal, current task, and runtime.

The first viewport prioritizes project review: implementation level, progress, current focus, readiness, visible outputs, open asks, and scale risk. Evidence data remains available through the API and dashboard as a collapsed `Verification Log`; it is treated as agent receipts/debug context, not the main user-facing progress model.

Codex hooks are turn-bound. Ardex `Stop` hooks can block turn completion and force the next action, but they cannot pause an already streaming assistant response mid-token. Streaming lock semantics require a Codex runtime-level interrupt API; Ardex treats this as outside the current hook contract.

## Security

- Mutating dashboard endpoints accept local host only.
- Mutating requests with an `Origin` header must match daemon origin.
- JSON request bodies are limited to 64 KB.
- Evidence summary and payload strings are redacted for common API keys, tokens, passwords, and private keys before storage.
