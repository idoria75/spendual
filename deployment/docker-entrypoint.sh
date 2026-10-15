#!/bin/sh
# Apply pending migrations, seed the base data (safe to repeat), then start the server. A failed migration stops the container.
set -eu
cd /app
node_modules/.bin/prisma migrate deploy --schema backend/prisma/schema.prisma
# Idempotent seed: signup needs the household row and the base catalogs.
node --conditions=production backend/dist/seed/run.js
exec node --conditions=production backend/dist/index.js
