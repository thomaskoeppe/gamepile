# 🎮 GAMEPILE

**Your Game Library** — A self-hosted web application to manage, track, and share your Steam game library with key vault support.

> ⚠️ **Beta / Work in Progress** — Gamepile is under active development and not yet considered stable. Features may change, break, or be incomplete. Use at your own risk.

## Project status

Gamepile is under active development and should be treated as beta software.

## Features

- 🎮 **Steam Library Sync** — Import and sync your Steam game library
- 🗂️ **Collections** — Organize games into named collections (private, friends-only, or public)
- 🔐 **Key Vaults** — Securely store and share Steam license keys with encryption
- 📊 **Playtime Tracking** — Track and sort games by playtime or last played date
- 👥 **Multi-user** — Invite system, collection/vault sharing
- 🔄 **Real-time Job Progress** — SSE-powered live progress for background jobs
- ⚙️ **Admin Panel** — Configure app settings, manage users, vaults, and collections

---

## Architecture

![Architecture Diagram](./docs/architecture.png)

| Component      | Description                                                                                |
|----------------|--------------------------------------------------------------------------------------------|
| **Web**        | Next.js 16 frontend with server components, Steam OpenID login, and API routes             |
| **Worker**     | BullMQ-powered background job processor for Steam library imports and game detail fetching |
| **PostgreSQL** | Primary data store (users, games, vaults, sessions, jobs)                                  |
| **Redis**      | Job queue broker for BullMQ                                                                |
| **Caddy**      | Simple reverse proxy                                                                       |

---

## Monorepo Packages

| Package    | Path              | Description                                                                             |
|------------|-------------------|-----------------------------------------------------------------------------------------|
| **web**    | `packages/web`    | Next.js 16 App Router frontend — UI, API routes, server actions, and Prisma client      |
| **worker** | `packages/worker` | BullMQ background worker — Steam library imports, game detail fetching, scheduled syncs |

Shared Prisma schema lives at `prisma/schema.prisma` with per-package generated clients.

---

## Tech Stack

| Layer          | Technology                                   |
|----------------|----------------------------------------------|
| Framework      | Next.js 16 (App Router)                      |
| UI             | ShadCN UI + Tailwind CSS v4 (dark mode only) |
| Language       | TypeScript (strict)                          |
| ORM            | Prisma 7 → PostgreSQL                        |
| Queue          | BullMQ → Redis                               |
| Auth           | Custom Steam OpenID                          |
| Server Actions | next-safe-action                             |
| Data Fetching  | SWR                                          |
| Job Streaming  | Server-Sent Events (SSE)                     |
| Observability  | OpenTelemetry (Pino logging + SigNoz APM)    |

---

## Observability & Logging

Gamepile includes built-in observability powered by OpenTelemetry and [SigNoz](https://signoz.io/) (APM platform).
We decided to go for Signoz as it can be self-hosted and provides a good free tier for starters, while still offering powerful features for log aggregation, distributed tracing, and metrics collection.

### Features

- 📊 **Centralized Logging** — Structured JSON logs aggregated in SigNoz
- 🔍 **Distributed Tracing** — Trace requests across web and worker services
- 📈 **Metrics Collection** — Application metrics and resource utilization
- 🚨 **Alerting** — Automatic alerts for errors, slow requests, and anomalies
- 🎯 **Log Search** — Full-text search and filtering in SigNoz UI

### Setup

**Option 1: Hosted SigNoz (Cloud)**
```bash
# Sign up at signoz.io/teams, create an account, create a new OpenTelemetry data source and get your ingestion key, then set in .env:
OTEL_EXPORTER_OTLP_ENDPOINT=https://ingest.us2.signoz.cloud:443
OTEL_EXPORTER_OTLP_HEADERS=signoz-ingestion-key=your-ingestion-key
```

**Option 2: Self-Hosted SigNoz**  
Use the official SigNoz installation guides:
- Docker: <https://signoz.io/docs/install/docker/>
- Kubernetes (local): <https://signoz.io/docs/install/kubernetes/local/>
- GitHub repository: <https://github.com/SigNoz/signoz>

📖 **Full Documentation**: See [docs/OBSERVABILITY.md](./docs/OBSERVABILITY.md) for detailed setup, configuration, and troubleshooting.

---

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) & [Docker Compose](https://docs.docker.com/compose/install/) v2+
- A [Steam Web API Key](https://steamcommunity.com/dev/apikey)
- A domain name (for production with TLS)

---

## Quick Start (Docker Compose)

```bash
# 1. Clone the repository
git clone https://github.com/thomaskoeppe/gamepile.git
cd gamepile

# 2. Copy and configure environment variables
cp .env.example .env
# Edit .env with your Steam API key, database URL, Redis password, etc.

# 3. Start all services
docker compose up -d

# 4. Access the application
open http://localhost:8080
```

Minimal environment variable configuration for quick start (no TLS):
```env
STEAM_API_KEY=<your-steam-api-key>
WEB_VAULT_TOKEN_SECRET=<random-secret>
DOMAIN=localhost:8080
WEB_APP_URL=http://localhost:8080
WEB_ALLOWED_ORIGINS=localhost:8080
```

Startup ordering in Compose is enforced automatically:
- `postgres` must become healthy first
- `migrate` runs Prisma migrations next
- `web` and `worker` start only after migrations complete

## Local Development (without Docker)

```bash
# 1. Install dependencies
npm install

# 2. Copy and configure environment variables
cp .env.example .env
# Edit .env — at minimum set DATABASE_URL, REDIS_HOST, and STEAM_API_KEY

# 3. Generate Prisma clients
npm run db:generate

# 4. Run database migrations
npm run db:migrate:dev

# 5. Start both web and worker in development mode
npm run dev
```

Individual packages can be started separately:
- `npm run dev:web` — Next.js dev server on port 3000
- `npm run dev:worker` — BullMQ worker with hot-reload

Kubernetes manifests in `docs/k8s` follow the same ordering pattern:
- migration Job waits for PostgreSQL readiness
- `web`/`worker` use init containers to wait for migration state
- ingress is Traefik-oriented (no NGINX-specific ingress class settings)

---

<sub>Note on AI Usage: AI tools were used during development to assist with code review and the implementation of simpler tasks. The majority of this codebase was designed, architected, and programmed by [Thomas Koeppe](https://github.com/thomaskoeppe).</sub>
