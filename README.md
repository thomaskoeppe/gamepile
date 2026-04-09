# <img src="/packages/web/public/logo_simple.png" width="32px" align="center" /> GAMEPILE

**Self-hosted Steam game library manager.** Import your library, build collections, and share game key vaults.

> ⚠️ **Beta** — Gamepile is under active development. Expect breaking changes between versions. Use at your own risk.

<img src="https://raw.githubusercontent.com/thomaskoeppe/gamepile/refs/heads/main/documentation/images/library_1.png" width="30%" /> <img src="https://raw.githubusercontent.com/thomaskoeppe/gamepile/refs/heads/main/documentation/images/library_2.png" width="30%" /> <img src="https://raw.githubusercontent.com/thomaskoeppe/gamepile/refs/heads/main/documentation/images/explore_1.png" width="30%" />

<img src="https://raw.githubusercontent.com/thomaskoeppe/gamepile/refs/heads/main/documentation/images/search_1.png" width="30%" /> <img src="https://raw.githubusercontent.com/thomaskoeppe/gamepile/refs/heads/main/documentation/images/search_2.png" width="30%" />

## Features

- **Steam Library Sync** — Import owned games, playtime, and achievements. Libraries re-sync automatically on a schedule.
- **Collections** — Curated game lists, private or public, with per-member modify access and sharing.
- **Key Vaults** — Store activation keys with optional PIN or password auth. Per-user redeem/create permissions.
- **Explorer** — Full-text search across the shared Steam catalog.
- **Multi-user** — Invite system with configurable open or invite-only registration.
- **Admin Panel** — Manage users, configure platform settings, create invite codes, invoke background jobs, and view job logs at `/admin`.
- **Real-time progress** — SSE-powered live progress bars on long-running imports.
- **Observability** — OpenTelemetry traces and structured logs exported to any OTLP-compatible collector.

---

## Quick Deploy (Docker Compose)

Official images are published to the GitHub Container Registry and updated on every release:

| Image                                   | Tag      |
|-----------------------------------------|----------|
| `ghcr.io/thomaskoeppe/gamepile/web`     | `latest` |
| `ghcr.io/thomaskoeppe/gamepile/worker`  | `latest` |
| `ghcr.io/thomaskoeppe/gamepile/migrate` | `latest` |

**1. Download the Compose file:**

```bash
curl -O https://raw.githubusercontent.com/thomaskoeppe/gamepile/main/docker-compose.yml
```

**2. Create `.env`:**

```env
STEAM_API_KEY=<your-32-char-steam-api-key>
WEB_VAULT_TOKEN_SECRET=<random-string-min-32-chars>
DOMAIN=localhost:8080
```

