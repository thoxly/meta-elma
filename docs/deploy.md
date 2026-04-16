# Deploy runbook

## Single source of truth
- Active infra: `terraform/`
- Active pipeline: `.github/workflows/deploy.yml`
- Legacy duplicate workflow removed: `deploy-serverless.yml`

## What deploy pipeline does
1. Build backend container from `docker/Dockerfile`.
2. Push image to Yandex Container Registry.
3. Run `terraform init` and `terraform apply` in `terraform/`.
4. Read `api_gateway_url` output and run smoke test `GET /health`.

## YDB runtime behavior
- API reads `YDB_ENDPOINT` and `YDB_DATABASE` from container env (Terraform wires both values from `yandex_ydb_database_serverless.app`).
- In cloud runtime, YDB auth works via attached service account identity on the serverless container (`service_account_id` in Terraform). `YDB_TOKEN` is optional and used only for explicit token-based auth in local/non-IAM environments.
- Repository layer (`YdbStorage`) creates required tables on startup if they do not exist:
  - companies
  - users
  - refresh_sessions
  - connections
  - user_connection_credentials
  - snapshots
  - semantic_mappings
  - chat_sessions
  - chat_messages
  - traces
- Optional `YDB_TOKEN` can be used for explicit token auth in non-IAM/local scenarios.

## Snapshot/Semantic retention in MVP
- `snapshots` and `semantic_mappings` are intentionally **current-only** in MVP:
  - one current snapshot per connection (keyed by `connection_id`);
  - one current semantic mapping per connection (keyed by `connection_id`).
- Historical version timeline is out of MVP scope and planned as a post-MVP extension.

## Required GitHub config
### Secrets
- `YC_SA_KEY_JSON`

### Repository variables
- `YC_CLOUD_ID`, `YC_FOLDER_ID`
- `TF_VAR_cloud_id`, `TF_VAR_folder_id`, `TF_VAR_registry_id`
- `TF_VAR_bucket_name`, `TF_VAR_runtime_sa_id`
- `TF_VAR_lockbox_secret_id`, `TF_VAR_lockbox_secret_version_id`
- `TF_VAR_ydb_name`, `TF_VAR_container_name`, `TF_VAR_api_gateway_name`
- `TF_VAR_image_name`, `TF_VAR_app_port`
- `TF_VAR_container_memory`, `TF_VAR_container_cores`, `TF_VAR_container_core_fraction`
- `TF_VAR_container_execution_timeout`, `TF_VAR_container_concurrency`

## Manual verification
```bash
cd terraform
API_URL=$(terraform output -raw api_gateway_url)
curl -fsS "$API_URL/health"
```

## Drift guardrails
- Do not add manual `yc serverless container revision deploy` steps outside Terraform.
- Keep all runtime settings (resources/env/image/tag) controlled by Terraform vars.
- Keep one deploy workflow to avoid conflicting rollout logic.
