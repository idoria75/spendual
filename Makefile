export HOST_UID := $(shell id -u)
export HOST_GID := $(shell id -g)
COMPOSE = docker compose -f compose.dev.yml
RUN = mkdir -p node_modules && $(COMPOSE) run --rm app

.PHONY: install dev lint typecheck test build migrate down test-restore

install:
	$(RUN) npm install

dev:
	mkdir -p node_modules && $(COMPOSE) run --rm --service-ports app sh -c \
	  'npm run migrate -w backend && npm run seed -w backend && \
	  (npm run dev -w backend & npm run dev -w frontend & wait)'

lint:
	$(RUN) npm run lint

typecheck:
	$(RUN) npm run typecheck

test:
	$(RUN) npm test

build:
	$(RUN) npm run build

migrate:
	$(RUN) npm run migrate --workspace backend

down:
	$(COMPOSE) down

# Needs the compose project to be up. Applies migrations and seed, then runs the restore test.
test-restore:
	$(RUN) sh -c 'npm run migrate -w backend && npm run seed -w backend'
	COMPOSE_FILE=compose.dev.yml ./deployment/test-restore.sh
