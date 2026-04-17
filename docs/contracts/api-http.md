# API HTTP Contract

## Scope

Source of truth for current HTTP contract between `apps/api`, `apps/web`, and infra gateway.

## Auth

- `POST /auth/register` -> `{ tokens, user }`
- `POST /auth/login` -> `{ tokens, user }`
- `POST /auth/refresh` -> `{ tokens }`
- `POST /auth/logout` -> `{ ok: true }`

`tokens`:

- `accessToken: string`
- `refreshToken: string`

## Connections

- `POST /connections` body: `{ displayName, baseUrl, elmaToken }` -> full connection object.
- `GET /connections` -> `{ items: ConnectionState[] }`
- `GET /connections/:id/state` -> `ConnectionState`
- `DELETE /connections/:id` -> `{ ok: true }`

## Credentials and semantic

- `PUT /connections/:id/elma-credentials` body `{ elmaToken }` -> `{ ok: true }`
- `POST /connections/:id/elma-credentials/validate` -> `{ ok: true, externalUserId? }`
- `PUT /connections/:id/llm-settings` body `{ llmToken }` -> `{ ok: true }`
- `POST /connections/:id/llm-settings/validate` -> `{ ok: true }`
- `GET /connections/:id/semantic` -> full semantic mapping object.
- `PUT /connections/:id/semantic` body `SemanticMappingDraft` -> `{ ok: true }`

## Jobs

- `POST /connections/:id/jobs` body `{ type: "refresh_schema" | "generate_semantic" }` -> `{ jobId, status }`
- `GET /connections/:id/jobs` -> `{ items: ConnectionJob[] }`
- `GET /jobs/:jobId` -> `ConnectionJob`

## Schema, chat, trace

- `GET /connections/:id/schema` -> `{ snapshotId, version, createdAt, payload }`
- `POST /chat` body `{ connectionId, question, chatSessionId?, entity? }` -> `{ chatSessionId, answer, traceId }`
- `GET /chat/sessions` -> `{ items: ChatSession[] }`
- `GET /chat/sessions/:id` -> `{ session, messages }`
- `GET /traces/:id` -> `Trace`

## Health and readiness

- `GET /health` -> `{ status: "ok" }`
- `GET /ready` -> `{ status: "ready", checks }` or `503` with `{ status: "not_ready", failed }`

## Error envelope

Every handled error is returned as:

```json
{ "error": "message", "code": "OPTIONAL_CODE", "details": {} }
```

`error` is stable human-readable text, `code` is machine-oriented classifier.
