locals {
  name = "${var.project_name}-${var.environment}"
}

data "aws_availability_zones" "available" {
  state = "available"
}

module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 5.0"

  name = local.name
  cidr = "10.10.0.0/16"

  azs             = slice(data.aws_availability_zones.available.names, 0, 3)
  private_subnets = ["10.10.1.0/24", "10.10.2.0/24", "10.10.3.0/24"]
  public_subnets  = ["10.10.101.0/24", "10.10.102.0/24", "10.10.103.0/24"]

  enable_nat_gateway = true
  single_nat_gateway = false

  public_subnet_tags = {
    "kubernetes.io/role/elb" = "1"
  }

  private_subnet_tags = {
    "kubernetes.io/role/internal-elb" = "1"
  }
}

module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 20.0"

  cluster_name    = local.name
  cluster_version = "1.30"

  cluster_endpoint_public_access = true

  vpc_id                   = module.vpc.vpc_id
  subnet_ids               = module.vpc.private_subnets
  control_plane_subnet_ids = module.vpc.private_subnets

  enable_cluster_creator_admin_permissions = true

  cluster_enabled_log_types = ["api", "audit", "authenticator", "controllerManager", "scheduler"]

  eks_managed_node_groups = {
    default = {
      instance_types = ["m5.large"]
      min_size       = 3
      max_size       = 8
      desired_size   = 3

      # Prevent oversized log files from filling node disks.
      bootstrap_extra_args = "--kubelet-extra-args '--container-log-max-size=100Mi --container-log-max-files=10'"

      iam_role_additional_policies = {
        cloudwatch_agent = "arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy"
      }
    }
  }

  tags = {
    Environment = var.environment
    Project     = var.project_name
  }
}

module "ecr" {
  source            = "../../modules/ecr"
  repository_name   = var.project_name
  keep_last_tagged_images = 200
}

module "github_oidc" {
  source       = "../../modules/iam-github-oidc"
  github_owner = var.github_owner
  github_repo  = var.github_repo
  role_name    = "${local.name}-github-actions-role"
}

resource "aws_cloudwatch_log_group" "eks_control_plane" {
  name              = "/aws/eks/${module.eks.cluster_name}/cluster"
  retention_in_days = 30
}
