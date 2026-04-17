# Meta ELMA Assistant MVP

B2B multi-tenant read-only AI assistant for ELMA365.

---

## FOLLOW THE RULES in AGENT.md

## Product model

- Each `Company` has many users.
- Each user authenticates in this system with `email + password`.
- Company users create shared `Connection` entries for ELMA.
- Every user stores their own ELMA and LLM tokens per connection.
- Live reads are always user-scoped by that user credential.

## Current architecture

- `apps/api` - Fastify API with auth, connections, snapshots, semantic mapping, chat and traces.
- `apps/web` - React/Vite MVP UI with login and product flows.
- `packages/domain` - canonical domain entities and repository/service ports.
- `packages/security` - password hashing, JWT tokens, credential encryption.
- `packages/storage` - `YdbStorage` repository abstraction used by API.
- `packages/elma-adapter` - ELMA connector for structural snapshot and live reads.
- `packages/context-engine` - compact context builder from snapshot.
- `packages/llm-adapter` - OpenAI Responses integration for answer and semantic generation.
- `terraform` - single source of truth for Yandex Cloud serverless deploy.

## Connections lifecycle (current)

1. Register/Login (`/auth/register`, `/auth/login`).
2. Create shared ELMA connection (`POST /connections` with `displayName + baseUrl + elmaToken`).
3. Read aggregated lifecycle state (`GET /connections`, `GET /connections/:id/state`).
4. Configure and validate ELMA credential (required):
   - `PUT /connections/:id/elma-credentials`
   - `POST /connections/:id/elma-credentials/validate`
5. Configure and validate LLM settings (optional layer for semantic/chat):
   - `PUT /connections/:id/llm-settings`
   - `POST /connections/:id/llm-settings/validate`
6. Run async operational jobs:
   - `POST /connections/:id/jobs` with `type: refresh_schema | generate_semantic`
   - `GET /connections/:id/jobs`
   - `GET /jobs/:jobId`
   - `GET /connections/:id/schema` returns structural snapshot payload collected from ELMA scheme API (`application.fields/forms/permissions/params`, statuses via dedicated statuses endpoint).
7. Review/edit semantic mapping (`GET/PUT /connections/:id/semantic`).
8. Ask chat grounded by snapshot + semantic + optional live lookup (`POST /chat`).
9. Inspect trace payload (`GET /traces/:id`).
10. Refresh/logout auth session:
   - `POST /auth/refresh`
   - `POST /auth/logout`

### Lifecycle semantics

- ELMA connection and LLM settings are different layers.
- ELMA token is mandatory for a working integration flow.
- LLM token is optional until semantic/chat features are needed.
- UI should be driven by `status + capabilities + nextActions` from connection state.
- `snapshotReady` is true only for structurally meaningful snapshots (non-empty namespaces/apps/fields), not just "any ready row in DB".
- Chat is available only when connection is `ready_for_chat`.

## Local development

1. `pnpm install --no-frozen-lockfile`
2. API: `pnpm dev`
3. Web: `pnpm dev:web`

### Required env (API)

- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `CREDENTIAL_MASTER_SECRET`
- `ELMA_BASE_URL` (optional fallback for adapter defaults; runtime calls use `connection.baseUrl`)
- `OPENAI_MODEL` (optional)

### Optional env (Web)

- `VITE_API_URL` (defaults to `http://localhost:8080` in localhost)

## Notes

- Full API contract is in `docs/contracts/api-http.md`.
- Deployment and rollback runbooks are in `docs/runbooks/`.
- Architecture decision notes are in `docs/adr`.
- Storage layer now persists to YDB tables and initializes schema on API startup.
