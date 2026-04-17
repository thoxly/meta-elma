# ADR 0011: Shared HTTP Contracts Package

## Status

Accepted

## Context

Web and API had contract drift (missing endpoints and mismatched response assumptions).

## Decision

Introduce `packages/contracts` as shared TS contract package for core HTTP shapes consumed by:

- `apps/api`
- `apps/web`

## Consequences

- Lower risk of API/Web type drift.
- Easier contract-first changes and CI drift checks.
