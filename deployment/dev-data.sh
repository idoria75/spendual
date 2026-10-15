#!/usr/bin/env bash
# Backup and restore of the DEV database (compose.dev.yml). Run from the repo root, use make:
#   make backup-dev | make restore-dev FILE=... CONFIRM=yes | make reset-dev CONFIRM=yes
# Files go to ./backups (git ignores it), mode 600, name spendual-dev-YYYYMMDD-HHMMSS.sql.gz.
# Dev login is the root/root of compose.dev.yml. This is not for the deploy box (see backup.sh).
set -euo pipefail
umask 077

cd "$(dirname "${BASH_SOURCE[0]}")/.."
export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-spendual}"
dc() { docker compose -f compose.dev.yml "$@"; }
dir="${BACKUP_DIR_DEV:-./backups}"
keep="${BACKUP_KEEP:-14}"
db=spendual
partial=""

die() { echo "error: $*" >&2; exit 1; }

mysql_up() {
  dc ps --status running --services 2>/dev/null | grep -qx mysql
}

sql() { dc exec -T -e MYSQL_PWD=root mysql mysql -uroot "$@"; }

# Returns 1 on any failure (never exits the script), so callers choose what to do.
# Note: inside "backup || ..." set -e is off, so every step is checked by hand.
backup() {
  mkdir -p "$dir" && chmod 700 "$dir" || return 1
  local stamp final
  stamp="$(date +%Y%m%d-%H%M%S)"
  # Never overwrite an existing file (a restore takes a safety backup in the same second).
  while [ -e "$dir/spendual-dev-$stamp.sql.gz" ]; do stamp="$stamp-$RANDOM"; done
  final="$dir/spendual-dev-$stamp.sql.gz"
  partial="$dir/.spendual-dev-$stamp.partial"
  trap 'rm -f "${partial:-}"' EXIT
  # pipefail (set above): a failed mysqldump fails the whole pipeline.
  if ! dc exec -T -e MYSQL_PWD=root mysql mysqldump -uroot --single-transaction --routines \
    --triggers --events --hex-blob --no-tablespaces "$db" | gzip -9 > "$partial"; then
    echo "error: mysqldump failed" >&2
    rm -f "$partial"
    return 1
  fi
  if ! gzip -t "$partial" || ! gzip -dc "$partial" | tail -n 1 | grep -q '^-- Dump completed'; then
    echo "error: dump looks incomplete" >&2
    rm -f "$partial"
    return 1
  fi
  mv "$partial" "$final" && chmod 600 "$final" || return 1
  # Rotation: only our own dev files, newest first.
  # shellcheck disable=SC2012
  ls -1t "$dir"/spendual-dev-*.sql.gz 2>/dev/null | tail -n "+$((keep + 1))" | while IFS= read -r old; do
    rm -f -- "$old"
  done || true
  echo "backup written: $final"
}

# Other dev data volumes on this machine (read-only look). A fixed project name hides data that
# was made under another project name or folder name. Prints a warning, never fails.
warn_other_volumes() {
  local mine="${COMPOSE_PROJECT_NAME}_mysql_data" v
  local others
  others="$(docker volume ls -q 2>/dev/null | grep -E '_mysql_data$' | grep -vx "$mine" || true)"
  [ -n "$others" ] || return 0
  echo "NOTE: other MySQL data volumes exist (this run uses '$mine'):" >&2
  for v in $others; do
    local info=""
    # Read-only mount of an image we already have. Never read-write. Skipped if no image.
    if docker image inspect mysql:8.4 >/dev/null 2>&1; then
      info="$(docker run --rm --pull=never --entrypoint sh -v "$v":/v:ro mysql:8.4 -c \
        'if [ -d /v/spendual ]; then echo "has database spendual, $(ls /v/spendual | wc -l) files, last write $(date -r /v/ibdata1 +%F\ %H:%M 2>/dev/null)"; else echo "no spendual database"; fi' 2>/dev/null || true)"
    fi
    echo "  - $v ${info:+($info)}" >&2
  done
  echo "  If your old login or data is missing, it may be in one of these. See deployment/README.md," >&2
  echo "  'Your data (dev)', 'Find old data'." >&2
  return 0
}

case "${1:-}" in
  backup)
    mysql_up || die "MySQL is not running (project '$COMPOSE_PROJECT_NAME'). Run make dev first."
    backup || exit 1
    ;;
  backup-auto)
    # Used by make dev. Quiet when MySQL is not up yet (first start). A failed dump is a warning.
    warn_other_volumes || true
    mysql_up || exit 0
    # An empty database (no tables yet) has nothing to save.
    n="$(sql -N -B -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='$db'" 2>/dev/null || echo 0)"
    [ "${n:-0}" -gt 0 ] || exit 0
    backup || echo "warning: automatic backup failed, continuing without it" >&2
    exit 0
    ;;
  restore)
    file="${2:-}"
    [ -n "$file" ] || die "usage: make restore-dev FILE=backups/spendual-dev-....sql.gz CONFIRM=yes"
    [ -f "$file" ] || die "file not found: $file"
    [ "${CONFIRM:-}" = yes ] || die "restore REPLACES the dev database. Add CONFIRM=yes to go on."
    gzip -t "$file" || die "not a valid gzip file"
    mysql_up || die "MySQL is not running (project '$COMPOSE_PROJECT_NAME'). Start it: docker compose -f compose.dev.yml up -d mysql"
    echo "Saving the current data first."
    backup || die "safety backup failed, nothing was changed"
    sql -e "DROP DATABASE IF EXISTS \`$db\`; CREATE DATABASE \`$db\` CHARACTER SET utf8mb4; GRANT ALL ON \`$db\`.* TO 'spendual'@'%';"
    gzip -dc "$file" | sql "$db"
    echo "restored from $file"
    ;;
  reset)
    [ "${CONFIRM:-}" = yes ] || die "reset DELETES the dev database volume. Add CONFIRM=yes to go on."
    if mysql_up; then backup || die "backup failed, nothing was deleted"; else echo "MySQL is not running: no backup taken." >&2; fi
    echo "Deleting containers and volume of project '$COMPOSE_PROJECT_NAME'."
    dc down -v
    ;;
  *)
    die "usage: dev-data.sh backup|backup-auto|restore FILE|reset"
    ;;
esac
