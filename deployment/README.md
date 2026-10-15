# Deployment

## Backup and restore

Backups are `mysqldump` files, gzipped, in a host folder **outside** the MySQL data volume.
A corrupt volume then does not take the backups with it.

### Files

- `backup.sh`: dump the database, keep the last N files.
- `restore.sh`: load a backup file into a database.
- `test-restore.sh`: backup, restore into a throwaway database, compare row counts of every table.
- `test-cleanup.sh`: checks that `test-restore.sh` leaves no temp files or throwaway database, on pass and fail.
- `lib.sh`: shared helpers.

### Set up on the deploy box

1. Create a root-only file with the MySQL root login. Mode must be `400` or `600`, or the scripts
   refuse to run:

   ```
   sudo install -d -o "$USER" -m 750 /etc/spendual
   install -m 600 /dev/null /etc/spendual/mysql-root.cnf
   printf '[client]\nuser=root\npassword=THE_PASSWORD\n' > /etc/spendual/mysql-root.cnf
   ```

   For the systemd timer the owner must be the `spendual` user. The "Backup timer" section sets
   this up.

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

4. Schedule it with the systemd timer (see "Backup timer" below).

5. The backend reads `BACKUP_DIR` for the status row in Ajustes. The script makes the folder mode
   `700`, so the backend user cannot read it by default. Either run the backend with the same UID
   as the backup user, or set the folder to mode `750` with a group the backend user is in. If
   the folder exists but is unreadable, Ajustes shows "configured" with no last backup, and the
   backend logs one warning. Only files named `spendual-*.sql.gz` count.

### Backup timer (systemd)

Units are in `deployment/systemd/`. The service runs as the user `spendual`, which must be in
the `docker` group. The repo is at `/opt/spendual`. Change names and paths in the units if yours
differ.

```
sudo useradd --system --create-home --shell /usr/sbin/nologin spendual   # skip if it exists
sudo usermod -aG docker spendual
# Config folder: owned by spendual, mode 750. The MySQL root file inside is mode 600.
sudo install -d -o spendual -g spendual -m 750 /etc/spendual
sudo install -m 600 -o spendual -g spendual /dev/null /etc/spendual/mysql-root.cnf
printf '[client]\nuser=root\npassword=THE_ROOT_PASSWORD\n' | sudo tee /etc/spendual/mysql-root.cnf >/dev/null
sudo install -m 640 -o spendual -g spendual deployment/systemd/backup.env.example /etc/spendual/backup.env
# Backup folder: owned by spendual, mode 700.
sudo install -d -o spendual -g spendual -m 700 /srv/spendual-backups
sudo cp deployment/systemd/spendual-backup.{service,timer} /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now spendual-backup.timer
```

Edit `/etc/spendual/backup.env` if your paths differ. `mysql-root.cnf` replaces the file from
the "Set up" section above (same content, now owned by `spendual`).

Check:

```
systemctl list-timers spendual-backup.timer
sudo systemctl start spendual-backup.service && journalctl -u spendual-backup.service -n 20
```

- Runs daily at 03:00, and at next boot if the box was off (`Persistent=true`).
- The unit files pass `systemd-analyze verify` apart from the repo path, which exists only on the
  deploy box. They have not run on the deploy box.
- Confirm the unit runs as that user: `systemctl show -p User spendual-backup.service`, and the
  last run: `sudo -u spendual env $(cat /etc/spendual/backup.env | xargs) /opt/spendual/deployment/backup.sh`.
- The app container runs as UID 1000 (`node`) and mounts the backup folder read-only. For the
  status row in Ajustes, the backup user should be UID 1000, or the folder must be mode `750`
  with a group that UID 1000 is in.

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

## Deploy

One image serves the API and the built frontend on one port. MySQL runs in a second container.

### Files

- `Dockerfile` (repo root): multi-stage build. Shared and backend are compiled to plain JS, the
  frontend is built by Vite, the runtime image has `openssl`, production dependencies only, and
  runs as the non-root user `node`.
- `docker-compose.yml` (this folder): `app` and `mysql:8.4`. We use this folder, not the repo
  root, so the dev file (`compose.dev.yml`) and the deploy file never mix.
- `.env.example`: all settings. Copy to `.env` (git ignores it) and fill in.
- `docker-entrypoint.sh`: runs `prisma migrate deploy`, then starts the server. If a migration
  fails the container stops and restarts, so look at `docker compose logs app`.

