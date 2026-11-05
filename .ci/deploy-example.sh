#!/usr/bin/env bash
# Check a recipe's deploy workflow against the rules a pipeline holding a
# Gagarin credential must keep. People copy these files as they are, so a
# mistake here becomes the same mistake in every fork.
#
#   .ci/deploy-example.sh <workflow>...
#
# - The pipeline never runs gg login: it has a credential of its own.
# - GAGARIN_TOKEN comes from the repository's secrets and nowhere else.
# - Nothing else touches the token. gg reads it from the environment, so a line
#   that names it is a line that can print it.
# - Every gg build is tagged with the commit.
set -euo pipefail
[ $# -gt 0 ] || { echo "usage: $0 <workflow>..." >&2; exit 2; }

status=0
fail() { echo "$1: $2"; bad=1; status=1; }

for f in "$@"; do
  bad=0
  # Comments say what the pipeline does not do; only the rest of the file runs.
  code=$(grep -nv '^[[:space:]]*#' "$f" || true)

  if grep -E '(^|[^[:alnum:]_-])gg login' <<<"$code"; then
    fail "$f" "runs gg login; a pipeline uses a credential minted for it"
  fi

  if ! grep -qE '^[0-9]+:[[:space:]]*GAGARIN_TOKEN: \$\{\{ secrets\.GAGARIN_TOKEN \}\}[[:space:]]*$' <<<"$code"; then
    fail "$f" "does not take GAGARIN_TOKEN from secrets.GAGARIN_TOKEN"
  fi

  if grep -E 'GAGARIN_TOKEN' <<<"$code" |
     grep -vE '^[0-9]+:[[:space:]]*GAGARIN_TOKEN: \$\{\{ secrets\.GAGARIN_TOKEN \}\}[[:space:]]*$'; then
    fail "$f" "names GAGARIN_TOKEN outside its env line; gg reads it from the environment, nothing else should touch it"
  fi

  # Each build on its own, so an untagged one chained after a tagged one on the
  # same line is still caught.
  if grep -oE 'gg build[^;&|]*' <<<"$code" | grep -vF '${{ github.sha }}'; then
    fail "$f" "builds without tagging the image with \${{ github.sha }}"
  fi

  [ "$bad" = 1 ] || echo "$f: keeps the credential to itself and tags with the commit"
done
exit "$status"
