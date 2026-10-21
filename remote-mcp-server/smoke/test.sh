#!/usr/bin/env bash
# Without the token: 401. With it: initialize, list the tool, call it.
set -euo pipefail
cd "$(dirname "$0")/.."
dc() { docker compose -f compose.yaml -f smoke/compose.yaml "$@"; }
trap 'dc logs --no-color | tail -30; dc down -v >/dev/null 2>&1' EXIT
dc up -d --build --wait mcp

url=http://localhost:8080/mcp
auth="Authorization: Bearer smoke-token-0123456789abcdef0123456789abcdef"
h=(-H 'content-type: application/json' -H 'accept: application/json, text/event-stream')

code=$(curl -s -o /dev/null -w '%{http_code}' "${h[@]}" -X POST "$url" -d '{}')
[ "$code" = 401 ] || { echo "no token: expected 401, got $code"; exit 1; }

curl -sf "${h[@]}" -H "$auth" -X POST "$url" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}' \
  | grep -q '"serverInfo"' || { echo "initialize failed"; exit 1; }
curl -sf "${h[@]}" -H "$auth" -X POST "$url" -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' \
  | grep -q '"time_in"' || { echo "tools/list does not list time_in"; exit 1; }
curl -sf "${h[@]}" -H "$auth" -X POST "$url" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"time_in","arguments":{"zone":"Asia/Tokyo"}}}' \
  | grep -q 'Japan Standard Time\|GMT+9' || { echo "time_in did not answer"; exit 1; }
echo "ok: 401 without the token; initialize, tools/list and tools/call with it"
