#!/usr/bin/env bash
# Checks that test-restore.sh leaves nothing behind (temp dir, throwaway database), on the pass
# path and on the fail path. Same env as test-restore.sh.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
. "$here/lib.sh"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
printf '[client]\nuser=root\npassword=%s\n' "${MYSQL_ROOT_PASSWORD:-root}" > "$tmp/root.cnf"
MYSQL_DEFAULTS_FILE="$tmp/root.cnf"

check_clean() {
  local leftovers dbs
  leftovers="$(find "$tmp/work" -mindepth 1 -maxdepth 1 | wc -l)"
  [ "$leftovers" -eq 0 ] || die "$1: temp files left in TMPDIR"
  dbs="$(dc exec -T "$MYSQL_SERVICE" sh -c \
    "cat > /tmp/.c$$ && mysql --defaults-extra-file=/tmp/.c$$ -N -B -e \"SHOW DATABASES LIKE 'spendual_restore_test%'\"; rm -f /tmp/.c$$" \
    < "$MYSQL_DEFAULTS_FILE")"
  [ -z "$dbs" ] || die "$1: throwaway database left: $dbs"
}

mkdir "$tmp/work"
TMPDIR="$tmp/work" "$here/test-restore.sh"
check_clean "pass path"

if TMPDIR="$tmp/work" TEST_RESTORE_FAIL=1 "$here/test-restore.sh"; then
  die "forced failure did not fail"
fi
check_clean "fail path"
echo "cleanup test OK"
