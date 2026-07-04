#!/usr/bin/env bash
# =============================================================================
# GAMEPILE — Docker Compose upgrade
#
# Upgrades a running deployment to a new release in the safe order:
#
#   1. Back up the database (pg_dump, gzipped into ./backups/)
#   2. Pull the target images
#   3. Run pending schema migrations (the old app version keeps serving
#      traffic; if migrations fail, nothing else is touched)
#   4. Recreate web/worker/caddy on the new images
#   5. Verify the stack came back up
#
# Usage:
#   ./upgrade.sh                    # upgrade to GAMEPILE_VERSION from .env (or latest)
#   ./upgrade.sh --version 2.3.0    # upgrade to a specific release
#   ./upgrade.sh --skip-backup      # skip the pg_dump step
#   ./upgrade.sh --yes              # non-interactive (no confirmation prompt)
#
# The target version is written to the environment for this invocation only.
# To make it permanent, set GAMEPILE_VERSION in your .env.
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# .env can live at the repository root (repo layout) or next to the compose
# file (standalone layout). Compose only auto-loads the latter for `${...}`
# interpolation, so whichever exists is passed explicitly via --env-file.
if [[ -f "$SCRIPT_DIR/../../.env" ]]; then
    ENV_FILE="$SCRIPT_DIR/../../.env"
elif [[ -f "$SCRIPT_DIR/.env" ]]; then
    ENV_FILE="$SCRIPT_DIR/.env"
else
    ENV_FILE=""
fi

COMPOSE=(docker compose)
[[ -n "$ENV_FILE" ]] && COMPOSE+=(--env-file "$ENV_FILE")
BACKUP_DIR="$SCRIPT_DIR/backups"
APP_SERVICES=(web worker caddy)

TARGET_VERSION=""
SKIP_BACKUP=0
ASSUME_YES=0

log()  { printf '\033[1;34m[upgrade]\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31m[upgrade]\033[0m %s\n' "$*" >&2; exit 1; }

while [[ $# -gt 0 ]]; do
    case "$1" in
        --version)      TARGET_VERSION="${2:?--version requires a value}"; shift 2 ;;
        --version=*)    TARGET_VERSION="${1#*=}"; shift ;;
        --skip-backup)  SKIP_BACKUP=1; shift ;;
        --yes|-y)       ASSUME_YES=1; shift ;;
        --help|-h)
            sed -n '2,21p' "$0" | sed 's/^# \{0,1\}//'
            exit 0
            ;;
        *) fail "Unknown argument: $1 (see --help)" ;;
    esac
done

# ── Preflight ────────────────────────────────────────────────────────────────
command -v docker >/dev/null 2>&1 || fail "docker is not installed or not on PATH."
docker compose version >/dev/null 2>&1 || fail "docker compose v2 (2.24+) is required."
[[ -n "$ENV_FILE" ]] || fail "No .env found (looked for ../../.env and ./.env relative to this script) — copy .env.example and configure it first."
log "Using env file: $ENV_FILE"

if [[ -n "$TARGET_VERSION" ]]; then
    export GAMEPILE_VERSION="$TARGET_VERSION"
fi

# Validate the compose file before touching anything. Catches hand-edit
# damage (duplicate YAML keys, missing volumes block, bad indentation) with
# the original compose error attached.
if ! COMPOSE_ERR="$("${COMPOSE[@]}" config -q 2>&1)"; then
    printf '%s\n' "$COMPOSE_ERR" >&2
    fail "docker-compose.yml failed validation (see above). If the file was edited by hand, restore the release version and keep local customizations in a docker-compose.override.yml instead — see documentation/Upgrading.md."
fi

# Required secrets must resolve non-empty, otherwise the recreated containers
# would start with blank credentials.
for var in STEAM_API_KEY WEB_VAULT_TOKEN_SECRET; do
    if ! grep -qE "^${var}=." "$ENV_FILE"; then
        fail "$var is empty or missing in $ENV_FILE — aborting before the stack is touched."
    fi
done

