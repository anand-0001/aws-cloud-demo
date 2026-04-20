variable "repository_name" {
  description = "Name of the ECR repository"
  type        = string
}

variable "keep_last_tagged_images" {
  description = "Number of tagged images to keep"
  type        = number
  default     = 50
}
