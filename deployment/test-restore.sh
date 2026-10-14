#!/usr/bin/env bash
# Scripted restore test: backup -> restore into a throwaway database -> compare row counts of
# every table. Needs a running mysql service whose main database has the schema and some rows
# (in dev: make migrate, then the seed).
#
# Env: COMPOSE_FILE / COMPOSE_PROJECT_NAME (as for docker compose), MYSQL_DATABASE,
#      MYSQL_ROOT_PASSWORD (default root, dev only; written to a temp file with mode 600).
set -euo pipefail
umask 077

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
. "$here/lib.sh"

work="$(mktemp -d)"
throwaway="spendual_restore_test_$$"
cleanup() {
  if [ -n "$CNF_IN_CONTAINER" ]; then
    mysql_cli -e "DROP DATABASE IF EXISTS \`$throwaway\`" > /dev/null 2>&1 || true
  fi
  remove_defaults_file
  rm -rf "$work"
}
trap cleanup EXIT

printf '[client]\nuser=root\npassword=%s\n' "${MYSQL_ROOT_PASSWORD:-root}" > "$work/root.cnf"
export MYSQL_DEFAULTS_FILE="$work/root.cnf"
export BACKUP_DIR="$work/backups"

"$here/backup.sh"
file="$(ls -1 "$BACKUP_DIR"/spendual-*.sql.gz)"
[ "$(stat -c '%a' "$file")" = "600" ] || die "backup file is not mode 600"

# restore.sh must refuse the main database without --force.
if "$here/restore.sh" --db "$MYSQL_DATABASE" "$file" > /dev/null 2>&1; then
  die "restore.sh overwrote the main database without --force"
fi

"$here/restore.sh" --db "$throwaway" "$file"

install_defaults_file
count_rows() {
  local db="$1" t
  mysql_cli -N -B -e \
    "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA='$db' AND TABLE_TYPE='BASE TABLE' ORDER BY TABLE_NAME" \
    | while IFS= read -r t; do
      printf '%s %s\n' "$t" "$(mysql_cli -N -B -e "SELECT COUNT(*) FROM \`$db\`.\`$t\`")"
    done
}

count_rows "$MYSQL_DATABASE" > "$work/main.txt"
count_rows "$throwaway" > "$work/restored.txt"

tables="$(wc -l < "$work/main.txt")"
rows="$(awk '{s += $2} END {print s + 0}' "$work/main.txt")"
[ "$tables" -gt 0 ] || die "main database has no tables"
[ "$rows" -gt 0 ] || die "main database has no rows, nothing to compare (run the seed first)"

if diff "$work/main.txt" "$work/restored.txt"; then
  echo "restore test OK: $tables tables, $rows rows match"
else
  die "row counts differ (diff above)"
fi
