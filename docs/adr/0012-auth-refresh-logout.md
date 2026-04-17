# ADR 0012: Refresh and Logout Lifecycle

## Status

Accepted

## Context

API created refresh sessions but did not expose complete lifecycle endpoints.

## Decision

Add:

- `POST /auth/refresh`
- `POST /auth/logout`

Refresh rotates session (revoke old + create new). Logout revokes current refresh session.

## Consequences

- Auth contract is now explicit and complete for session lifecycle.
- Web can implement proactive session renewal without hidden assumptions.
