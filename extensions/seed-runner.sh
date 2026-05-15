#!/bin/sh
# seed-runner.sh
#
# Called from zerops.yaml initCommands after bootstrap + schema apply.
# Starts a temporary Directus server in the background, waits until it is
# healthy, runs seed.js via the Directus SDK, then cleanly shuts it down.
#
# The real server is started separately by the 'start' command in zerops.yaml.
# Running it here only to satisfy the SDK's HTTP requirement during seeding.
#
# Required env vars (all set by zerops.yaml envVariables / envSecrets):
#   ADMIN_TOKEN   static token for SDK authentication
#   DIRECTUS_URL  optional override (defaults to http://localhost:8055)

set -e

DIRECTUS_URL="${DIRECTUS_URL:-http://localhost:8055}"
MAX_WAIT=120  # seconds before giving up on health check

echo "==> Starting temporary Directus server for seeding…"
node_modules/.bin/directus start &
SERVER_PID=$!

echo "==> Waiting for server to become healthy (max ${MAX_WAIT}s)…"
node -e "
(async () => {
  const deadline = Date.now() + ${MAX_WAIT} * 1000;
  while (Date.now() < deadline) {
    try {
      const r = await fetch('${DIRECTUS_URL}/server/health');
      const d = await r.json();
      if (d.status === 'ok') { console.log('Server is healthy.'); process.exit(0); }
    } catch (_) {}
    await new Promise(r => setTimeout(r, 2000));
  }
  console.error('Timed out waiting for Directus to become healthy.');
  process.exit(1);
})();
"

echo "==> Running seed script…"
DIRECTUS_URL="${DIRECTUS_URL}" DIRECTUS_TOKEN="${ADMIN_TOKEN}" node extensions/seed.js

echo "==> Stopping temporary server (PID ${SERVER_PID})…"
kill "$SERVER_PID" 2>/dev/null || true
wait "$SERVER_PID" 2>/dev/null || true
echo "==> Seed phase complete."
