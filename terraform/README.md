# Terraform Infrastructure

This folder provisions AWS infrastructure for the Node app platform:

- VPC + networking
- EKS cluster + managed node group
- ECR repository
- GitHub OIDC IAM role for CI/CD
- CloudWatch log group retention for EKS control plane logs

## Structure

- `environments/dev` - development environment
- `environments/prod` - production environment
- `modules/ecr` - ECR module
- `modules/iam-github-oidc` - GitHub Actions OIDC role module

## Log Rotation / Log Growth Protection

Node-level container log rotation is configured through kubelet settings in EKS managed node groups:

- `container-log-max-size=100Mi`
- `container-log-max-files=10`

This caps per-container log disk usage to ~1GB (100Mi x 10 files), preventing very large (for example 100GB) log growth on worker nodes.

## Usage

Example for dev:

```bash
cd terraform/environments/dev
terraform init
terraform plan
terraform apply
```

The output `github_actions_role_arn` should be set as GitHub secret `AWS_ROLE_ARN`.
