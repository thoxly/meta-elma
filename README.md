# Meta ELMA Assistant MVP

B2B multi-tenant read-only AI assistant for ELMA365.

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

## MVP workflows implemented
1. Register/Login (`/auth/register`, `/auth/login`).
2. Create connection (`/connections`).
3. Attach/update user credentials (`/connections/:id/credentials`).
4. Refresh structural snapshot (`/connections/:id/snapshot/refresh`).
5. Generate semantic mapping on demand (`/connections/:id/semantic/generate`).
6. Review/edit semantic mapping (`GET/PUT /connections/:id/semantic`).
7. Ask chat grounded by snapshot + optional live lookup (`/chat`).
8. Inspect trace payload (`/traces/:id`).

## Local development
1. `pnpm install --no-frozen-lockfile`
2. API: `pnpm dev`
3. Web: `pnpm dev:web`

### Required env (API)
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `CREDENTIAL_MASTER_SECRET`
- `ELMA_BASE_URL` (optional, defaults to `https://api.elma365.com`)
- `OPENAI_MODEL` (optional)

### Optional env (Web)
- `VITE_API_URL` (defaults to `http://localhost:8080` in localhost)

## Notes
- `infra/` is legacy baseline and not used by active deploy workflow.
- Deployment instructions are in `docs/deploy.md`.
- Architecture decision notes are in `docs/adr`.
- Storage layer now persists to YDB tables and initializes schema on API startup.
