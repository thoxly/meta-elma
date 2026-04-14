terraform {
  required_version = ">= 1.6.0"
  required_providers {
    yandex = {
      source  = "yandex-cloud/yandex"
      version = ">= 0.140.0"
    }
  }
}

provider "yandex" {
  folder_id = var.folder_id
  cloud_id  = var.cloud_id
  zone      = var.zone
}

resource "yandex_container_registry" "main" {
  name = "${var.project_name}-registry"
}

resource "yandex_ydb_database_serverless" "main" {
  name = "${var.project_name}-ydb"
}

resource "yandex_storage_bucket" "snapshots" {
  bucket = "${var.project_name}-snapshots-${var.unique_suffix}"
}

resource "yandex_lockbox_secret" "app_secrets" {
  name = "${var.project_name}-secrets"
}

# TODO: add serverless container, api gateway, IAM bindings, logging, and deploy wiring.
