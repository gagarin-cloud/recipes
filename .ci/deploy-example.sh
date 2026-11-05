#!/usr/bin/env bash
# Check a recipe's deploy workflow against the rules a pipeline holding a
# Gagarin credential must keep. People copy these files as they are, so a
# mistake here becomes the same mistake in every fork.
#
#   .ci/deploy-example.sh <workflow>...
#
# - The pipeline never runs gg login: it has a credential of its own.
# - GAGARIN_TOKEN comes from secrets.GAGARIN_TOKEN, in an env line.
# - No other line names the token or any secret. gg reads the token from the
#   environment, so a line that names it is a line that can print it.
# - Every image gg builds or deploys is tagged with the commit.
#
# A workflow that runs no gg is not a deploy and is skipped.
# .ci/deploy-example-test.sh holds the rules to failing.
set -euo pipefail
[ $# -gt 0 ] || { echo "usage: $0 <workflow>..." >&2; exit 2; }

ENV_LINE='^[0-9]+:[[:space:]]*GAGARIN_TOKEN: "?\$\{\{ secrets\.GAGARIN_TOKEN \}\}"?[[:space:]]*$'
SHA='\$\{\{ github\.sha \}\}'
# The image ref ends in the commit: gg build "P/IMAGE:<sha>", and the second
# word of gg deploy "P/SVC:PORT" "IMAGE:<sha>".
TAGGED_BUILD="^gg build +\"?[^ \"]+:${SHA}\"?( |$)"
TAGGED_DEPLOY="^gg deploy +\"?[^ \"]+\"? +\"?[^ \"]+:${SHA}\"?( |$)"

status=0
fail() { echo "$1: $2"; bad=1; status=1; }

for f in "$@"; do
  bad=0
  # Comments say what the pipeline does not do; only the rest of the file runs.
  code=$(grep -nv '^[[:space:]]*#' "$f" || true)

  if ! grep -qE '(^|[^[:alnum:]_-])gg ' <<<"$code"; then
    echo "$f: runs no gg, skipped"
    continue
  fi

  if grep -E '(^|[^[:alnum:]_-])gg login' <<<"$code"; then
    fail "$f" "runs gg login; a pipeline uses a credential minted for it"
  fi

  if ! grep -qE "$ENV_LINE" <<<"$code"; then
    fail "$f" "does not take GAGARIN_TOKEN from secrets.GAGARIN_TOKEN"
  fi

  if grep -E 'GAGARIN_TOKEN|secrets' <<<"$code" | grep -vE "$ENV_LINE"; then
    fail "$f" "names the token or a secret outside the env line; gg reads it from the environment, nothing else should touch it"
  fi

  # Each command on its own, so an untagged one chained after a tagged one on
  # the same line is still caught.
  cmds=$(grep -oE 'gg (build|deploy) [^;&|]*' <<<"$code" || true)
  if grep -E '^gg build' <<<"$cmds" | grep -vE "$TAGGED_BUILD"; then
    fail "$f" "builds an image not tagged with \${{ github.sha }}"
  fi
  if grep -E '^gg deploy' <<<"$cmds" | grep -vE "$TAGGED_DEPLOY"; then
    fail "$f" "deploys an image not tagged with \${{ github.sha }}"
  fi

  [ "$bad" = 1 ] || echo "$f: keeps the credential to itself and tags with the commit"
done
exit "$status"
