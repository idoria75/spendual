export HOST_UID := $(shell id -u)
export HOST_GID := $(shell id -g)
# One fixed project name, so every directory and worktree uses the SAME dev data (volume
# spendual_mysql_data). Parallel agents set their own COMPOSE_PROJECT_NAME to stay apart.
export COMPOSE_PROJECT_NAME ?= spendual
COMPOSE = docker compose -f compose.dev.yml
RUN = mkdir -p node_modules && $(COMPOSE) run --rm app

.PHONY: demo-data install dev lint typecheck test build migrate e2e down test-restore format format-check backup-dev restore-dev reset-dev mdns-install mdns-remove backup-timer-install

install:
	$(RUN) npm install

# Ctrl-C ends with exit 0. Docker and make report an interrupt as 130 (SIGINT) or 143 (SIGTERM).
dev:
	@echo "Dev data: compose project '$(COMPOSE_PROJECT_NAME)', volume '$(COMPOSE_PROJECT_NAME)_mysql_data'"
	@./deployment/dev-data.sh backup-auto
	mkdir -p node_modules
	@$(COMPOSE) run --rm --service-ports app bash scripts/dev-run.sh; rc=$$?; \
	  if [ $$rc -eq 130 ] || [ $$rc -eq 143 ]; then rc=0; fi; exit $$rc

lint:
	$(RUN) npm run lint

typecheck:
	$(RUN) npm run typecheck

test:
	$(RUN) npm test

build:
	$(RUN) npm run build

format:
	$(RUN) npm run format

format-check:
	$(RUN) npm run format:check

migrate:
	$(RUN) npm run migrate --workspace backend

e2e:
	mkdir -p node_modules && $(COMPOSE) --profile e2e run --rm e2e

# Stops containers. Keeps the data (no -v). To delete data use: make reset-dev CONFIRM=yes
down:
	$(COMPOSE) down

# Your data. Backups go to ./backups (mode 600, last 14 kept).
backup-dev:
	./deployment/dev-data.sh backup

restore-dev:
	CONFIRM="$(CONFIRM)" ./deployment/dev-data.sh restore "$(FILE)"

# The only target that deletes the dev database. Takes a backup first.
reset-dev:
	CONFIRM="$(CONFIRM)" ./deployment/dev-data.sh reset

# Replaces the records of the DEV database with 6 months of demo data. Users stay. Takes a backup first.
# Thai gets a new random password, written to backups/thai-demo-password.txt.
demo-data:
	@[ "$(CONFIRM)" = yes ] || { echo "demo-data DELETES the dev records (users stay). Add CONFIRM=yes to go on." >&2; exit 1; }
	./deployment/dev-data.sh backup
	$(RUN) env DEMO_CONFIRM=yes DEMO_PASSWORD_FILE=/workspace/backups/thai-demo-password.txt npm run demo -w backend

# Needs the compose project to be up. Applies migrations and seed, then runs the restore test.
test-restore:
	$(RUN) sh -c 'npm run migrate -w backend && npm run seed -w backend'
	COMPOSE_FILE=compose.dev.yml ./deployment/test-restore.sh
	COMPOSE_FILE=compose.dev.yml ./deployment/test-cleanup.sh

# mDNS: publish spendual.local on the dev box. These targets only PRINT the sudo commands.
# Nothing runs until you copy and type them. Needs avahi-daemon and avahi-utils on this machine.
mdns-install:
	@./deployment/dev-sudo.sh mdns-install

mdns-remove:
	@./deployment/dev-sudo.sh mdns-remove

backup-timer-install:
	@./deployment/dev-sudo.sh backup-timer-install
