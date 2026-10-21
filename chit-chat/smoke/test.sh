#!/usr/bin/env bash
# Post one message through nginx and read it back.
set -euo pipefail
cd "$(dirname "$0")/.."
dc() { docker compose -f docker-compose.yml "$@"; }
trap 'dc logs --no-color | tail -30; dc down -v >/dev/null 2>&1' EXIT
dc up -d --build
for _ in $(seq 60); do curl -sf localhost:8080/api/health >/dev/null && break; sleep 1; done
curl -sf localhost:8080/api/health >/dev/null || { echo "the api never answered through nginx"; exit 1; }
curl -sf -X POST localhost:8080/api/posts -H 'X-Callsign: smoke' --data-raw 'smoke test transmission' >/dev/null
curl -sf 'localhost:8080/api/posts?limit=1' | grep -q 'smoke test transmission' || { echo "the post did not come back"; exit 1; }
echo "ok: posted through nginx and read it back"