### First run

```
cd deployment
cp .env.example .env
# fill in the three secrets:  openssl rand -hex 24   (SESSION_SECRET: openssl rand -hex 32)
mkdir -p /srv/spendual-backups
docker compose up -d --build
curl http://localhost/health
```

- The container runs the seed after the migrations on every start. It adds the household row and
  the base categories and accounts, and it is safe to repeat. No manual seed step.
- Then open the site and sign up account 1 and account 2. A third signup is refused.
- Update: `git pull && docker compose up -d --build`. Migrations run on start. Take a backup first.
- `sudo systemctl enable docker` so the stack starts after a reboot. Every service has
  `restart: unless-stopped`.

### Network

- Only the app port is published (`APP_PORT`, default 80). MySQL has no `ports:` entry and sits
  on an `internal: true` network.
- Check on the box: `ss -ltn | grep 3306` must show nothing, and `docker compose ps` must show no
  host port for `mysql`.

### Login rate limit behind Docker

The login limit counts failures per client IP. Set `TRUST_PROXY` in `.env` only when a reverse
proxy sits in front (a hop count such as `1`, or `true`). It is off by default, because with it
on and no proxy a client can fake its IP in `X-Forwarded-For` and skip the limit. Docker's
published port can show all clients as the bridge IP (for example 172.x.x.1), so the limit
would be shared by every device. To verify on the box: make 11 wrong logins from one device,
then try a login from a second device. If the second device is also blocked, the app sees the
bridge IP. This is **not verified**.

### Risk: no HTTPS

There is no HTTPS at MVP. The session cookie has `Secure` off, so passwords and cookies cross
the LAN in clear text. Anyone on the same network (Wi-Fi guests, a hacked device) can read them.
Limits:

- No public ingress. Do not forward the port on the router.
- Allow the port only from the LAN subnet. Example with ufw (change the subnet and port):

  ```
  sudo ufw default deny incoming
  sudo ufw allow from 192.168.0.0/24 to any port 80 proto tcp
  sudo ufw allow from 192.168.0.0/24 to any port 5353 proto udp   # mDNS
  sudo ufw allow OpenSSH   # or limit it to the LAN too
  sudo ufw enable
  ```

- Docker publishes ports through its own iptables rules, and these can bypass ufw. Check from a
  second device outside the subnet, or bind the port to the LAN address in `.env`
  (`APP_PORT=192.168.0.10:80`).
- Do not use a shared or guest Wi-Fi. Use a strong password.

### mDNS: spendual.local

Status: **untested**. It was written on the dev box and could not be tried on the deploy box.

The name `spendual.local` comes from the host name of the box plus avahi. Set the host name:
`sudo hostnamectl set-hostname spendual`.

1. On the deploy box, check whether avahi already runs:

   ```
   systemctl is-active avahi-daemon
   ss -ulpn | grep 5353
   ```

2. Active (default path): publish the service with a host file, no container.

   ```
   sudo cp deployment/avahi/spendual.service /etc/avahi/services/spendual.service
   sudo systemctl reload avahi-daemon
   avahi-resolve -n spendual.local     # from the box; or ping spendual.local from another device
   ```

   Edit `<port>` in the file if `APP_PORT` is not 80. If `avahi-daemon` is missing:
   `sudo apt install avahi-daemon`.

3. Not active and you cannot install it: use the container option. It uses `network_mode: host`
   and the same service file.

   ```
   docker compose --profile mdns up -d avahi
   ```

   Do not run this next to a host avahi: two daemons on UDP 5353 clash.

4. Linux and macOS resolve `.local` out of the box. Windows 10 (1803+) and 11 should too (not
   tested). It can fail depending on the network profile (Public vs Private) and the firewall.
   Test on the real Windows device.

5. Fallback if a device cannot resolve the name: give the box a fixed IP (router DHCP reservation)
   and use the IP in the browser. Optional hosts file entry, as administrator:
   `C:\Windows\System32\drivers\etc\hosts` gets the line `192.168.0.10  spendual.local`
   (use the real IP). On Linux or macOS: `/etc/hosts`.

### Sign-off checks that need the deploy box

Not done on the dev box: resolve `spendual.local` from a second device (and the Windows device),
reboot the host and see the stack come back, run the backup timer. Steps 2 and 13 of the plan's
end-to-end list.
