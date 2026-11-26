# Production image: one container serves the API and the built frontend on one port.
# Build:  docker build -t spendual .

# ---- build: compile shared, backend and frontend ----
FROM node:22-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
COPY e2e/package.json e2e/
COPY packages/shared/package.json packages/shared/
RUN npm ci
COPY . .
# Order matters: backend and frontend build against the shared source (types), shared emits dist.
RUN npm run build -w @spendual/shared \
  && npm run build -w @spendual/backend \
  && npm run build -w @spendual/frontend

# ---- deps: production dependencies only, plus the generated Prisma client ----
FROM node:22-bookworm-slim AS deps
# Prisma needs openssl to detect the libssl version.
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
COPY e2e/package.json e2e/
COPY packages/shared/package.json packages/shared/
RUN npm ci --omit=dev -w @spendual/backend -w @spendual/shared
COPY backend/prisma backend/prisma
RUN npx prisma generate --schema backend/prisma/schema.prisma

# ---- runtime ----
FROM node:22-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production \
    PORT=3000 \
    STATIC_DIR=/app/frontend/dist \
    TZ=America/Sao_Paulo \
    HOME=/home/node
WORKDIR /app
COPY --from=deps --chown=node:node /app/node_modules node_modules
COPY --from=deps --chown=node:node /app/package.json /app/package-lock.json ./
COPY --from=deps --chown=node:node /app/backend/package.json backend/package.json
COPY --from=deps --chown=node:node /app/backend/prisma backend/prisma
COPY --from=build --chown=node:node /app/backend/dist backend/dist
COPY --from=build --chown=node:node /app/packages/shared/package.json packages/shared/package.json
COPY --from=build --chown=node:node /app/packages/shared/dist packages/shared/dist
COPY --from=build --chown=node:node /app/frontend/dist frontend/dist
COPY --chown=node:node deployment/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod 755 /usr/local/bin/docker-entrypoint.sh
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["docker-entrypoint.sh"]
