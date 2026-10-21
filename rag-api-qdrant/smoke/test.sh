#!/usr/bin/env bash
# Without the token: 401. With it: ingest three passages, ask, get the right one first.
set -euo pipefail
cd "$(dirname "$0")/.."
dc() { docker compose -f compose.yaml -f smoke/compose.yaml "$@"; }
trap 'dc logs --no-color | tail -30; dc down -v >/dev/null 2>&1' EXIT
dc up -d --build --wait vectors api

auth="Authorization: Bearer smoke-token-0123456789abcdef"
code=$(curl -s -o /dev/null -w '%{http_code}' -H 'content-type: application/json' -X POST localhost:8080/ask -d '{"question":"x"}')
[ "$code" = 401 ] || { echo "no token: expected 401, got $code"; exit 1; }

curl -sf -H "$auth" -H 'content-type: application/json' -X POST localhost:8080/ingest \
  -d '{"texts":["Postgres is a relational database.","Qdrant stores vectors and finds the nearest ones.","Paris is the capital of France."]}' >/dev/null
answer=$(curl -sf -H "$auth" -H 'content-type: application/json' -X POST localhost:8080/ask -d '{"question":"Which city is the French capital?","limit":1}')
echo "$answer" | grep -q 'Paris' || { echo "ask returned: $answer"; exit 1; }
echo "ok: 401 without the token; ingest and ask with it ($answer)"
