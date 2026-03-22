#!/usr/bin/env sh
set -eu

APP_URL="${APP_URL:-http://localhost:3000}"
RUN_URL="${PRODUCTION_RUN_URL:-$APP_URL/api/production/run}"

echo "Running production queue via ${RUN_URL}"

if [ -n "${PRODUCTION_RUNNER_SECRET:-}" ]; then
  curl --fail --show-error --silent \
    -X POST \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${PRODUCTION_RUNNER_SECRET}" \
    "${RUN_URL}"
else
  curl --fail --show-error --silent \
    -X POST \
    -H "Content-Type: application/json" \
    "${RUN_URL}"
fi

echo
