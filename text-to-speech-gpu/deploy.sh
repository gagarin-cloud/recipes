#!/usr/bin/env bash
#
# Deploy the text-to-speech recipe to Gagarin Cloud: the bucket, the token the
# web starts runs with, the job image, and the web.
#
# Idempotent: run it again to ship a new build. It creates what is missing and
# restates the rest, the web's whole environment included, because a deploy
# replaces the environment and a variable left out is a variable removed.
#
#   ./deploy.sh                      deploy as project "speak"
#   PROJECT=my-voice ./deploy.sh     under a different project name
#   TTS_TAG=v2 ./deploy.sh           build and point the web at tts:v2
#   SKIP_TTS_BUILD=1 ./deploy.sh     the image is already pushed; ship the web only
#   WEB_PUBLIC=0 ./deploy.sh         ship the web but give it no address
#   RUNS_PER_HOUR=10 ./deploy.sh     override the cap .env sets
#   DRY_RUN_DEPLOY=1 ./deploy.sh     print what it would do, change nothing
#
set -euo pipefail

cd "$(dirname "$0")"

PROJECT="${PROJECT:-speak}"
TTS_TAG="${TTS_TAG:-v1}"
WEB_SIZE="${WEB_SIZE:-s}"
ENV_FILE="${ENV_FILE:-.env}"

