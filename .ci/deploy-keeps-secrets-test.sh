#!/usr/bin/env bash
# The deploy scripts that hold credentials put each one in an external and
# never in a service's environment, which anybody reading the project, or a
# recipe snapped from it, can see.
#
#   .ci/deploy-keeps-secrets-test.sh
#
# Each script runs against a fake gg and docker that record every call and the
# contents of every --env-file. Credentials in the fixture .env contain
# SENTINEL, and the test fails if one reaches a ship, a deploy or a run, its
# arguments or its env file, or the script's own output. As controls, every
# credential must reach an external, and a plain setting must reach the ship,
# so a recorder that captured nothing cannot pass.
set -euo pipefail
root=$(cd "$(dirname "$0")/.." && pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

mkdir -p "$tmp/bin"
cat >"$tmp/bin/gg" <<'GG'
#!/usr/bin/env bash
n=$(( $(cat "$FAKE/n" 2>/dev/null || echo 0) + 1 )); echo "$n" >"$FAKE/n"
{ printf 'CALL %s' "$n"; printf ' %s' "$@"; echo; } >>"$FAKE/calls"
prev=
for a in "$@"; do
  if [ "$prev" = --env-file ]; then { echo "ENVFILE $n"; cat "$a"; } >>"$FAKE/calls"; fi
  prev=$a
done
case "$1 ${2:-}" in
  "whoami "*) echo "account tester" ;;
  "domain ls") [ -f "$FAKE/domain" ] && echo "mcp  mcp-test.apps.example.test" ;;
  "domain add") touch "$FAKE/domain" ;;
  "deps ls") echo "db" ;;
  "ship "*) echo "  mcp:42" ;;
esac
exit 0
GG
printf '#!/usr/bin/env bash\nexit 0\n' >"$tmp/bin/docker"
chmod +x "$tmp/bin/gg" "$tmp/bin/docker"

status=0
check() {
  local recipe=$1 plain=$2 calls=$3 fake=$tmp/$1 out
  mkdir -p "$fake"
  if ! out=$(FAKE=$fake PATH="$tmp/bin:$PATH" ENV_FILE=$tmp/$recipe.env "$root/$recipe/deploy.sh" 2>&1); then
    echo "FAIL $recipe: deploy.sh failed"; echo "$out" | tail -5; status=1; return
  fi
  # Each call with its env files, one block per call, tagged by its verb.
  awk '/^CALL /{verb=$3" "$4} {print verb "\t" $0}' "$fake/calls" >"$fake/tagged"
  local runs leaked
  runs=$(grep -E '^(ship|deploy|run) ' "$fake/tagged" || true)
  leaked=$(grep -c SENTINEL <<<"$runs" || true)
  if [ "$leaked" != 0 ]; then echo "FAIL $recipe: a credential reached a ship, deploy or run"; status=1; fi
  if grep -q SENTINEL <<<"$out"; then echo "FAIL $recipe: deploy.sh printed a credential"; status=1; fi
  if ! grep -q "$plain" <<<"$runs"; then echo "FAIL $recipe: the plain setting $plain never reached the ship (control)"; status=1; fi
  # The paths the test means to cover, so a script that stopped early passes nothing.
  for verb in $calls; do
    grep -q "^$verb " "$fake/tagged" || { echo "FAIL $recipe: no gg $verb was run (control)"; status=1; }
  done
  local externals
  externals=$(grep -E '^resource (add|rotate)' "$fake/tagged" || true)
  while IFS= read -r v; do
    grep -qE "=.*$v\$" <<<"$externals" || { echo "FAIL $recipe: $v never reached an external (control)"; status=1; }
  done < <(grep -oE 'SENTINEL[A-Za-z0-9_-]*' "$tmp/$recipe.env" | sort -u)
  [ "$status" != 0 ] || echo "  ok $recipe: credentials only in externals"
}

cat >"$tmp/read-and-trade-bot.env" <<'ENV'
OPENAI_API_KEY="SENTINEL-openai"
TELEGRAM_BOT_TOKEN="SENTINEL-bot-token"
TELEGRAM_CHANNEL_ID="@SENTINELchannel"
FINNHUB_API_KEY='SENTINEL-finnhub'
MARKETAUX_API_KEY=SENTINEL-marketaux
SEC_USER_AGENT="SENTINEL-sec"
DB_URL="postgres://local:local@localhost:5433/local"
TRIAGE_MODEL="gpt-test"
ENV
# Two ships, the worker's and the website's.
check read-and-trade-bot TRIAGE_MODEL=gpt-test "ship"

cat >"$tmp/telegram-mcp.env" <<'ENV'
TELEGRAM_API_ID=SENTINEL-api-id
TELEGRAM_API_HASH="SENTINEL-api-hash"
ENCRYPTION_KEY=SENTINEL-0123456789abcdef0123456789abcdef
LOG_LEVEL=debug
ENV
# A first deploy: the ship, then the deploy that tells it its own address.
check telegram-mcp LOG_LEVEL=debug "ship deploy"

exit "$status"
