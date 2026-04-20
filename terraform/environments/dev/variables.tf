variable "aws_region" {
  type    = string
  default = "us-east-1"
}

variable "environment" {
  type    = string
  default = "dev"
}

variable "project_name" {
  type    = string
  default = "node-app"
}

variable "github_owner" {
  type = string
}

variable "github_repo" {
  type = string
}
