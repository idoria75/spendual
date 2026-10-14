# Deployment

## Backup and restore

Backups are `mysqldump` files, gzipped, in a host folder **outside** the MySQL data volume.
A corrupt volume then does not take the backups with it.

### Files

- `backup.sh`: dump the database, keep the last N files.
- `restore.sh`: load a backup file into a database.
- `test-restore.sh`: backup, restore into a throwaway database, compare row counts of every table.
- `lib.sh`: shared helpers.

### Set up on the deploy box

1. Create a root-only file with the MySQL root login. Mode must be `400` or `600`, or the scripts
   refuse to run:

   ```
   sudo install -m 600 -o "$USER" /dev/null /etc/spendual/mysql-root.cnf
   printf '[client]\nuser=root\npassword=THE_PASSWORD\n' > /etc/spendual/mysql-root.cnf
   ```

   The password never goes on a command line or into an env var. The script copies the file
   into the container through stdin, uses it with `--defaults-extra-file`, and removes the copy
   on exit.

2. Pick a backup folder outside the MySQL volume, owned by a non-root user, for example
   `/srv/spendual-backups`. The script creates it with mode `700`. Files are `600` (umask 077).
   Set the same path as `BACKUP_DIR` for the backend, so Ajustes can show the last backup.

3. Run from the folder with the compose file (or set `COMPOSE_FILE`):

   ```
   BACKUP_DIR=/srv/spendual-backups \
   MYSQL_DEFAULTS_FILE=/etc/spendual/mysql-root.cnf \
   ./deployment/backup.sh
   ```

   | Env | Default | Meaning |
   |---|---|---|
   | `BACKUP_DIR` | required | Where the `spendual-YYYYMMDD-HHMMSS.sql.gz` files go |
   | `MYSQL_DEFAULTS_FILE` | required | Root-only `[client]` file |
   | `BACKUP_KEEP` | `14` | Number of backups to keep |
   | `MYSQL_DATABASE` | `spendual` | Database to dump |
   | `MYSQL_SERVICE` | `mysql` | Compose service name |

   The dump is written to a hidden `.partial` file first and renamed when it is complete, so a
   failed run never leaves a broken backup that looks good. Old files are removed only when the
   new one is complete.

4. Schedule it with a systemd timer on the host (the unit files come in Phase 6).

### Restore

```
MYSQL_DEFAULTS_FILE=/etc/spendual/mysql-root.cnf \
./deployment/restore.sh /srv/spendual-backups/spendual-20261014-030000.sql.gz
```

- Default target is the throwaway database `spendual_restore_test`. Check it there first.
- `--db NAME` picks another target.
- The target is dropped and created again before the load.
- To replace the main database, stop the app first, then add `--force`:

  ```
  ./deployment/restore.sh --force /srv/spendual-backups/spendual-20261014-030000.sql.gz
  ```

  Without `--force` the script refuses to touch the main database.

### Test the procedure

`make test-restore` (dev) runs `test-restore.sh` against the dev MySQL: it applies the
migrations and the seed, makes a backup, restores it into a throwaway database, and compares the
row count of every table. It also checks that the backup file is mode `600` and that
`restore.sh` refuses the main database without `--force`.

Not covered: restoring on a different MySQL version, and a full disaster drill. Do a real
restore drill once before you rely on this.
