export HOST_UID := $(shell id -u)
export HOST_GID := $(shell id -g)
COMPOSE = docker compose -f compose.dev.yml
RUN = mkdir -p node_modules && $(COMPOSE) run --rm app

.PHONY: install dev lint typecheck test build migrate down

install:
	$(RUN) npm install

dev:
	mkdir -p node_modules && $(COMPOSE) run --rm --service-ports app npm run dev

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
