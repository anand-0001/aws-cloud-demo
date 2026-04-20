# Go-Live Checklist (AWS + EKS + Argo CD + CI/CD)

Use this checklist to move from template to working deployment.

## 1) Fill placeholders

- [ ] Update `terraform/environments/dev/terraform.tfvars` from example:
  - `github_owner`
  - `github_repo`
- [ ] Update `terraform/environments/prod/terraform.tfvars` (if using prod)
- [ ] Update `k8s/argocd-project.yaml`:
  - `sourceRepos` with your real GitHub repo URL
- [ ] Update `k8s/argocd-application.yaml`:
  - `source.repoURL` with your real GitHub repo URL
- [ ] Update `k8s/argocd-application-service-b.yaml`:
  - `source.repoURL` with your service-b repo URL
- [ ] Confirm region in `.github/workflows/ci-cd.yaml` (`AWS_REGION`)

## 2) Provision infrastructure via Terraform

### Dev

```bash
cd terraform/environments/dev
cp terraform.tfvars.example terraform.tfvars
# edit terraform.tfvars
terraform init
terraform plan
terraform apply
```

Capture outputs:

- [ ] `ecr_repository_url`
- [ ] `github_actions_role_arn`
- [ ] `cluster_name`

### Prod (optional now)

```bash
cd terraform/environments/prod
cp terraform.tfvars.example terraform.tfvars
# edit terraform.tfvars
terraform init
terraform plan
terraform apply
```

## 3) Wire outputs into app deploy config

- [ ] Set Helm image repo in `helm/node-app/values.yaml`:
  - `image.repository = <ecr_repository_url>`
- [ ] In GitHub repo settings -> secrets:
  - add `AWS_ROLE_ARN = <github_actions_role_arn>`

## 4) Access cluster and install controllers

Update kubeconfig:

```bash
aws eks update-kubeconfig --region us-east-1 --name <cluster_name>
kubectl get nodes
```

Install Argo CD:

```bash
kubectl create namespace argocd
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
kubectl apply -f k8s/argocd-project.yaml
kubectl apply -f k8s/argocd-application.yaml
kubectl apply -f k8s/argocd-application-service-b.yaml
```

Install monitoring stack:

```bash
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update
helm upgrade --install kube-prometheus-stack prometheus-community/kube-prometheus-stack \
  --namespace monitoring --create-namespace \
  -f monitoring/kube-prometheus-stack-values.yaml
```

## 5) Choose ONE log sink (recommended)

### Option A: CloudWatch via Fluent Bit

```bash
helm repo add aws https://aws.github.io/eks-charts
helm repo update
helm upgrade --install aws-for-fluent-bit aws/aws-for-fluent-bit \
  -n amazon-cloudwatch --create-namespace \
  -f monitoring/logging/fluent-bit-cloudwatch-values.yaml
```

### Option B: Datadog

```bash
kubectl create namespace datadog
kubectl create secret generic datadog-secret -n datadog --from-literal=api-key=<YOUR_DATADOG_API_KEY>
helm repo add datadog https://helm.datadoghq.com
helm repo update
helm upgrade --install datadog datadog/datadog -n datadog -f monitoring/logging/datadog-values.yaml
```

## 6) Trigger CI/CD

- [ ] Push to `main`
- [ ] Confirm GitHub Actions pipeline passes
- [ ] Confirm workflow updates `helm/node-app/values.yaml` image tag
- [ ] Confirm Argo CD apps (`node-app`, `service-b`) are `Synced` and `Healthy`

## 7) Verify runtime behavior

```bash
kubectl get pods -n node-app
kubectl get svc -n node-app
kubectl get hpa -n node-app
kubectl describe hpa -n node-app
kubectl top pods -n node-app
```

Checks:

- [ ] HPA exists and has targets
- [ ] `/metrics` is scraped by Prometheus
- [ ] Logs visible in chosen sink (CloudWatch or Datadog)
- [ ] No rapid disk growth on nodes

## 8) Log growth safety (already configured)

- Kubelet rotation in EKS node groups:
  - `container-log-max-size=100Mi`
  - `container-log-max-files=10`
- Pod ephemeral storage:
  - request `512Mi`, limit `2Gi`

This prevents single containers from accumulating very large local logs.
