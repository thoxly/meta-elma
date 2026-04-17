# Architecture Map

## Repository type

This project is a `pnpm` monorepo.

## Layers

- Delivery:
  - `apps/web` (React/Vite UI)
  - `apps/api` (Fastify HTTP API)
- Domain and contracts:
  - `packages/domain` (entities and repository/service ports)
  - `packages/contracts` (shared HTTP response/request types for API/Web)
- Integration adapters:
  - `packages/storage` (YDB adapter)
  - `packages/elma-adapter` (ELMA API integration)
  - `packages/llm-adapter` (OpenAI Responses integration)
  - `packages/security` (JWT, password hashing, credential encryption)
  - `packages/context-engine` (compact context builder)
- Infra:
  - `terraform` (Yandex Cloud container + API gateway + YDB)

## API internal structure

`apps/api/src`:

- `config/env.ts` - validated runtime environment.
- `app.ts` - composition root and route registration.
- `main.ts`/`server.ts` - process start.
- `modules/*`:
  - `auth`, `connections`, `jobs`, `schema`, `chat`, `traces`.
- `shared/http/*`:
  - auth guard and error envelope.

## Data flow

1. Web calls API endpoints from `apps/web/src/api.ts`.
2. API handlers validate input, require auth, call service logic.
3. Services use adapters from shared packages.
4. YDB persists lifecycle/auth/chat/trace state.
5. Terraform API gateway routes public HTTP paths to API container.

## Architectural constraints

- Keep ELMA integration layer separate from LLM layer.
- Keep HTTP transport thin; business logic belongs to `modules/*` services.
- Shared API contracts live in `packages/contracts` to reduce web/api drift.
