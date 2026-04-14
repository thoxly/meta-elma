variable "cloud_id" {
  type = string
}

variable "folder_id" {
  type = string
}

variable "zone" {
  type    = string
  default = "ru-central1-a"
}

variable "project_name" {
  type    = string
  default = "meta-elma"
}

variable "unique_suffix" {
  type = string
}
