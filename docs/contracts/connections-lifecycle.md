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

- `POST /connections` with `displayName`, `baseUrl`, `elmaToken` (creates connection and validates URL/token immediately)
- `PUT /connections/:id/elma-credentials`
- `POST /connections/:id/elma-credentials/validate`
- `DELETE /connections/:id` (deletes connection and lifecycle data)

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

## Schema snapshot contract

`GET /connections/:id/schema` returns:

- `snapshotId`
- `version`
- `createdAt`
- `payload`

`payload` is a structural ELMA snapshot (not runtime-item sample) and contains:

- `baseUrl`, `collectedAt`
- `namespaces[]` with nested `apps[]`, `pages[]`, `processes[]`
- flat `apps[]`, `pages[]`, `processes[]`, `groups[]` for backward compatibility
- per-app details from ELMA schema:
  - `namespace`, `code`, `name`, `elementName`, `type`, `meta`
  - `fields[]` with raw ELMA field metadata (`view`, `data`, formula/index/search flags)
  - `forms`, `permissions`, `params`
  - `statuses` loaded via dedicated statuses endpoint (`statusItems`, `groupItems`) when app has `STATUS` field
  - `relationHints` inferred from `field.data.namespace + field.data.code` (legacy `linkTo` kept as fallback)
- `stats` counters used by lifecycle/readiness checks

Readiness rule for `snapshotReady`:

- snapshot must be `status = ready`;
- snapshot must be structurally meaningful (`namespaces > 0`, `apps > 0`, `fields > 0`).

## Chat readiness

Chat flow (`POST /chat`) expects:

- ELMA credential present
- LLM credential present
- snapshot exists
- semantic mapping exists and matches current snapshot

