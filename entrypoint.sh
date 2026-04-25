#!/bin/sh
set -e

echo "Running database migrations..."
./node_modules/.bin/prisma migrate deploy --schema=./packages/backend/prisma/schema.prisma

echo "Starting server..."
exec node packages/backend/dist/index.js
