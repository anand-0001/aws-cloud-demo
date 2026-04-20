# Microservices Communication (service-a <-> service-b)

This repo now includes a ready template for a second service:

- `service-b-template/` (copy this to a separate repository for service-b)

## How service-to-service call works

- `service-a` (this repo) calls `service-b` via env var `SERVICE_B_URL`.
- Default in Helm values:
  - `app.serviceBUrl: "http://service-b:80"`
- DNS `service-b` resolves to Kubernetes Service in the same namespace.

For cross-namespace calls:

- Use `http://service-b.<namespace>.svc.cluster.local:80`

## Endpoints

In service-a:

- `GET /call-service-b` -> calls `${SERVICE_B_URL}/healthz`

In service-b template:

- `GET /` -> sample response
- `GET /healthz` -> health endpoint

## Argo CD setup for separate repos

Apply both applications:

```bash
kubectl apply -f k8s/argocd-project.yaml
kubectl apply -f k8s/argocd-application.yaml
kubectl apply -f k8s/argocd-application-service-b.yaml
```

Before applying, update:

- `k8s/argocd-application.yaml` -> service-a repo URL
- `k8s/argocd-application-service-b.yaml` -> service-b repo URL
- `k8s/argocd-project.yaml` -> allow both source repositories in `sourceRepos`

## Quick runtime test

```bash
kubectl get pods -n node-app
kubectl port-forward svc/<service-a-service-name> 8080:80 -n node-app
curl http://localhost:8080/call-service-b
```
