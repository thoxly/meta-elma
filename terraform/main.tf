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
  cloud_id  = var.cloud_id
  folder_id = var.folder_id
}

resource "yandex_ydb_database_serverless" "app" {
  name      = var.ydb_name
  folder_id = var.folder_id
}

resource "yandex_serverless_container" "backend" {
  name               = var.container_name
  description        = "ELMA GPT wrapper backend"
  folder_id          = var.folder_id
  memory             = var.container_memory
  cores              = var.container_cores
  core_fraction      = var.container_core_fraction
  execution_timeout  = format("%ss", var.container_execution_timeout)
  concurrency        = var.container_concurrency
  service_account_id = var.runtime_sa_id

  image {
    url = "cr.yandex/${var.registry_id}/${var.image_name}:${var.image_tag}"
    environment = {
      NODE_ENV       = "production"
      YDB_ENDPOINT   = yandex_ydb_database_serverless.app.ydb_api_endpoint
      YDB_DATABASE   = yandex_ydb_database_serverless.app.database_path
      STORAGE_BUCKET = var.bucket_name
    }
  }

  secrets {
    id                   = var.lockbox_secret_id
    version_id           = var.lockbox_secret_version_id
    key                  = "OPENAI_API_KEY"
    environment_variable = "OPENAI_API_KEY"
  }

  secrets {
    id                   = var.lockbox_secret_id
    version_id           = var.lockbox_secret_version_id
    key                  = "ELMA_USER_TOKEN"
    environment_variable = "ELMA_USER_TOKEN"
  }

}

resource "yandex_serverless_container_iam_binding" "gateway_invoker" {
  container_id = yandex_serverless_container.backend.id
  role         = "serverless-containers.containerInvoker"

  members = [
    "serviceAccount:${var.runtime_sa_id}"
  ]
}

