# Kubernetes deployment (`docs/k8s`)

This folder contains the production-style Kubernetes manifests for Gamepile.

## Rules used in these manifests

- Non-sensitive settings go in `configmap.yaml` (`gamepile-config`)
- Secrets go in `secrets.yaml` (`gamepile-secrets`)
- One workload object per file (`Deployment`, `StatefulSet`, `Job`)
- Ingress is written for Traefik

## Rollout order

Run manifests in this order to avoid startup races:

```bash
kubectl apply -f docs/k8s/namespace.yaml
kubectl apply -f docs/k8s/configmap.yaml -f docs/k8s/secrets.yaml
kubectl apply -f docs/k8s/postgres-service.yaml -f docs/k8s/postgres.yaml
kubectl apply -f docs/k8s/redis-service.yaml -f docs/k8s/redis.yaml
kubectl apply -f docs/k8s/migrate-job.yaml
kubectl apply -f docs/k8s/web-service.yaml -f docs/k8s/deployment.yaml
kubectl apply -f docs/k8s/worker-deployment.yaml
kubectl apply -f docs/k8s/ingress.yaml
```

Why this order matters:

1. PostgreSQL and Redis must be available first
2. Prisma migrations must finish before app workloads start
3. `web` and `worker` pods have init containers that wait for migration state

## Quick checks after deploy

```bash
kubectl -n gamepile get pods
kubectl -n gamepile get job prisma-migrate
kubectl -n gamepile logs job/prisma-migrate
kubectl -n gamepile get ingress
```

## Updating the app

For new application images or schema changes:

1. Update image tags/manifests
2. Apply `migrate-job.yaml`
3. Roll out `deployment.yaml` and `worker-deployment.yaml`

Re-running the migration job is expected and safe when there are no pending migrations.

## Manifest list

- `namespace.yaml`
- `configmap.yaml`
- `secrets.yaml`
- `postgres-service.yaml`
- `postgres.yaml`
- `redis-service.yaml`
- `redis.yaml`
- `migrate-job.yaml`
- `web-service.yaml`
- `deployment.yaml` (web)
- `worker-deployment.yaml`
- `ingress.yaml`


