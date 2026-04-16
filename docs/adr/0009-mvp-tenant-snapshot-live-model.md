# ADR 0009: MVP tenant and access model

## Status
Accepted

## Decision
Adopt a hard-cutover architecture for MVP with these rules:
- Company/User/Connection are first-class entities.
- External credentials are user-scoped per connection.
- Structural snapshot is shared on connection level.
- Live data access is always executed using the current user credential.
- Semantic mapping is a separate on-demand flow built from snapshot using user LLM token.
- Credentials are stored encrypted with master-secret based crypto abstraction.
- Snapshot and semantic mapping persistence is current-only in MVP (no historical timeline table yet).

## Rationale
- Preserves ELMA permission boundaries by design.
- Avoids company-wide token sharing and data leakage.
- Allows multiple users to collaborate on one connection while keeping personal external identities.
- Keeps snapshot generation cheap and reusable, while live answers stay up-to-date.
- Keeps semantic enrichment optional and cost-controlled by user token.
- Keeps persistence simple for MVP and avoids heavy history management before product validation.

## Consequences
- Old prototype API contracts are intentionally broken.
- Frontend must use authenticated flows and explicit credential management.
- Trace payloads must never contain raw ELMA/LLM tokens.
- Deployment and docs must align with one active infra workflow.
- Snapshot/semantic history APIs are intentionally absent in MVP.
