#!/usr/bin/env bash
# =============================================================================
# GAMEPILE — Database backup
#
# Dumps the bundled Postgres container to a gzipped SQL file in ./backups/.
# Suitable for cron, e.g.:
#
#   0 4 * * * /opt/gamepile/deployment/docker/backup.sh --retention-days 14
#
# Usage:
#   ./backup.sh                       # dump to ./backups/gamepile-<timestamp>.sql.gz
#   ./backup.sh --retention-days 14   # additionally delete backups older than N days
#
# Restore (into a fresh database):
#   gunzip -c backups/gamepile-<timestamp>.sql.gz \
#     | docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

COMPOSE=(docker compose)
BACKUP_DIR="$SCRIPT_DIR/backups"
RETENTION_DAYS=0

log()  { printf '\033[1;34m[backup]\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31m[backup]\033[0m %s\n' "$*" >&2; exit 1; }

while [[ $# -gt 0 ]]; do
    case "$1" in
        --retention-days)   RETENTION_DAYS="${2:?--retention-days requires a value}"; shift 2 ;;
        --retention-days=*) RETENTION_DAYS="${1#*=}"; shift ;;
        --help|-h)
            sed -n '2,17p' "$0" | sed 's/^# \{0,1\}//'
            exit 0
            ;;
        *) fail "Unknown argument: $1 (see --help)" ;;
    esac
done

command -v docker >/dev/null 2>&1 || fail "docker is not installed or not on PATH."
"${COMPOSE[@]}" ps --status running postgres --quiet | grep -q . \
    || fail "Postgres container is not running — nothing to back up."

mkdir -p "$BACKUP_DIR"
BACKUP_FILE="$BACKUP_DIR/gamepile-$(date -u +%Y%m%dT%H%M%SZ).sql.gz"

log "Dumping database to $BACKUP_FILE ..."
"${COMPOSE[@]}" exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB"' | gzip > "$BACKUP_FILE"
[[ -s "$BACKUP_FILE" ]] || fail "Backup file is empty."
log "Backup complete ($(du -h "$BACKUP_FILE" | cut -f1))."

if [[ "$RETENTION_DAYS" -gt 0 ]]; then
    DELETED=$(find "$BACKUP_DIR" -name 'gamepile-*.sql.gz' -mtime +"$RETENTION_DAYS" -print -delete | wc -l)
    log "Retention: deleted $DELETED backup(s) older than $RETENTION_DAYS day(s)."
fi
