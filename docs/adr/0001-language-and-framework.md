# ADR 0001: Language and framework choice

## Status
Accepted

## Decision
Use TypeScript with Fastify for backend and React + Vite for web UI.

## Rationale
- Strong typing for JSON-heavy ELMA and LLM contracts.
- Fastify fits HTTP integration workloads and serverless containers.
- One language across backend, UI, and shared domain contracts reduces complexity.
