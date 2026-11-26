#!/usr/bin/env bash
# Prints sudo commands for the DEV box. It never runs sudo and changes nothing.
# Copy the commands and run them yourself.
set -euo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
me="$(id -un)"

case "${1:-}" in
  mdns-install)
    cat <<TXT
Publishes the name spendual.local for this machine's LAN IP (port 5173 is the dev server).
Needs: avahi-daemon running (systemctl is-active avahi-daemon) and avahi-utils (avahi-publish).
What it does:
  - copies a systemd unit that runs: avahi-publish -a -R spendual.local <this machine's IP>
  - copies an avahi service file that announces _http._tcp on port 5173
Type these commands:

  sudo apt install avahi-daemon avahi-utils        # skip if already installed
  sudo systemctl enable --now avahi-daemon
  sudo cp $repo/deployment/avahi/spendual-dev-mdns.service /etc/systemd/system/
  sudo cp $repo/deployment/avahi/spendual-dev.service /etc/avahi/services/
  sudo systemctl daemon-reload
  sudo systemctl enable --now spendual-dev-mdns.service

Check (wait a few seconds):

  avahi-resolve -n spendual.local
  getent hosts spendual.local
  then open http://spendual.local:5173 after make dev

If your IP changes (new Wi-Fi, no DHCP reservation): sudo systemctl restart spendual-dev-mdns
Production stack (deployment/docker-compose.yml): use deployment/avahi/spendual.service
(port 80, or APP_PORT). See deployment/README.md.
TXT
    ;;
  mdns-remove)
    cat <<TXT
Removes the dev name. Type these commands:

  sudo systemctl disable --now spendual-dev-mdns.service
  sudo rm -f /etc/systemd/system/spendual-dev-mdns.service /etc/avahi/services/spendual-dev.service
  sudo systemctl daemon-reload
TXT
    ;;
  backup-timer-install)
    cat <<TXT
Daily backup of the DEV database at 03:00 (and at next boot if the machine was off).
The unit runs '$repo/deployment/dev-data.sh backup-auto' as user $me. It skips quietly if MySQL
is not running, and prints a warning (exit 0) if a dump fails.
The user must be in the docker group (check: id -nG $me | grep -w docker). HOST_UID and HOST_GID
are not needed: the backup only runs docker compose exec on the MySQL container.
If you start the dev stack with COMPOSE_PROJECT_NAME set, add Environment=COMPOSE_PROJECT_NAME=...
to the unit; the default (spendual) is what this timer backs up.
Files go to $repo/backups (mode 600, last 14 kept). Type these commands:

  sudo tee /etc/systemd/system/spendual-dev-backup.service >/dev/null <<'UNIT'
[Unit]
Description=Spendual dev database backup
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
User=$me
WorkingDirectory=$repo
ExecStart=/bin/sh -c '$repo/deployment/dev-data.sh backup-auto'
UNIT

  sudo tee /etc/systemd/system/spendual-dev-backup.timer >/dev/null <<'UNIT'
[Unit]
Description=Daily Spendual dev database backup

[Timer]
OnCalendar=*-*-* 03:00:00
Persistent=true
RandomizedDelaySec=300

[Install]
WantedBy=timers.target
UNIT

  sudo systemctl daemon-reload
  sudo systemctl enable --now spendual-dev-backup.timer

Check:

  systemctl list-timers spendual-dev-backup.timer
  sudo systemctl start spendual-dev-backup.service && journalctl -u spendual-dev-backup.service -n 20
  ls -l $repo/backups

Remove: sudo systemctl disable --now spendual-dev-backup.timer
        sudo rm /etc/systemd/system/spendual-dev-backup.{service,timer}
TXT
    ;;
  *)
    echo "usage: dev-sudo.sh mdns-install|mdns-remove|backup-timer-install" >&2
    exit 1
    ;;
esac