For the bundled HTTP Compose deployment, those three variables are enough to get started. Everything else has defaults. `WEB_APP_URL` defaults to `http://${DOMAIN}` and `WEB_ALLOWED_ORIGINS` defaults to `DOMAIN`; override either one when you terminate TLS elsewhere or serve the app from a different public URL. See [Minimal Configuration](#minimal-configuration) for what each one does, and [docs/CONFIGURATION.md](documentation/Configuration.md) for the full reference.

**3. Pull and start:**

```bash
docker compose pull
docker compose up -d
```

The app is available at **http://localhost:8080**.

### What happens on first boot

- PostgreSQL and Redis start and become healthy.
- The `migrate` container runs all Prisma database migrations and exits.
- `web` and `worker` start only after migrations complete successfully.
- On first startup the worker queues an initial Steam catalog sync automatically.
- No manual migration commands are ever needed.

---

## First Login and Admin Assignment

**The first account created on the platform automatically becomes the admin.** This is handled atomically during the Steam OpenID callback — if the user count in the database is `1` immediately after account creation, the role is promoted to `ADMIN` in the same transaction.

1. Navigate to `http://<your-domain>` and click **Sign in with Steam**.
2. Steam redirects you back after authentication.
3. Your account is created, your Steam library import is queued, and you land on your library page.
4. Since you are the first user, you have access to the **Admin Panel** at `/admin`.

Subsequent users sign up with the `USER` role. An admin can promote them manually from `/admin/users`.

### Registration modes

By default, open signup is enabled — any Steam user can create an account. The admin can change this from the admin panel:

| Scenario                 | `ALLOW_USER_SIGNUP` | `ALLOW_INVITE_CODE_GENERATION` |
|--------------------------|---------------------|--------------------------------|
| Anyone can register      | `true` (default)    | any                            |
| Registration closed      | `false`             | `false`                        |
| Invite-only registration | `false`             | `true`                         |

When invite-only mode is active, the admin generates invite codes from `/admin/invite-codes`. Users append `?invite_code=<code>` to the sign-in URL to register.

---

## Minimal Configuration

For the bundled `docker-compose.yml` deployment, these three variables must be set. Everything else has sensible defaults.

| Variable                 | What it does                                                                                                                                                                                               |
|--------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `STEAM_API_KEY`          | 32-char hex key from [steamcommunity.com/dev/apikey](https://steamcommunity.com/dev/apikey). Required for profile fetches, library imports, and catalog sync.                                              |
| `WEB_VAULT_TOKEN_SECRET` | HMAC secret used to sign per-vault access cookies. Must be at least 32 characters. Generate with `openssl rand -hex 32`.                                                                                   |
| `DOMAIN`                 | Public hostname without protocol or path (e.g. `gamepile.example.com` or `localhost:8080`). Used by the Compose file to default `WEB_APP_URL` to `http://${DOMAIN}` and `WEB_ALLOWED_ORIGINS` to `DOMAIN`. |

The `DATABASE_URL` and Redis connection are constructed automatically by the Compose file from `POSTGRES_*` and `REDIS_*` variables, which have secure defaults you can override:

```env
POSTGRES_PASSWORD=changeme          # default: gamepile_secret
POSTGRES_USER=gamepile              # default: gamepile
POSTGRES_DB=gamepile                # default: gamepile
REDIS_PASSWORD=changeme             # default: redis_secret
```

If you are deploying behind an external TLS proxy or a different public hostname, also set:

```env
WEB_APP_URL=https://gamepile.example.com
WEB_ALLOWED_ORIGINS=gamepile.example.com
```

### Worker-only deploy against external PostgreSQL + Redis

Use `docker-compose.worker.remote.yml` when you want to run only the BullMQ worker against an already-managed database and Redis instance.

Required variables for that compose file:

```env
DATABASE_URL=postgresql://user:password@db.example.com:5432/gamepile?schema=public
REDIS_HOST=redis.example.com
REDIS_PORT=6379
REDIS_PASSWORD=<your-redis-password>
STEAM_API_KEY=<your-32-char-steam-api-key>
```

Start it with:

```bash
docker compose -f docker-compose.worker.remote.yml up -d
```

Before the worker starts, Compose runs two one-shot readiness services that wait for:

- PostgreSQL connectivity,
- the `schema_migrations` table to exist, and
- Redis to respond to `PING`.

---

## Deep Configuration

See **[docs/CONFIGURATION.md](documentation/Configuration.md)** for the full reference, including:

- All web and worker environment variables with types and defaults
- Worker concurrency and rate-limit tuning
- Scheduled job cron expressions
- All admin panel feature flags (App Settings) with their defaults and effects

---

## Architecture

![Architecture Diagram](documentation/architecture.png)

| Component    | Description                                                                   |
|--------------|-------------------------------------------------------------------------------|
| **web**      | Next.js 16 app: UI, Server Actions, Steam OpenID auth, SSE job streaming      |
| **worker**   | BullMQ job processor: library imports, game catalog sync, achievement imports |
| **migrate**  | One-shot Prisma migration container. Runs and exits before web/worker start.  |
| **postgres** | Primary data store                                                            |
| **redis**    | BullMQ job queue broker and rate-limit store                                  |
| **caddy**    | Bundled reverse proxy on port 8080                                            |

Startup ordering is enforced by Compose health checks:

```
postgres (healthy) ─┐
                    ├─→ migrate (exits 0) ─→ web + worker
redis (healthy) ────┘
```

---

## Observability

Gamepile exports OpenTelemetry traces and structured logs from both `web` and `worker` via OTLP. Any compatible collector works — SigNoz, Grafana Alloy, Jaeger, etc.

Observability is **optional**. Omitting the OTLP variables has no effect on normal operation.

```env
OTEL_EXPORTER_OTLP_ENDPOINT=https://ingest.us2.signoz.cloud/
OTEL_EXPORTER_OTLP_HEADERS=signoz-ingestion-key=your-key
```

See [docs/OBSERVABILITY.md](documentation/Observability.md) for setup options and configuration details.

---

## Local Development

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env — at minimum set DATABASE_URL, REDIS_HOST, and STEAM_API_KEY

# 3. Generate Prisma clients
npm run db:generate

# 4. Run migrations
npm run db:migrate:dev

# 5. Start web and worker
npm run dev
```

Individual services:

```bash
npm run dev:web      # Next.js dev server on port 3000
npm run dev:worker   # BullMQ worker with hot-reload
```

To build from source with Docker instead of using the published images:

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml up --build
```

---

## Kubernetes

Manifests are provided in [`docs/k8s/`](deployment/k8s). The migration runs as a Kubernetes `Job`. The `web` and `worker` `Deployment`s use init containers to wait for the migration job to complete before starting.

---

<sub>AI tools were used during development to assist with code review and the implementation of simpler tasks. The majority of this codebase was designed, architected, and programmed by [Thomas Koeppe](https://github.com/thomaskoeppe).</sub>
