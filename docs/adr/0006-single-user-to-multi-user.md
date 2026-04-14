# ADR 0006: Single-user prototype to multi-user path

## Status
Accepted

## Decision
Keep owner-aware repositories and identity interfaces from day one.

## Rationale
- Current runtime may use one user, but contracts already include owner IDs.
- Enables adding auth, RBAC, and tenant separation without changing core domain shape.
- Avoids migration dead-end from demo code.
