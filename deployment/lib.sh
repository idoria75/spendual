# Shared helpers for backup.sh, restore.sh and test-restore.sh. Source it, do not run it.
# Needs: bash, docker compose. Run the scripts from the folder that holds the compose file,
# or set COMPOSE_FILE.

MYSQL_SERVICE="${MYSQL_SERVICE:-mysql}"
MYSQL_DATABASE="${MYSQL_DATABASE:-spendual}"

die() {
  echo "error: $*" >&2
  exit 1
}

dc() {
  docker compose "$@"
}

# Host file with a [client] section (user and password). Must not be readable by others.
check_defaults_file() {
  local f="${MYSQL_DEFAULTS_FILE:-}"
  [ -n "$f" ] || die "MYSQL_DEFAULTS_FILE is not set (root-only file with a [client] section)"
  [ -f "$f" ] || die "MYSQL_DEFAULTS_FILE does not exist"
  local mode
  mode="$(stat -c '%a' "$f")"
  case "$mode" in
    400 | 600) ;;
    *) die "MYSQL_DEFAULTS_FILE must have mode 400 or 600 (it has $mode)" ;;
  esac
}

# Copy the defaults file into the container (through stdin, never on a command line) so that
# stdin stays free for the SQL stream. The copy is removed on exit.
CNF_IN_CONTAINER=""
install_defaults_file() {
  check_defaults_file
  CNF_IN_CONTAINER="/tmp/.spendual-$$-${RANDOM}.cnf"
  dc exec -T "$MYSQL_SERVICE" sh -c "umask 077; cat > '$CNF_IN_CONTAINER'" \
    < "$MYSQL_DEFAULTS_FILE"
  trap remove_defaults_file EXIT
}

remove_defaults_file() {
  if [ -n "$CNF_IN_CONTAINER" ]; then
    dc exec -T "$MYSQL_SERVICE" rm -f "$CNF_IN_CONTAINER" > /dev/null 2>&1 || true
  fi
}

# mysql / mysqldump inside the container. The defaults-extra-file option must come first.
mysql_cli() {
  dc exec -T "$MYSQL_SERVICE" mysql "--defaults-extra-file=$CNF_IN_CONTAINER" "$@"
}

mysqldump_cli() {
  dc exec -T "$MYSQL_SERVICE" mysqldump "--defaults-extra-file=$CNF_IN_CONTAINER" "$@"
}

# Database names go into SQL, so allow only safe characters.
check_db_name() {
  case "$1" in
    "" | *[!A-Za-z0-9_]*) die "bad database name '$1' (letters, digits and _ only)" ;;
  esac
}
