#!/usr/bin/env bash
# The bot stores a message and answers it; the digest job then reports it.
set -euo pipefail
cd "$(dirname "$0")/.."
dc() { docker compose -f compose.yaml -f smoke/compose.yaml "$@"; }
trap 'dc logs --no-color | tail -50; dc down -v >/dev/null 2>&1' EXIT

dc up -d --build --wait db telegram bot
for _ in $(seq 30); do
  n=$(dc exec -T telegram wget -qO- http://localhost:8081/sent | grep -o '"chat_id":42' | wc -l)
  [ "$n" -ge 1 ] && break
  sleep 1
done
[ "$n" -ge 1 ] || { echo "the bot never answered"; exit 1; }

dc --profile job run --rm digest
dc exec -T telegram wget -qO- http://localhost:8081/sent | grep -q 'smoke: 1' || { echo "the digest did not report the message"; exit 1; }
echo "ok: the bot stored and answered a message, and the digest reported it"
