# ADR 0007: Future support for app item data

## Status
Accepted

## Decision
v1 excludes app item business content; future item-data support will be added as a separate context part pipeline.

## Rationale
- Meets current scope and safety constraints.
- Keeps metadata pipeline stable while allowing future RAG/item ingestion as optional layer.
- Prevents contamination of prompt context with uncontrolled raw payloads.
