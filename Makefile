RUN = mkdir -p node_modules && docker compose -f compose.dev.yml run --rm app

.PHONY: install dev lint typecheck test build migrate down

install:
	$(RUN) npm install

dev:
	docker compose -f compose.dev.yml run --rm --service-ports app npm run dev

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
	docker compose -f compose.dev.yml down
