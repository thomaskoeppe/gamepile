# Kubernetes deployment (`deployment/k8s`)

This folder contains the production-style Kubernetes manifests for Gamepile.

## Rules used in these manifests

- Non-sensitive settings go in `configmap.yaml` (`gamepile-config`)
- Secrets go in `secrets.yaml` (`gamepile-secrets`)
- One workload object per file (`Deployment`, `StatefulSet`, `Job`)
- Ingress is written for Traefik

## Rollout order

Run manifests in this order to avoid startup races:

```bash
kubectl apply -f deployment/k8s/namespace.yaml
kubectl apply -f deployment/k8s/configmap.yaml -f deployment/k8s/secrets.yaml
kubectl apply -f deployment/k8s/postgres-service.yaml -f deployment/k8s/postgres.yaml
kubectl apply -f deployment/k8s/redis-service.yaml -f deployment/k8s/redis.yaml
kubectl apply -f deployment/k8s/migrate-job.yaml
kubectl apply -f deployment/k8s/web-service.yaml -f deployment/k8s/deployment.yaml
kubectl apply -f deployment/k8s/worker-deployment.yaml
kubectl apply -f deployment/k8s/ingress.yaml
```

Why this order matters:

1. PostgreSQL and Redis must be available first
2. SQL migrations must finish before app workloads start
3. `web` and `worker` pods have init containers that wait for migration state

## Quick checks after deploy

```bash
kubectl -n gamepile get pods
kubectl -n gamepile get job sql-migrate
kubectl -n gamepile logs job/sql-migrate
kubectl -n gamepile get ingress
```

## Updating the app

For new application images or schema changes:

1. Take a database backup (see `documentation/Upgrading.md`)
2. Update the image tags in `migrate-job.yaml`, `deployment.yaml`, and
   `worker-deployment.yaml` — pin a released version rather than `latest`
3. Re-run the migration job (Jobs are immutable — delete, then apply):

   ```bash
   kubectl -n gamepile delete job sql-migrate --ignore-not-found
   kubectl -n gamepile apply -f deployment/k8s/migrate-job.yaml
   kubectl -n gamepile wait --for=condition=complete --timeout=300s job/sql-migrate
   ```

4. Roll out `deployment.yaml` and `worker-deployment.yaml`

Re-running the migration job is expected and safe when there are no pending
migrations — applied migrations are tracked in `schema_migrations` and
skipped. The full upgrade guide (backups, rollback, version pinning) lives in
`documentation/Upgrading.md`.

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
