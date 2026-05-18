# Ardex API Contract

Daemon binds to `127.0.0.1` by default. Responses use one envelope:

```json
{ "ok": true, "data": {}, "meta": { "surface": "dashboard", "version": "0.1.0" } }
```

Errors use:

```json
{
  "ok": false,
  "error": { "code": "VALIDATION_ERROR", "message": "Field title is required.", "details": {} },
  "meta": { "surface": "dashboard", "version": "0.1.0" }
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
- `GET /api/projects/:project/dashboard`
- `GET /events?project=:project`
- `POST /api/projects/:project/session/start`
  Body: `{ "goal": "string", "mode": "sdd_vdd", "model": "string" }`
- `POST /api/projects/:project/session/status`
  Body: `{ "status": "planning|scaling|specifying|implementing|verifying|reviewing|blocked|done" }`
- `POST /api/projects/:project/session/done`
- `POST /api/projects/:project/tasks`
  Body: `{ "title": "string", "content": "string", "priority": 1, "importance": 0.5, "qualityGate": "none|scale|spec|visual|test|demo|review" }`
- `POST /api/projects/:project/tasks/:task/claim`
- `POST /api/projects/:project/tasks/:task/pause`
  Body: `{ "reason": "optional string" }`
- `POST /api/projects/:project/tasks/:task/resume`
- `POST /api/projects/:project/tasks/:task/owner`
  Body: `{ "owner": "main|user|subagent:<role>" }`
- `POST /api/projects/:project/tasks/:task/progress`
  Body: `{ "progress": 0.75 }`
- `POST /api/projects/:project/tasks/:task/delete`
- `POST /api/projects/:project/tasks/:task/done`
- `GET /api/projects/:project/tasks/:task/checklist`
  Returns deterministic production checklist items.
- `POST /api/projects/:project/asks/:ask/answer`
  Body: `{ "answer": "string" }`
- `POST /api/projects/:project/evidence/:evidence/accept`
- `POST /api/projects/:project/evidence/:evidence/reject`
- `POST /api/projects/:project/scale/check`
  Body: `{ "paths": ["src", "web"], "goal": "optional string" }`
- `POST /api/projects/:project/scale/split`
  Body: `{ "taskId": "t_001" }`
- `POST /api/projects/:project/scale/findings/:finding/waive`
  Body: `{ "reason": "at least 20 characters" }`

Dashboard snapshots include task runtime fields (`startedAt`, `pausedAt`, `resumedAt`, `activeSeconds`, `runtimeSeconds`, `pauseReason`), production checklist state, and output artifacts extracted from accepted `screenshot`, `generated_image`, `prototype`, `url`, and `browser_diff` evidence.

## Security

- Mutating dashboard endpoints accept local host only.
- Mutating requests with an `Origin` header must match daemon origin.
- JSON request bodies are limited to 64 KB.
- Evidence summary and payload strings are redacted for common API keys, tokens, passwords, and private keys before storage.
