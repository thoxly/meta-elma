# ADR 0004: User-scoped context model

## Status
Accepted

## Decision
Every ELMA interaction is executed with a token bound to one user and one connection.

## Rationale
- ELMA Public Web API authorization is user-token based.
- Snapshot ownership must always track connection owner and source user.
- This model stays valid when enabling multi-user without rewriting the core.
