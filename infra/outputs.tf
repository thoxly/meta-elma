output "registry_id" {
  value = yandex_container_registry.main.id
}

output "ydb_endpoint" {
  value = yandex_ydb_database_serverless.main.endpoint
}

output "snapshot_bucket" {
  value = yandex_storage_bucket.snapshots.bucket
}

output "lockbox_secret_id" {
  value = yandex_lockbox_secret.app_secrets.id
}
