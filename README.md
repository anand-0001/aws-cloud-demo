# AWS Cloud Node App (EKS + Argo CD + Helm + HPA + Prometheus + Grafana)

This project is a simple Node.js service ready for deployment on AWS EKS with:

- GitHub Actions for CI/CD
- Amazon ECR for Docker image storage
- Argo CD for GitOps deployments
- Helm chart for Kubernetes manifests
- HPA for autoscaling
- Prometheus and Grafana for metrics
- Terraform for AWS infrastructure provisioning

## Project Structure

- `src/` - Node.js application
- `helm/node-app/` - Helm chart (Deployment, Service, HPA, ServiceMonitor)
- `k8s/argocd-application.yaml` - Argo CD Application manifest
- `k8s/argocd-application-service-b.yaml` - Argo CD Application for second service repo
- `k8s/argocd-project.yaml` - Argo CD Project with repo/destination boundaries
- `monitoring/kube-prometheus-stack-values.yaml` - values for kube-prometheus-stack
- `.github/workflows/ci-cd.yaml` - GitHub Actions pipeline
- `terraform/` - infrastructure as code for VPC, EKS, ECR, and GitHub OIDC IAM
- `GO_LIVE_CHECKLIST.md` - production readiness checklist
- `MICROSERVICES_COMMUNICATION.md` - service-to-service communication guide
- `service-b-template/` - starter template for a second microservice repo

## Local Run

```bash
npm install
npm start
```

App endpoints:

- `/` - sample response
- `/healthz` - health check
- `/metrics` - Prometheus metrics
- `/call-service-b` - internal call to service-b (`SERVICE_B_URL`)

## Infrastructure Provisioning (Terraform)

Use Terraform first to create AWS resources.

```bash
cd terraform/environments/dev
cp terraform.tfvars.example terraform.tfvars
# edit terraform.tfvars with your github_owner and github_repo
terraform init
terraform apply
```

Repeat for production from `terraform/environments/prod`.

Important Terraform output:

- `github_actions_role_arn` -> set this value as GitHub secret `AWS_ROLE_ARN`
- `ecr_repository_url` -> set this as image repository in `helm/node-app/values.yaml`

## AWS/EKS Setup (High Level)

1. Provision VPC, EKS, ECR, and IAM role via Terraform.
2. Install Argo CD in cluster.
3. Install kube-prometheus-stack.
4. Push this repo to GitHub and update:
   - `k8s/argocd-application.yaml` repo URL
   - `helm/node-app/values.yaml` image repository from Terraform output
5. Apply Argo CD application manifest.

## Install Argo CD

```bash
kubectl create namespace argocd
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
kubectl apply -f k8s/argocd-application.yaml
```

## Install Prometheus + Grafana

```bash
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update
helm upgrade --install kube-prometheus-stack prometheus-community/kube-prometheus-stack \
  --namespace monitoring --create-namespace \
  -f monitoring/kube-prometheus-stack-values.yaml
```

## GitHub Secrets Needed

Set these in your GitHub repository:

- `AWS_ROLE_ARN` - IAM role for GitHub OIDC

The workflow will:

1. Run tests
2. Build and push image to ECR
3. Update Helm values with new image tag
4. Commit and push the value change
5. Argo CD auto-syncs the deployment to EKS

## Verify HPA

```bash
kubectl get hpa -n node-app
kubectl describe hpa -n node-app
```

## Log Rotation Policy (100GB Risk Mitigation)

To avoid large log growth impacting application and node health:

1. **Node-level container log rotation (Terraform EKS):**
   - `container-log-max-size=100Mi`
   - `container-log-max-files=10`
   - Max per container logs ~1GB on node disk.

2. **Pod ephemeral storage limits (Helm deployment):**
   - requests: `512Mi`
   - limits: `2Gi`
   - Prevents runaway local storage use in pods.

3. **Prometheus/Grafana monitoring:**
   - Use node filesystem and pod storage dashboards to alert before disk pressure.

## CloudWatch and Datadog Logging (Without App File Logs)

Application logs should be written to `stdout/stderr` only (already the case in this Node app).  
Do not write logs to files inside the container.

Important note:

- In Kubernetes, container runtime still keeps short-lived node log files under `/var/log/containers`.
- You cannot make this fully zero on EKS, but you can keep it small and ship logs quickly.
- This project already limits local retention via kubelet log rotation settings.

### Send logs to CloudWatch (Fluent Bit)

Prepared values file:

- `monitoring/logging/fluent-bit-cloudwatch-values.yaml`

Install:

```bash
helm repo add aws https://aws.github.io/eks-charts
helm repo update
helm upgrade --install aws-for-fluent-bit aws/aws-for-fluent-bit \
  -n amazon-cloudwatch --create-namespace \
  -f monitoring/logging/fluent-bit-cloudwatch-values.yaml
```

### Send logs to Datadog

Prepared values file:

- `monitoring/logging/datadog-values.yaml`

Create Datadog API key secret:

```bash
kubectl create namespace datadog
kubectl create secret generic datadog-secret -n datadog \
  --from-literal=api-key=<YOUR_DATADOG_API_KEY>
```

Install Datadog agent:

```bash
helm repo add datadog https://helm.datadoghq.com
helm repo update
helm upgrade --install datadog datadog/datadog \
  -n datadog \
  -f monitoring/logging/datadog-values.yaml
```

### Recommended operating model

- Use **one primary log sink** (CloudWatch or Datadog) to avoid duplicate ingestion cost.
- If both are needed, apply filtering/sampling rules in the log collector.
