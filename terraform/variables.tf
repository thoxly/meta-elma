variable "cloud_id" {
  type = string
}

variable "folder_id" {
  type = string
}

variable "registry_id" {
  type = string
}

variable "bucket_name" {
  type = string
}

variable "runtime_sa_id" {
  type = string
}

variable "lockbox_secret_id" {
  type = string
}

variable "lockbox_secret_version_id" {
  type = string
}

variable "image_name" {
  type    = string
  default = "backend"
}

variable "image_tag" {
  type = string
}

variable "container_name" {
  type    = string
  default = "meta-elma-backend"
}

variable "api_gateway_name" {
  type    = string
  default = "meta-elma-gateway"
}

variable "ydb_name" {
  type    = string
  default = "meta-elma-ydb"
}

variable "container_memory" {
  type    = number
  default = 512
}

variable "container_cores" {
  type    = number
  default = 1
}

variable "container_core_fraction" {
  type    = number
  default = 100
}

variable "container_execution_timeout" {
  type    = number
  default = 30
}

variable "container_concurrency" {
  type    = number
  default = 8
}

variable "app_port" {
  type    = number
  default = 8080
}
