# ADR 0008: LLM provider abstraction

## Status
Accepted

## Decision
Use `LLMProvider` interface with OpenAI Responses API implementation as default provider.

## Rationale
- Prevents lock-in to a single provider-specific API surface.
- Keeps prompt policy, tracing, and structured-output handling provider-agnostic.
- Makes fallback or additional providers possible without changing API handlers.
