# Security Model

## Secret handling

Required API secrets:

- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `CREDENTIAL_MASTER_SECRET`

Optional/infra:

- `YDB_TOKEN`
- `OPENAI_API_KEY` (adapter/runtime-specific)
- `ELMA_USER_TOKEN` (infra-specific legacy secret)

Production must provide required secrets through secret manager (Lockbox + Terraform).

## Token model

- Access token: Bearer token for API calls.
- Refresh token: stored as hash in `refresh_sessions`.
- Refresh flow rotates session (`/auth/refresh` revokes old session and creates new one).
- Logout revokes refresh session (`/auth/logout`).

## Credential protection

- ELMA/LLM user credentials are stored encrypted (`AesCredentialCrypto`).
- Never log raw credential values.

## Logging

- Use structured Fastify logger.
- Keep error payloads explicit but without sensitive token values.

## Known MVP risks

- YDB adapter currently uses JSON payload tables and in-memory filtering for reads.
- localStorage auth in web increases XSS impact; accepted for MVP with planned hardening.
