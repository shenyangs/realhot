#!/usr/bin/env sh
set -eu

APP_URL="${APP_URL:-http://localhost:3000}"
SYNC_URL="${HOTSPOT_SYNC_URL:-$APP_URL/api/hotspots/sync}"

AUTH_ARGS=""
if [ -n "${HOTSPOT_SYNC_SECRET:-}" ]; then
  AUTH_ARGS="-H Authorization: Bearer ${HOTSPOT_SYNC_SECRET}"
fi

echo "Syncing hotspots via ${SYNC_URL}"

if [ -n "$AUTH_ARGS" ]; then
  curl --fail --show-error --silent \
    -X POST \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${HOTSPOT_SYNC_SECRET}" \
    "${SYNC_URL}"
else
  curl --fail --show-error --silent \
    -X POST \
    -H "Content-Type: application/json" \
    "${SYNC_URL}"
fi

echo