say()  { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m warn:\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31merror:\033[0m %s\n' "$*" >&2; exit 1; }

run() {
  if [[ -n "${DRY_RUN_DEPLOY:-}" ]]; then
    printf '  would run: %s\n' "$*"
  else
    "$@"
  fi
}

# ---------------------------------------------------------------- preflight

say "Checking prerequisites"
command -v gg >/dev/null 2>&1 || die "gg is not installed: curl -fsSL https://gagarin.cloud/install.sh | sh"
command -v docker >/dev/null 2>&1 || die "docker is not installed; gg needs it to build both images."
docker info >/dev/null 2>&1 || die "the docker daemon is not running. Start Docker and retry."
gg whoami >/dev/null 2>&1 || die "gg has no credentials on this machine. Run 'gg login', approve the link, run 'gg login' again."
say "Authorised as $(gg whoami | awk '/^account/ {print $2}')"

# A push fails after a successful build when docker is not logged in to the
# registry; this is idempotent and cheap.
run gg registry login >/dev/null 2>&1 || warn "gg registry login failed; the pushes may fail. Try it by hand."

[[ -f "$ENV_FILE" ]] || die "$ENV_FILE not found. Run 'cp .env.example .env' (nothing in it is secret)."

# The deploy env is for plain configuration. A credential put here would be
# copied into every revision, and these two would be ignored anyway: the
# platform's injected values outrank a deploy's.
if grep -qE '^[[:space:]]*(GAGARIN_TOKEN|FILES_[A-Z_]+)[[:space:]]*=' "$ENV_FILE"; then
  die "$ENV_FILE sets GAGARIN_TOKEN or a FILES_* variable. Remove them: the bucket's arrive with
       'gg deps add $PROJECT/web files' and the token with 'gg deps add $PROJECT/web gagarin'."
fi

# A row of `gg status`, by name, past the state glyph in front of it.
row() { gg status "$PROJECT" 2>/dev/null | awk -v s="$1" '$1 == s || $2 == s'; }

# ------------------------------------------------------------ the project

if gg projects 2>/dev/null | awk '{print $1}' | grep -qx "$PROJECT"; then
  say "Project '$PROJECT' exists"
else
  say "Creating project '$PROJECT'"
  run gg init "$PROJECT"
fi

# ------------------------------------------------------------ the bucket

# Private, and it stays private: the web streams the audio out of it with its
# own key. Created before anything that reaches it.
if [[ -n "$(row files || true)" ]]; then
  say "Bucket '$PROJECT/files' exists"
else
  say "Creating the bucket '$PROJECT/files'"
  run gg resource add "$PROJECT/files" s3
fi

# ------------------------------------------------------------ the token

# The web starts GPU runs with the SDK, which reads GAGARIN_TOKEN. That is a
# credential, so it lives in an external resource rather than in the deploy env:
# a resource called `gagarin` with the key TOKEN publishes exactly
# GAGARIN_TOKEN to whatever reaches it. It is minted once, written to a file
# only this script can read, and never printed.
#
# What it is: it can deploy and run anything in the account, cannot destroy,
# and expires in 90 days. To renew it, mint one the same way into a file and
# 'gg resource rotate $PROJECT/gagarin --env-file <file>'.
if [[ -n "$(row gagarin || true)" ]]; then
  say "Token '$PROJECT/gagarin' exists"
elif [[ -n "${DRY_RUN_DEPLOY:-}" ]]; then
  printf '  would run: gg creds create --name "%s/web: starts GPU runs" > (a 0600 file)\n' "$PROJECT"
  printf '  would run: gg resource add %s/gagarin external --env-file (that file)\n' "$PROJECT"
else
  say "Minting the token the web starts runs with"
  token_file="$(mktemp -t speak-gagarin.XXXXXX)"
  chmod 600 "$token_file"
  trap 'rm -f "$token_file"' EXIT
  printf 'TOKEN=%s\n' "$(gg creds create --name "$PROJECT/web: starts GPU runs" 2>/dev/null)" > "$token_file"
  grep -q '^TOKEN=.' "$token_file" || die "gg creds create returned nothing; is this credential allowed to mint one?"
  gg resource add "$PROJECT/gagarin" external --env-file "$token_file"
  rm -f "$token_file"
fi

# ------------------------------------------------------------ the job image

# Nothing runs it now: the web starts one run per request. The image is large
# (a CUDA base, the model baked in), so the first build and push take a while.
if [[ -z "${SKIP_TTS_BUILD:-}" ]]; then
  say "Building and pushing $PROJECT/tts:$TTS_TAG (several GB the first time)"
  run gg build "$PROJECT/tts:$TTS_TAG" --context ./tts --push
fi

# ------------------------------------------------------------ the web

# The whole environment, every time. The file holds the plain settings; the
# --env flags win over it, so the web always names the project it is in and
# the image this script just built.
ship_args=(
  ship "$PROJECT/web:3000" --context ./web --size "$WEB_SIZE"
  --env-file "$ENV_FILE"
  --env "GAGARIN_PROJECT=$PROJECT"
  --env "TTS_IMAGE=tts:$TTS_TAG"
)
[[ -n "${RUNS_PER_HOUR:-}" ]] && ship_args+=(--env "RUNS_PER_HOUR=$RUNS_PER_HOUR")
say "Building and shipping the web"
run gg "${ship_args[@]}"

# After the ship rather than with --deps on it, which has been refused when the
# ship creates the service. The web exits at boot without the bucket's
# variables, so a first deploy restarts once, until these land.
say "Letting web reach the bucket and hold the token"
run gg deps add "$PROJECT/web" files gagarin

if [[ "${WEB_PUBLIC:-1}" == "0" ]]; then
  say "WEB_PUBLIC=0: leaving '$PROJECT/web' without an address"
else
  # Anyone with the address can press Speak, and every press is a GPU run;
  # RUNS_PER_HOUR caps them.
  say "Giving '$PROJECT/web' a public address"
  run gg domain add "$PROJECT/web"
fi

[[ -n "${DRY_RUN_DEPLOY:-}" ]] && { say "Dry run complete. Nothing was changed."; exit 0; }

say "Submitted. What the cluster says now:"
gg status "$PROJECT" || warn "could not read status; try 'gg status $PROJECT' in a moment."

cat <<EOT

$(say "Next")

  gg domain ls $PROJECT          the address
  gg logs $PROJECT/web           the web
  gg status $PROJECT             each tts-* row is one request's run

The first Speak waits three to six minutes for a GPU machine; that is the
machine booting, it is not billed, and it is not stuck. A request within ten
minutes of the last one starts at once.
EOT
