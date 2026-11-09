#!/usr/bin/env bash
# Which recipes a push changed what goes into their images, as a JSON array
# of directory names, for publish.yml to decide which recipes to republish.
#
#   .ci/changed-recipes.sh BEFORE AFTER
#
# Run from the repository root. A recipe is a top-level directory with a
# Dockerfile in it or one level down (chit-chat keeps two, in api/ and web/).
# A change counts unless it is Markdown or the recipe's own example workflow
# under <recipe>/.github/: neither goes into an image.
#
# Every recipe counts when there is no BEFORE to compare with (a manual run,
# a branch's first push, a force push past history this clone does not have)
# or when the publishing itself changed (publish.yml or this script).
# .ci/changed-recipes-test.sh holds it to that.
set -euo pipefail
[ $# -eq 2 ] || { echo "usage: $0 BEFORE AFTER" >&2; exit 2; }
before=$1 after=$2

recipes=()
for d in */; do
  d=${d%/}
  if compgen -G "$d/Dockerfile" >/dev/null || compgen -G "$d/*/Dockerfile" >/dev/null; then
    recipes+=("$d")
  fi
done

emit() { if [ $# -eq 0 ]; then echo '[]'; else printf '%s\n' "$@" | jq -Rnc '[inputs]'; fi; }

if [[ -z "$before" || "$before" =~ ^0+$ ]] || ! git cat-file -e "$before^{commit}" 2>/dev/null; then
  emit "${recipes[@]}"
  exit 0
fi

changed=$(git diff --name-only "$before" "$after")
if grep -qxE '\.github/workflows/publish\.yml|\.ci/changed-recipes\.sh' <<<"$changed"; then
  emit "${recipes[@]}"
  exit 0
fi

hit=()
for r in "${recipes[@]}"; do
  if grep -E "^$r/" <<<"$changed" | grep -vE '\.md$' | grep -vqE "^$r/\.github/"; then
    hit+=("$r")
  fi
done
emit "${hit[@]+"${hit[@]}"}"
