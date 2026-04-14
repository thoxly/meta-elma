output "api_gateway_url" {
  value = "https://${yandex_api_gateway.http.domain}"
}

output "container_id" {
  value = yandex_serverless_container.backend.id
}

output "ydb_endpoint" {
  value = yandex_ydb_database_serverless.app.ydb_api_endpoint
}

output "bucket_name" {
  value = var.bucket_name
}

output "secret_id" {
  value = var.lockbox_secret_id
}
