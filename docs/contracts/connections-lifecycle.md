# Connections Lifecycle Contract

## Scope

This document defines the current public contract for `Connections` lifecycle in MVP.

## Core principle

- ELMA connection and LLM settings are separate layers.
- ELMA token is required for integration setup.
- LLM token is optional until semantic/chat capabilities are needed.

## Aggregated state response

`GET /connections` and `GET /connections/:id/state` return an aggregated object:

- `connection`: base metadata (`connectionId`, `displayName`, `baseUrl`, `system`)
- `status`: derived lifecycle status
- `health`: component-level readiness flags
- `capabilities`: action availability flags
- `nextActions`: machine-readable next-step hints
- `latest`: latest snapshot/semantic metadata

## Lifecycle statuses

- `requires_elma_token`
- `elma_invalid`
- `schema_missing`
- `schema_syncing`
- `llm_missing`
- `semantic_missing`
- `semantic_generating`
- `ready_for_chat`
- `requires_action`

## Settings endpoints

ELMA (required):

- `PUT /connections/:id/elma-credentials`
- `POST /connections/:id/elma-credentials/validate`

LLM (optional):

- `PUT /connections/:id/llm-settings`
- `POST /connections/:id/llm-settings/validate`

## Operational jobs

- `POST /connections/:id/jobs` with `type`:
  - `refresh_schema`
  - `generate_semantic`
- `GET /connections/:id/jobs`
- `GET /jobs/:jobId`

Job statuses:

- `queued`
- `running`
- `succeeded`
- `failed`
- `canceled`

## Chat readiness

Chat flow (`POST /chat`) expects:

- ELMA credential present
- LLM credential present
- snapshot exists
- semantic mapping exists and matches current snapshot

