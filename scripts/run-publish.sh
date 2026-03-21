#!/usr/bin/env sh
set -eu

APP_URL="${APP_URL:-http://localhost:3000}"
RUN_URL="${PUBLISH_RUN_URL:-$APP_URL/api/publish/run}"

echo "Running publish queue via ${RUN_URL}"

if [ -n "${PUBLISH_RUNNER_SECRET:-}" ]; then
  curl --fail --show-error --silent \
    -X POST \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${PUBLISH_RUNNER_SECRET}" \
    "${RUN_URL}"
else
  curl --fail --show-error --silent \
    -X POST \
    -H "Content-Type: application/json" \
    "${RUN_URL}"
fi

echo