resource "yandex_api_gateway" "http" {
  name      = var.api_gateway_name
  folder_id = var.folder_id

  spec = <<-YAML
    openapi: 3.0.0
    info:
      title: elma-gpt-wrapper
      version: 1.0.0
    paths:
      /health:
        get:
          operationId: health
          x-yc-apigateway-integration:
            type: serverless_containers
            container_id: ${yandex_serverless_container.backend.id}
            service_account_id: ${var.runtime_sa_id}
      /ready:
        get:
          operationId: ready
          x-yc-apigateway-integration:
            type: serverless_containers
            container_id: ${yandex_serverless_container.backend.id}
            service_account_id: ${var.runtime_sa_id}
      /auth/register:
        post:
          operationId: authRegister
          x-yc-apigateway-integration:
            type: serverless_containers
            container_id: ${yandex_serverless_container.backend.id}
            service_account_id: ${var.runtime_sa_id}
      /auth/login:
        post:
          operationId: authLogin
          x-yc-apigateway-integration:
            type: serverless_containers
            container_id: ${yandex_serverless_container.backend.id}
            service_account_id: ${var.runtime_sa_id}
      /connections:
        get:
          operationId: listConnections
          x-yc-apigateway-integration:
            type: serverless_containers
            container_id: ${yandex_serverless_container.backend.id}
            service_account_id: ${var.runtime_sa_id}
        post:
          operationId: createConnection
          x-yc-apigateway-integration:
            type: serverless_containers
            container_id: ${yandex_serverless_container.backend.id}
            service_account_id: ${var.runtime_sa_id}
        options:
          operationId: connectionsOptions
          x-yc-apigateway-integration:
            type: serverless_containers
            container_id: ${yandex_serverless_container.backend.id}
            service_account_id: ${var.runtime_sa_id}
      /connections/{id}/state:
        parameters:
          - name: id
            in: path
            required: true
            schema:
              type: string
        get:
          operationId: getConnectionState
          x-yc-apigateway-integration:
            type: serverless_containers
            container_id: ${yandex_serverless_container.backend.id}
            service_account_id: ${var.runtime_sa_id}
      /connections/{id}/elma-credentials:
        parameters:
          - name: id
            in: path
            required: true
            schema:
              type: string
        put:
          operationId: saveElmaCredentials
          x-yc-apigateway-integration:
            type: serverless_containers
            container_id: ${yandex_serverless_container.backend.id}
            service_account_id: ${var.runtime_sa_id}
      /connections/{id}/elma-credentials/validate:
        parameters:
          - name: id
            in: path
            required: true
            schema:
              type: string
        post:
          operationId: validateElmaCredentials
          x-yc-apigateway-integration:
            type: serverless_containers
            container_id: ${yandex_serverless_container.backend.id}
            service_account_id: ${var.runtime_sa_id}
      /connections/{id}/llm-settings:
        parameters:
          - name: id
            in: path
            required: true
            schema:
              type: string
        put:
          operationId: saveLlmSettings
          x-yc-apigateway-integration:
            type: serverless_containers
            container_id: ${yandex_serverless_container.backend.id}
            service_account_id: ${var.runtime_sa_id}
      /connections/{id}/llm-settings/validate:
        parameters:
          - name: id
            in: path
            required: true
            schema:
              type: string
        post:
          operationId: validateLlmSettings
          x-yc-apigateway-integration:
            type: serverless_containers
            container_id: ${yandex_serverless_container.backend.id}
            service_account_id: ${var.runtime_sa_id}
      /connections/{id}/jobs:
        parameters:
          - name: id
            in: path
            required: true
            schema:
              type: string
        get:
          operationId: listConnectionJobs
          x-yc-apigateway-integration:
            type: serverless_containers
            container_id: ${yandex_serverless_container.backend.id}
            service_account_id: ${var.runtime_sa_id}
        post:
          operationId: createConnectionJob
          x-yc-apigateway-integration:
            type: serverless_containers
            container_id: ${yandex_serverless_container.backend.id}
            service_account_id: ${var.runtime_sa_id}
      /connections/{id}/semantic:
        parameters:
          - name: id
            in: path
            required: true
            schema:
              type: string
        get:
          operationId: getConnectionSemantic
          x-yc-apigateway-integration:
            type: serverless_containers
            container_id: ${yandex_serverless_container.backend.id}
            service_account_id: ${var.runtime_sa_id}
        put:
          operationId: saveConnectionSemantic
          x-yc-apigateway-integration:
            type: serverless_containers
            container_id: ${yandex_serverless_container.backend.id}
            service_account_id: ${var.runtime_sa_id}
      /jobs/{jobId}:
        parameters:
          - name: jobId
            in: path
            required: true
            schema:
              type: string
        get:
          operationId: getJob
          x-yc-apigateway-integration:
            type: serverless_containers
            container_id: ${yandex_serverless_container.backend.id}
            service_account_id: ${var.runtime_sa_id}
      /chat/sessions:
        get:
          operationId: listChatSessions
          x-yc-apigateway-integration:
            type: serverless_containers
            container_id: ${yandex_serverless_container.backend.id}
            service_account_id: ${var.runtime_sa_id}
      /chat/sessions/{id}:
        parameters:
          - name: id
            in: path
            required: true
            schema:
              type: string
        get:
          operationId: getChatSession
          x-yc-apigateway-integration:
            type: serverless_containers
            container_id: ${yandex_serverless_container.backend.id}
            service_account_id: ${var.runtime_sa_id}
      /traces/{id}:
        parameters:
          - name: id
            in: path
            required: true
            schema:
              type: string
        get:
          operationId: getTrace
          x-yc-apigateway-integration:
            type: serverless_containers
            container_id: ${yandex_serverless_container.backend.id}
            service_account_id: ${var.runtime_sa_id}
      /context/refresh:
        post:
          operationId: contextRefresh
          x-yc-apigateway-integration:
            type: serverless_containers
            container_id: ${yandex_serverless_container.backend.id}
            service_account_id: ${var.runtime_sa_id}
        options:
          operationId: contextRefreshOptions
          x-yc-apigateway-integration:
            type: serverless_containers
            container_id: ${yandex_serverless_container.backend.id}
            service_account_id: ${var.runtime_sa_id}
      /context/current:
        get:
          operationId: contextCurrent
          x-yc-apigateway-integration:
            type: serverless_containers
            container_id: ${yandex_serverless_container.backend.id}
            service_account_id: ${var.runtime_sa_id}
      /context/current/compact:
        get:
          operationId: contextCurrentCompact
          x-yc-apigateway-integration:
            type: serverless_containers
            container_id: ${yandex_serverless_container.backend.id}
            service_account_id: ${var.runtime_sa_id}
      /debug/context:
        get:
          operationId: debugContext
          x-yc-apigateway-integration:
            type: serverless_containers
            container_id: ${yandex_serverless_container.backend.id}
            service_account_id: ${var.runtime_sa_id}
      /chat:
        post:
          operationId: chat
          x-yc-apigateway-integration:
            type: serverless_containers
            container_id: ${yandex_serverless_container.backend.id}
            service_account_id: ${var.runtime_sa_id}
        options:
          operationId: chatOptions
          x-yc-apigateway-integration:
            type: serverless_containers
            container_id: ${yandex_serverless_container.backend.id}
            service_account_id: ${var.runtime_sa_id}
  YAML
}

