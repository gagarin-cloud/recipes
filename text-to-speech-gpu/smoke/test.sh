#!/usr/bin/env bash
# Bring up the bucket stand-in and the web. Check the listing starts empty; put
# a request and a short WAV into the bucket by hand and check the page lists it
# as done and streams it; then save a request through the web and speak it with
# the real job image, on the CPU, and check the audio lands. The model run takes
# under a minute on a CI runner; SMOKE_SKIP_MODEL=1 leaves it out.
set -euo pipefail
cd "$(dirname "$0")/.."
dc() { docker compose -f docker-compose.yml ${SMOKE_COMPOSE_EXTRA:-} "$@"; }
trap 'dc logs --no-color | tail -40; dc down -v >/dev/null 2>&1' EXIT

web=http://localhost:3000
bucket=http://localhost:9090/files
fail() { echo "smoke: $*"; exit 1; }
json() { python3 -c "import json,sys; d=json.load(sys.stdin); print($1)"; }

dc up -d --build files web
for _ in $(seq 90); do curl -sf "$web/api/speak" >/dev/null && break; sleep 1; done
curl -sf "$web/api/health" | grep -q '"status":"ok"' || fail "/api/health did not answer"
[ "$(curl -sf "$web/api/speak" | json 'len(d["generations"])')" = 0 ] || fail "the listing did not start empty"

# A request and its audio, put in by hand: what a finished run leaves behind.
id=aaaaaaaa-0001
printf '{"id":"%s","text":"A hand-made request.","voice":"af_heart","created_at":"2026-10-27T00:00:00Z","job":"tts-%s","revision":1}' "$id" "$id" |
  curl -sf -X PUT -H 'content-type: application/json' --data-binary @- "$bucket/$id.json" >/dev/null
python3 -c "
import struct, sys, wave
w = wave.open(sys.stdout.buffer, 'wb'); w.setnchannels(1); w.setsampwidth(2); w.setframerate(24000)
w.writeframes(b''.join(struct.pack('<h', (i % 50) * 400 - 10000) for i in range(240)))
" | curl -sf -X PUT -H 'content-type: audio/wav' --data-binary @- "$bucket/$id.wav" >/dev/null

[ "$(curl -sf "$web/api/speak" | json 'd["generations"][0]["status"]')" = done ] || fail "$id is not listed as done"
curl -sf "$web/api/audio/$id" | head -c 4 | grep -q RIFF || fail "/api/audio/$id did not stream a WAV"
[ "$(curl -s -o /dev/null -w '%{http_code}' -H 'Range: bytes=0-15' "$web/api/audio/$id")" = 206 ] || fail "a range request was not answered 206"
[ "$(curl -s -o /dev/null -w '%{http_code}' "$web/api/audio/zzzzzzzz-0000")" = 404 ] || fail "missing audio was not a 404"
echo "smoke: the listing and the audio route work"

[ -n "${SMOKE_SKIP_MODEL:-}" ] && { echo "ok (model run skipped)"; exit 0; }

# With no token the web saves the request and names the command that speaks it.
new=$(curl -sf -X POST "$web/api/speak" -H 'content-type: application/json' \
  -d '{"text":"The smoke test, spoken on a CPU.","voice":"bf_emma"}' | json 'd["id"]')
dc build tts
dc run --rm -e TEXT_KEY="$new" -e VOICE=bf_emma tts
[ "$(curl -sf "$web/api/speak" | json "[g for g in d['generations'] if g['id'] == '$new'][0]['status']")" = done ] ||
  fail "$new was spoken but is not listed as done"
bytes=$(curl -sf "$web/api/audio/$new" | wc -c)
[ "$bytes" -gt 48000 ] || fail "$new.wav is only $bytes bytes; expected at least a second of speech"
echo "ok: the job spoke a request on the CPU ($bytes bytes) and the web serves it"