# Refuse to proceed when the pinned project has no data volume but one exists
# under another project name: continuing would start a fresh, empty database.
PROJECT_NAME="$("${COMPOSE[@]}" config --format json 2>/dev/null | sed -n 's/.*"name": *"\([^"]*\)".*/\1/p' | head -1)"
PROJECT_NAME="${PROJECT_NAME:-gamepile}"
if ! docker volume ls -q | grep -qx "${PROJECT_NAME}_postgres_data"; then
    OTHER_VOLUMES="$(docker volume ls -q | grep '_postgres_data$' || true)"
    if [[ -n "$OTHER_VOLUMES" ]]; then
        log "WARNING: no volume named ${PROJECT_NAME}_postgres_data, but found existing database volume(s):"
        printf '    %s\n' $OTHER_VOLUMES
        log "Starting now would create a NEW EMPTY database. Fix the project name first — see documentation/Upgrading.md (Troubleshooting → project name)."
        [[ "$ASSUME_YES" -eq 1 ]] || fail "Aborted for safety (re-run with --yes only if you are sure)."
    fi
fi

log "Target images:"
"${COMPOSE[@]}" config --images | grep "gamepile" | sed 's/^/    /'

if [[ "$ASSUME_YES" -ne 1 ]]; then
    read -r -p "Proceed with the upgrade? [y/N] " answer
    [[ "$answer" == "y" || "$answer" == "Y" ]] || fail "Aborted."
fi

# ── 1. Backup ────────────────────────────────────────────────────────────────
if [[ "$SKIP_BACKUP" -eq 1 ]]; then
    log "Skipping database backup (--skip-backup)."
elif ! "${COMPOSE[@]}" ps --status running postgres --quiet | grep -q .; then
    log "Postgres container is not running — skipping backup (external database? use backup.sh guidance in documentation/Upgrading.md)."
else
    mkdir -p "$BACKUP_DIR"
    BACKUP_FILE="$BACKUP_DIR/gamepile-$(date -u +%Y%m%dT%H%M%SZ).sql.gz"
    log "Backing up database to $BACKUP_FILE ..."
    "${COMPOSE[@]}" exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB"' | gzip > "$BACKUP_FILE"
    [[ -s "$BACKUP_FILE" ]] || fail "Backup file is empty — aborting upgrade."
    log "Backup complete ($(du -h "$BACKUP_FILE" | cut -f1))."
fi

# ── 2. Pull ──────────────────────────────────────────────────────────────────
log "Pulling target images ..."
"${COMPOSE[@]}" pull migrate web worker

# ── 3. Migrate ───────────────────────────────────────────────────────────────
# Run migrations explicitly BEFORE recreating the app containers. The old
# version keeps serving during this step; migrations are transactional and
# tracked in schema_migrations, so a failure here leaves the running stack
# untouched (restore the backup only if a partially-released schema bothers a
# rollback — see documentation/Upgrading.md).
log "Applying schema migrations ..."
if ! "${COMPOSE[@]}" run --rm migrate; then
    fail "Migrations failed — the running deployment was NOT touched. Inspect the output above, then retry. See documentation/Upgrading.md for troubleshooting."
fi
log "Migrations applied."

# ── 4. Recreate app services ─────────────────────────────────────────────────
log "Recreating application services on the new images ..."
"${COMPOSE[@]}" up -d --remove-orphans "${APP_SERVICES[@]}"

# ── 5. Verify ────────────────────────────────────────────────────────────────
log "Waiting for services to settle ..."
sleep 5
"${COMPOSE[@]}" ps

if "${COMPOSE[@]}" exec -T web sh -c 'wget -q -O - http://127.0.0.1:3000/api/v1/heartbeat' 2>/dev/null | grep -q '"version"'; then
    VERSION_JSON="$("${COMPOSE[@]}" exec -T web sh -c 'wget -q -O - http://127.0.0.1:3000/api/v1/heartbeat')"
    log "Heartbeat: $VERSION_JSON"
else
    log "Heartbeat check inconclusive — verify manually: curl http://<host>:8080/api/v1/heartbeat"
fi

log "Upgrade complete. Backups are kept in $BACKUP_DIR — prune old ones as needed."
