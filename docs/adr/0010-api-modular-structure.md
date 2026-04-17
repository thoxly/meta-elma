# ADR 0010: API Modular Structure

## Status

Accepted

## Context

`apps/api/src/server.ts` was a single large file mixing:

- server bootstrap,
- transport handlers,
- auth checks,
- lifecycle/job orchestration,
- chat flow.

This increased regression risk and made review/testing difficult.

## Decision

Split API into:

- `app.ts` composition root,
- `main.ts` runtime start,
- `modules/*` route groups and services,
- `shared/http/*` for auth guard and error envelope,
- `config/env.ts` for validated runtime config.

## Consequences

- Better boundaries for maintenance and future tests.
- Safer incremental refactoring without big-bang rewrite.
