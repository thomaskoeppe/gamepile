# Configuration Reference

All configuration is done through environment variables. The web package validates its variables at startup using a Zod schema (`packages/web/env.ts`); the worker does the same via its own schema (`packages/worker/src/lib/env.ts`). If a required variable is missing or fails validation, the process exits with a clear error message listing what is wrong.

---

## Contents

- [Web environment variables](#web-environment-variables)
- [Worker environment variables](#worker-environment-variables)
- [Docker Compose variables](#docker-compose-variables)
- [App Settings (admin panel feature flags)](#app-settings)

---

## Web Environment Variables

These are read by the `web` service.

### Required

| Variable | Type | Description |
|---|---|---|
| `STEAM_API_KEY` | 32-char hex string | Steam Web API key. Obtain from [steamcommunity.com/dev/apikey](https://steamcommunity.com/dev/apikey). Used for user profile lookups, owned-game fetches, and catalog sync. |
| `WEB_VAULT_TOKEN_SECRET` | string (min 32 chars) | HMAC secret for signing per-vault access cookies. Changing this invalidates all active vault sessions. Generate with `openssl rand -hex 32`. |
| `DOMAIN` | hostname | Public hostname without protocol or trailing slash (e.g. `gamepile.example.com` or `localhost:8080`). The full `docker-compose.yml` file uses this to default `WEB_APP_URL` to `http://${DOMAIN}` and `WEB_ALLOWED_ORIGINS` to `DOMAIN`. |
| `WEB_APP_URL` | URL | Full public URL including protocol (e.g. `https://gamepile.example.com`). Used as the OpenID return URL and the Server Action origin. Must match exactly what the browser sends in the `Origin` header. Required by the app itself, but the full `docker-compose.yml` file supplies a default when omitted. |

When using the full `docker-compose.yml`, `DATABASE_URL` is constructed automatically from `POSTGRES_*` variables and does not need to be set in `.env`. When using `docker-compose.worker.remote.yml`, you must set `DATABASE_URL` explicitly because PostgreSQL is external.

### Optional — application

| Variable | Type | Default | Description |
|---|---|---|---|
| `WEB_ALLOWED_ORIGINS` | comma-separated hostnames | — | Additional hostnames allowed to submit Server Actions. Useful when the app is accessed through multiple domains or a CDN. Example: `gamepile.example.com,www.gamepile.example.com`. The full `docker-compose.yml` defaults this to `DOMAIN` when omitted. |
| `WEB_SESSION_COOKIE_NAME` | string | `__session` | Name of the authentication session cookie. |
| `WEB_SESSION_DURATION_DAYS` | integer 1–365 | `7` | How many days a session stays valid without activity. |
| `DATABASE_URL` | PostgreSQL URL | — | Prisma connection string. Required when running outside Docker Compose. Format: `postgresql://user:password@host:5432/dbname?schema=public` |
| `REDIS_HOST` | string | `localhost` | Redis host. |
| `REDIS_PORT` | integer | `6379` | Redis port. |
| `REDIS_PASSWORD` | string | — | Redis password. Leave empty for an unauthenticated local Redis. |
| `REDIS_USERNAME` | string | — | Redis ACL username, if the provider requires one. |
| `PRISMA_LOG_QUERIES` | `true` \| `false` | `true` | Enables Prisma query-event logging for slow queries (\>500ms). Set to `false` to disable query-event logging entirely. |
| `NODE_ENV` | `development` \| `production` \| `test` | `development` | Controls Prisma singleton behaviour and cookie security flags. Set to `production` in all deployed environments. |

### Optional — observability

These variables are all optional. Omitting them disables OTLP export; the app runs normally.

| Variable | Type | Default | Description |
|---|---|---|---|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | URL | — | Base OTLP endpoint. The logs exporter appends `/v1/logs` to this URL automatically. |
| `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` | URL | — | Explicit traces endpoint. Falls back to `OTEL_EXPORTER_OTLP_ENDPOINT` if omitted. |
| `OTEL_EXPORTER_OTLP_TRACES_PROTOCOL` | `http/protobuf` \| `grpc` | `http/protobuf` | Wire protocol for the traces exporter. |
| `OTEL_EXPORTER_OTLP_HEADERS` | comma-separated `key=value` | — | HTTP headers sent with every OTLP export request. Use this for auth tokens (e.g. `signoz-ingestion-key=abc123`). |
| `OTEL_LOG_LEVEL` | `debug` \| `info` \| `warn` \| `error` | `info` | Verbosity of the OTel SDK's own internal log output. |
| `NEXT_OTEL_VERBOSE` | `0` \| `1` | `0` | Set to `1` for verbose OTel debug output from the Next.js instrumentation layer. |

---

## Worker Environment Variables

These are read by the `worker` service. Many overlap with the web variables (same database, Redis, and OTLP config).

### Required

| Variable | Type | Description |
|---|---|---|
| `DATABASE_URL` | PostgreSQL URL | Same format as the web variable. |
| `STEAM_API_KEY` | 32-char hex string | Same as the web variable. The worker uses it directly for game catalog API calls. |
| `REDIS_HOST` | string | Redis host. |
| `REDIS_PORT` | integer | Redis port. |

### Optional — connection

| Variable | Type | Default | Description |
|---|---|---|---|
| `REDIS_PASSWORD` | string | — | Redis password. |
| `REDIS_USERNAME` | string | — | Redis ACL username. |
| `PRISMA_LOG_QUERIES` | `true` \| `false` | `true` | Enables Prisma query-event logging for slow queries (\>500ms). Set to `false` to disable query-event logging entirely. |
| `NODE_ENV` | enum | `development` | Set to `production` in deployed environments. |

### Optional — concurrency and job tuning

| Variable | Type | Default | Description |
|---|---|---|---|
| `WORKER_JOBS_CONCURRENCY` | integer | `3` | Number of jobs from the main `gamepile.jobs` queue processed in parallel. Each job can fan out many child tasks. |
| `WORKER_DETAILS_CONCURRENCY` | integer | `10` | Number of individual game-detail fetch tasks processed in parallel from the `gamepile.game-details` queue. |
| `WORKER_STARTUP_DELAY_MS` | integer (ms) | `300000` (5 min) | Delay before the worker begins processing after startup. Gives the web service time to finish migration and start up first. |
| `WORKER_STALE_ACTIVE_RECOVERY_DELAY_MS` | integer (ms) | `1800000` (30 min) | How long a job must be stuck in `ACTIVE` before it is considered stale and recovered. |
| `WORKER_ACTIVE_RECOVERY_LOCK_TTL_MS` | integer (ms) | `60000` (1 min) | TTL for the Redis distributed lock acquired during stale job recovery. |
| `WORKER_IMPORT_USER_LIBRARY_INTERVAL_MS` | integer (ms) | `604800000` (7 days) | How often the internal scheduler re-imports each user's Steam library. |

### Optional — scheduled jobs

| Variable | Type | Default | Description |
|---|---|---|---|
| `WORKER_SYNC_STEAM_GAMES_CRON` | cron expression | `0 3 * * 0` | When to run the full Steam catalog sync (default: 03:00 every Sunday). |
| `WORKER_REFRESH_GAME_DETAILS_CRON` | cron expression | `0 0 * * *` | When to refresh stale game detail records (default: midnight every day). |
| `WORKER_GAME_DETAILS_REFRESH_DAYS` | integer | `30` | A game's detail record is considered stale if it has not been refreshed within this many days. |

> **Note on changing cron expressions:** The worker stores the active schedule configuration in Redis. If you change a cron variable and restart the worker, the new schedule is applied automatically. All worker replicas must use the same cron values.

### Optional — Steam API rate limiting

The worker respects Steam API rate limits to avoid being throttled. These defaults are conservative and suitable for most deployments.

| Variable | Type | Default          | Description |
|---|---|------------------|---|
| `WORKER_STEAM_RATE_LIMIT_MAX` | integer | `200`            | Maximum number of Steam API requests allowed per window. |
| `WORKER_STEAM_RATE_LIMIT_WINDOW_MS` | integer (ms) | `300000` (5 min) | The rolling window for the rate limit counter. |
| `WORKER_STEAM_RATE_LIMIT_MIN_INTERVAL_MS` | integer (ms) | `1100`           | Minimum gap between individual API calls, regardless of the window limit. |
| `WORKER_STEAM_RATE_LIMIT_SCOPE` | `local` \| `distributed` | `local`          | `distributed` uses Redis to share the counter across multiple worker replicas. Use `local` only when running a single worker instance without Redis rate-limit coordination. |

### Optional — observability

| Variable | Type | Default | Description |
|---|---|---|---|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | URL | `http://localhost:4318` | Base OTLP endpoint for the worker. Unlike the web default, this is a local collector. |
| `OTEL_EXPORTER_OTLP_HEADERS` | comma-separated `key=value` | — | Auth headers for the OTLP endpoint. |
| `OTEL_SERVICE_NAME` | string | `gamepile-worker` | Service name reported in traces and logs. |
| `WORKER_LOG_TO_STDOUT` | `true` \| `false` | `true` | Whether to write structured log lines to stdout in addition to the OTLP exporter. |

---

## Docker Compose Variables

The repository ships with two Compose entry points:

- `docker-compose.yml` — full stack (`postgres`, `redis`, `migrate`, `web`, `worker`, `caddy`)
- `docker-compose.worker.remote.yml` — worker only, targeting external PostgreSQL + Redis

For the full-stack compose file, these variables are read directly from `.env` (or `--env-file`) and used to configure the internal services. You do not set `DATABASE_URL` manually there — Compose builds it from `POSTGRES_*`.

| Variable | Default | Description |
|---|---|---|
| `DOMAIN` | `gamepile.example.com` | Hostname used by the full-stack compose file to default `WEB_APP_URL` to `http://${DOMAIN}` and `WEB_ALLOWED_ORIGINS` to `DOMAIN`. |
| `POSTGRES_USER` | `gamepile` | PostgreSQL user created on first start. |
| `POSTGRES_PASSWORD` | `gamepile_secret` | PostgreSQL password. **Change this in production.** |
| `POSTGRES_DB` | `gamepile` | PostgreSQL database name. |
| `REDIS_PASSWORD` | `redis_secret` | Redis password. **Change this in production.** |
| `LOG_LEVEL` | `info` | Log level forwarded to both `web` and `worker` containers. |

For `docker-compose.worker.remote.yml`, set `DATABASE_URL`, `REDIS_HOST`, `REDIS_PORT`, and `STEAM_API_KEY` explicitly. That compose file includes two one-shot readiness services that block worker startup until:

1. PostgreSQL accepts connections,
2. the `schema_migrations` table exists, and
3. Redis responds to `PING`.

---

## App Settings

App Settings are feature flags stored in the database and configurable from the **Admin Panel** at `/admin/configuration`. Changes take effect immediately — no restart required.

Settings not present in the database fall back to the built-in defaults shown below.

### Registration and accounts

| Key | Default | Description |
|---|---|---|
| `ALLOW_USER_SIGNUP` | `true` | Allow new users to create accounts via Steam login. Set to `false` to stop all new registrations. If invite codes are also enabled, users with a valid code can still register. |
| `ALLOW_INVITE_CODE_GENERATION` | `false` | Allow invite codes to be generated (by admins) and used during registration. Required for invite-only mode. |
| `ALLOW_USER_ACCOUNT_DELETION` | `true` | Allow users to delete their own accounts from the settings page. |

### Sessions

| Key | Default | Description |
|---|---|---|
| `SESSION_TIMEOUT_SECONDS` | `43200` (12 h) | How long an inactive session is kept alive. This is separate from `WEB_SESSION_DURATION_DAYS`, which controls the cookie and database expiry. |

### Key Vaults

| Key | Default | Description |
|---|---|---|
| `VAULT_DEFAULT_AUTH_TYPE` | `NONE` | Default auth method when creating a new vault. Options: `NONE`, `PIN`, `PASSWORD`. |
| `VAULT_AUTH_ALLOW_PIN` | `true` | Allow users to set a PIN on their vault. |
| `VAULT_AUTH_ALLOW_PASSWORD` | `true` | Allow users to set a password on their vault. |
| `VAULT_ALLOW_PASSWORD_CHANGE` | `true` | Allow vault owners to change their vault's PIN or password after creation. |
| `VAULT_PIN_MIN_LENGTH` | `4` | Minimum PIN length. |
| `VAULT_PIN_MAX_LENGTH` | `8` | Maximum PIN length. |
| `VAULT_PASSWORD_MIN_LENGTH` | `8` | Minimum vault password length. |
| `VAULT_PASSWORD_MAX_LENGTH` | `16` | Maximum vault password length. |
| `VAULT_BLOCK_USER_ON_INCORRECT_PASSWORD` | `true` | Temporarily block a user from a vault after too many failed auth attempts. |
| `VAULT_BLOCK_AFTER_ATTEMPTS` | `3` | Number of failed attempts before the user is blocked. |
| `VAULT_BLOCK_DURATION_SECONDS` | `300` (5 min) | How long the block lasts. |
| `ALLOW_VAULT_DELETION` | `true` | Allow vault owners to delete their own vaults. |
| `DISABLE_VAULT_SHARING` | `false` | Prevent vault owners from adding other users to their vaults. |
| `MAX_VAULTS_PER_USER` | `10` | Maximum number of vaults a single user can own. |

### Collections

| Key | Default | Description |
|---|---|---|
| `ALLOW_PUBLIC_COLLECTIONS` | `true` | Allow users to set collections to public visibility. When disabled, all collections are forced private. |
| `MAX_COLLECTIONS_PER_USER` | `10` | Maximum number of collections a single user can own. |

### Admin permissions

| Key | Default | Description |
|---|---|---|
| `ADMIN_CAN_DELETE_ANY_VAULT` | `false` | Allow admins to delete vaults owned by other users. |
| `ADMIN_CAN_DELETE_ANY_COLLECTION` | `false` | Allow admins to delete collections owned by other users. |
| `ADMIN_CAN_CHANGE_RESOURCE_OWNER` | `true` | Allow admins to transfer ownership of a vault or collection to another user. |

### UI

| Key | Default | Description |
|---|---|---|
| `UI_GAME_LIBRARY_PRERENDERED_ROWS` | `2` | Number of rows pre-rendered outside the viewport in the virtualized library table. Higher values reduce visible loading gaps at the cost of more DOM nodes. |

