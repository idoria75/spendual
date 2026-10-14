#!/usr/bin/env bash
# Dump the Spendual database to a timestamped .sql.gz in BACKUP_DIR and keep the last N files.
#
# Env:
#   BACKUP_DIR           required. Host folder, outside the MySQL volume.
#   MYSQL_DEFAULTS_FILE  required. Root-only (mode 400 or 600) file with
#                        [client] user=root and password=... The password is never put on a
#                        command line.
#   BACKUP_KEEP          how many backups to keep. Default 14.
#   MYSQL_DATABASE       database to dump. Default spendual.
#   MYSQL_SERVICE        compose service name. Default mysql.
set -euo pipefail
umask 077

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
. "$here/lib.sh"

[ -n "${BACKUP_DIR:-}" ] || die "BACKUP_DIR is not set"
keep="${BACKUP_KEEP:-14}"
case "$keep" in
  "" | *[!0-9]* | 0) die "BACKUP_KEEP must be a positive number" ;;
esac
check_db_name "$MYSQL_DATABASE"

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

install_defaults_file

stamp="$(date +%Y%m%d-%H%M%S)"
final="$BACKUP_DIR/spendual-$stamp.sql.gz"
# Hidden name while writing, so a half file is never taken for a backup.
partial="$BACKUP_DIR/.spendual-$stamp.partial"
trap 'rm -f "$partial"; remove_defaults_file' EXIT

mysqldump_cli --single-transaction --routines --triggers --events --hex-blob \
  --no-tablespaces "$MYSQL_DATABASE" | gzip -9 > "$partial"

# An empty dump still gzips to a few bytes. Check that it ends like a finished dump.
gzip -t "$partial"
gzip -dc "$partial" | tail -n 1 | grep -q '^-- Dump completed' \
  || die "dump looks incomplete"

mv "$partial" "$final"
chmod 600 "$final"

# Rotation: only our own files, newest first, drop everything after N.
# shellcheck disable=SC2012
ls -1t "$BACKUP_DIR"/spendual-*.sql.gz | tail -n "+$((keep + 1))" | while IFS= read -r old; do
  rm -f -- "$old"
done

echo "backup written: $(basename "$final")"
