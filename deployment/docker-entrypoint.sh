#!/bin/sh
# Apply pending migrations, then start the server. A failed migration stops the container.
set -eu
cd /app
node_modules/.bin/prisma migrate deploy --schema backend/prisma/schema.prisma
exec node --conditions=production backend/dist/index.js
