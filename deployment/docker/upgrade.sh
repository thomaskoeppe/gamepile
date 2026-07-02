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

COMPOSE=(docker compose)
ENV_FILE="../../.env"
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
docker compose version >/dev/null 2>&1 || fail "docker compose v2 is required."
[[ -f "$ENV_FILE" ]] || fail "No .env found at $ENV_FILE — copy .env.example and configure it first."

if [[ -n "$TARGET_VERSION" ]]; then
    export GAMEPILE_VERSION="$TARGET_VERSION"
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
