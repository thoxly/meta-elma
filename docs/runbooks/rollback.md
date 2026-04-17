# Rollback Runbook

## Trigger

Use rollback when deploy smoke fails or critical API regression is detected.

## Steps

1. Identify last known good image tag.
2. Set `TF_VAR_image_tag` to that tag.
3. Run `terraform apply` for target environment.
4. Verify:
   - `GET /health`
   - `GET /ready`
   - auth + connection list endpoint.

## Notes

- Terraform state backend must be reachable before rollback.
- If schema/contract changes were deployed, verify web compatibility after rollback.
