# Upgrading an existing deployment

This guide covers upgrading a running GamePile instance — including its
database schema — to a newer release, plus backups and rollback. It applies to
deployments created from `deployment/docker` (Docker Compose) or
`deployment/k8s` (Kubernetes).

## How releases and versions work

GamePile uses [semantic-release](https://github.com/semantic-release/semantic-release)
with Conventional Commits on `main`:

- `fix:` / `perf:` / `refactor:` commits produce a **patch** release,
  `feat:` a **minor**, and any `BREAKING CHANGE` a **major**.
- Each release creates a git tag, a changelog entry, and a GitHub Release.
- The release triggers the Docker publish workflow, which pushes three images
  to GHCR — `web`, `worker`, and `migrate` — tagged with:

| Tag | Meaning |
| --- | ------- |
| `2.3.1` | Exact release — best for production pinning |
| `2.3` | Latest patch of a minor — auto-receives fixes |
| `latest` | Newest release |
| `<sha>` | Exact commit build |

All three images are built from the same commit; **always run the same tag
for `web`, `worker`, and `migrate`** so the code and schema expectations match.

## How schema migrations work

Schema changes ship as plain SQL files in `packages/web/prisma/migrations/`,
applied by the `migrate` image (`packages/migrate/run-sql-migrations.mjs`):

- Applied migrations are tracked in a `schema_migrations` table with a
  SHA-256 checksum per file. Already-applied migrations are skipped;
  re-running the migrate step is always safe and idempotent.
- Each migration file runs inside a single transaction — a failing migration
  rolls back cleanly and leaves the schema at the previous version.
- A Postgres advisory lock guarantees only one migrate process runs at a
  time, even if several containers start simultaneously.
- Databases originally created with Prisma's own history
  (`_prisma_migrations`) are bootstrapped automatically on first run.
- Migrations are **forward-only**. There are no down-migrations; rolling back
  a schema change means restoring a database backup (see below).

The app containers gate on migrations: in Compose, `web`/`worker` have
`depends_on: migrate: service_completed_successfully`; in Kubernetes the
migration Job runs before rollouts.

## Upgrading with Docker Compose

### Deployment layouts and the `.env` file

Two layouts are supported (Docker Compose **v2.24+** required):

- **Standalone** (the README quickstart): `docker-compose.yml` and `.env` in
  the same directory. Compose auto-loads that `.env` for both `${...}`
  interpolation and container environments.
- **Repo layout**: the compose file at `deployment/docker/` with `.env` at
  the repository root. Compose does **not** auto-load a `.env` outside the
  compose file's directory for interpolation — plain `docker compose`
  commands must pass it explicitly:

  ```bash
  docker compose --env-file ../../.env up -d
  ```

  `upgrade.sh` and `backup.sh` detect the right `.env` and pass it for you.

If variables silently fall back to defaults or you see
`WARN The "X" variable is not set`, the `.env` was not picked up — this is
almost always the cause.

The compose file pins the project name (`name: gamepile`) so containers,
networks, and volumes get stable names (`gamepile_postgres_data`, …)
regardless of which directory compose runs from.

### Customizing without editing the compose file

The compose file is part of each release — upgrades may replace it. Never
hand-edit `docker-compose.yml`; put local changes in a
`docker-compose.override.yml` next to it instead, which Compose merges
automatically:

```yaml
# docker-compose.override.yml — survives upgrades untouched
services:
  worker:
    environment:
      WORKER_DETAILS_CONCURRENCY: "10"
      WORKER_STEAM_RATE_LIMIT_SCOPE: "distributed"
```

To refresh the base file after a release:

```bash
curl -o docker-compose.yml https://raw.githubusercontent.com/thomaskoeppe/gamepile/v2.3.0/deployment/docker/docker-compose.yml
docker compose config -q   # validate before using it
```

### Recommended: the upgrade script

```bash
cd deployment/docker
./upgrade.sh                    # upgrade to GAMEPILE_VERSION from .env (or latest)
./upgrade.sh --version 2.3.0    # upgrade to a specific release
```

The script performs the safe order automatically:

1. **Backup** — `pg_dump` of the bundled Postgres into `./backups/` (skip
   with `--skip-backup`, e.g. when you manage an external database).
2. **Pull** the target `migrate`, `web`, and `worker` images.
3. **Migrate** — runs the one-shot migrate container *while the old version
   keeps serving traffic*. If migrations fail, the script aborts and the
   running deployment is untouched.
4. **Recreate** `web`, `worker`, and `caddy` on the new images.
5. **Verify** — prints `docker compose ps` and the heartbeat, which reports
   the running version:

```bash
curl http://<host>:8080/api/v1/heartbeat
# {"message":"Heartbeat OK","version":"2.3.0"}
```

### Manual steps (what the script does)

```bash
cd deployment/docker
# In the repo layout, every command needs --env-file so `${...}` interpolation
# sees your configuration (standalone layout: drop the flag, .env is adjacent).
docker compose --env-file ../../.env exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB"' | gzip > backups/pre-upgrade.sql.gz
GAMEPILE_VERSION=2.3.0 docker compose --env-file ../../.env pull migrate web worker
GAMEPILE_VERSION=2.3.0 docker compose --env-file ../../.env run --rm migrate
GAMEPILE_VERSION=2.3.0 docker compose --env-file ../../.env up -d --remove-orphans web worker caddy
```

### Pinning a version

Set `GAMEPILE_VERSION` in your `.env` (see `.env.example`) so `docker compose`
always resolves a known release instead of `latest`:

```dotenv
GAMEPILE_VERSION="2.3.0"
```

Pinning is strongly recommended for production: upgrades become deliberate
(`edit .env` → `./upgrade.sh`), and `docker compose config --images` shows
exactly what would run before anything is recreated.

## Rollback

Two distinct cases:

- **The new release ships no migration** (check the release notes / the
  `packages/web/prisma/migrations/` diff): roll back by setting
  `GAMEPILE_VERSION` back to the previous release and
  `docker compose up -d web worker caddy`. The schema is unchanged, so the
  old images run fine.
- **The new release shipped a migration**: application images can still be
  rolled back *if* the schema change was backwards-compatible (additive
  columns/tables usually are — old code simply ignores them). If the old
  version genuinely cannot run against the new schema, restore the
  pre-upgrade backup and then start the old version:

```bash
cd deployment/docker
docker compose stop web worker
gunzip -c backups/gamepile-<timestamp>.sql.gz \
  | docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
GAMEPILE_VERSION=<previous> docker compose up -d web worker caddy
```

> Restoring a backup discards everything written after the dump was taken.
> That is the price of a schema rollback — prefer forward fixes when possible.

## Backups

`deployment/docker/backup.sh` produces the same gzipped `pg_dump` as the
upgrade script and is cron-friendly:

```bash
0 4 * * * /opt/gamepile/deployment/docker/backup.sh --retention-days 14
```

For an **external database** (managed Postgres, separate host), back up with
your provider's tooling or `pg_dump` pointed at `DATABASE_URL` — the upgrade
script detects the absence of the bundled Postgres container and skips its
built-in backup step.

Back up your `.env` and compose files alongside the SQL dumps; together they
are sufficient to rebuild the stack on new hardware.

## Upgrading on Kubernetes

Manifests live in `deployment/k8s`. Pin image tags in the manifests to the
release you run (avoid `latest` in production), then upgrade in this order:

```bash
# 1. Point the images at the new release
#    (migrate-job.yaml, deployment.yaml, worker-deployment.yaml)

# 2. Re-run the migration job (Jobs are immutable — delete, then re-apply)
kubectl -n gamepile delete job sql-migrate --ignore-not-found
kubectl -n gamepile apply -f deployment/k8s/migrate-job.yaml
kubectl -n gamepile wait --for=condition=complete --timeout=300s job/sql-migrate

# 3. Roll out the app workloads
kubectl -n gamepile apply -f deployment/k8s/deployment.yaml -f deployment/k8s/worker-deployment.yaml
kubectl -n gamepile rollout status deployment/gamepile-web
```

The Job has `ttlSecondsAfterFinished: 300`, so a completed run cleans itself
up shortly after finishing; the explicit `delete` just makes re-applies safe
at any time. Take a database backup before step 2, exactly as in the Compose
flow.

## Troubleshooting

**`Checksum mismatch for already-applied migration: <name>`**
The SQL file on disk differs from what was applied historically. Never edit an
already-released migration file. Restore the original file content (it lives
in git history); genuinely new schema work belongs in a new migration.

**A migration failed mid-upgrade**
The failing file was rolled back; `schema_migrations` still reflects the last
good state, and if you used `upgrade.sh` the old app version is still running.
Read the migrate output, fix the cause (usually data that violates a new
constraint), and re-run — applied migrations are skipped automatically.

**`web`/`worker` stay in `Created`/waiting state after `docker compose up`**
They gate on the `migrate` service completing successfully. Check
`docker compose logs migrate` — the app containers start as soon as the
migrate container exits 0.

**`service "postgres" refers to undefined volume postgres_data`**
The top-level `volumes:` block is missing from your `docker-compose.yml` —
usually the result of hand-editing. Restore the release version of the file
(see "Customizing without editing the compose file" above); named volumes and
their data are untouched by replacing the compose file.

**`yaml: construct error: mapping key "X" already defined`**
A duplicate YAML key from manual edits. Restore the release compose file and
move customizations into `docker-compose.override.yml`. Validate any compose
change with `docker compose config -q` before deploying it.

**`WARN The "STEAM_API_KEY" variable is not set. Defaulting to a blank string.`**
Compose did not find your `.env` for `${...}` interpolation (see "Deployment
layouts" above). Run through `upgrade.sh`, or pass `--env-file` explicitly.
Do not ignore these warnings — services recreated in this state run with
blank secrets and default passwords.

**The app starts but the database is empty / first login becomes admin again**
Compose created fresh volumes under a different project name. Check
`docker volume ls`: your data lives in `gamepile_postgres_data`. Current
compose files pin `name: gamepile`; if you overrode the project name (or use
an old compose file without `name:` from a different directory), compose
derives another name and attaches new empty volumes. Stop the stack, restore
the pinned project name, and `docker compose up -d` — the original volumes
reattach. `upgrade.sh` detects this situation and refuses to continue.

**Which version is running?**
`curl http://<host>:8080/api/v1/heartbeat` returns the app version, and
`docker compose images` lists the exact tags of the running containers.
