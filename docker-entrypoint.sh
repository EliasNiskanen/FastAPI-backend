#!/bin/sh
set -e

# Apply database migrations before starting, unless disabled.
# With several instances you may prefer to run migrations as a separate job
# (Cloud Run Job / ECS one-off task) and set RUN_MIGRATIONS=false here.
if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
    alembic upgrade head
fi

exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}" --proxy-headers --forwarded-allow-ips="*"
