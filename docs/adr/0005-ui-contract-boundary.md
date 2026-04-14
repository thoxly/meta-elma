# ADR 0005: UI contract boundary

## Status
Accepted

## Decision
UI consumes only normalized API contracts and never raw ELMA payloads.

## Rationale
- Prevents tight coupling to ELMA wire format.
- Allows adapter-level redaction and safe prompt-context shaping.
- Supports backend evolution without breaking UI.
