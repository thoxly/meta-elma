# ADR 0002: Runtime choice for deployment

## Status
Accepted

## Decision
Use Yandex Serverless Containers as the main runtime.

## Rationale
- Lower operational overhead than VM/VPS and aligned with constraints.
- Better fit than Functions for growing API surface and package reuse.
- Supports containerized backend with predictable revision deployments.
