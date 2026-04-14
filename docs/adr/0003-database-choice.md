# ADR 0003: Primary operational database

## Status
Accepted

## Decision
Use YDB Serverless as the primary operational store.

## Rationale
- Managed serverless DB in Yandex Cloud with no VM operations.
- Supports product growth from single-user to multi-user while keeping ownership boundaries.
- Works with structured entities needed for snapshots, chats, traces, and jobs.
