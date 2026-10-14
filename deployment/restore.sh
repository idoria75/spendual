#!/usr/bin/env bash
# Restore a backup file into a database.
#
# Usage: restore.sh [--db NAME] [--force] FILE.sql.gz
#   --db NAME  target database. Default spendual_restore_test (a throwaway).
#   --force    needed to restore into the main database (MYSQL_DATABASE, default spendual).
#              The target is dropped and created again first.
#
# Env: MYSQL_DEFAULTS_FILE (required, see backup.sh), MYSQL_DATABASE, MYSQL_SERVICE.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
. "$here/lib.sh"

target="spendual_restore_test"
force=0
file=""
while [ $# -gt 0 ]; do
  case "$1" in
    --db)
      [ $# -ge 2 ] || die "--db needs a name"
      target="$2"
      shift 2
      ;;
    --force)
      force=1
      shift
      ;;
    -*) die "unknown option $1" ;;
    *)
      [ -z "$file" ] || die "only one file"
      file="$1"
      shift
      ;;
  esac
done

[ -n "$file" ] || die "usage: restore.sh [--db NAME] [--force] FILE.sql.gz"
[ -f "$file" ] || die "file not found"
check_db_name "$target"
check_db_name "$MYSQL_DATABASE"
if [ "$target" = "$MYSQL_DATABASE" ] && [ "$force" -ne 1 ]; then
  die "refusing to overwrite the main database '$MYSQL_DATABASE' without --force"
fi
gzip -t "$file"

trap remove_defaults_file EXIT
install_defaults_file

mysql_cli -e "DROP DATABASE IF EXISTS \`$target\`; CREATE DATABASE \`$target\` CHARACTER SET utf8mb4;"
gzip -dc "$file" | mysql_cli "$target"
echo "restored into database: $target"
