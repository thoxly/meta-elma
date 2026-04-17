# Deploy Runbook

## Preconditions

- Docker image can be built from repo root.
- Terraform variables and YC credentials are set in GitHub Actions vars/secrets.
- Lockbox contains `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `CREDENTIAL_MASTER_SECRET`.

## Pipeline

1. Build and push image to YCR.
2. `terraform init`.
3. `terraform apply`.
4. Smoke checks:
   - `GET /health`
   - `GET /ready`

## Manual validation

- Register/Login.
- Create connection with ELMA token.
- Run `refresh_schema` job and verify schema endpoint.
- Run `generate_semantic` job and verify semantic/chat readiness.
