#!/usr/bin/env bash
# Which recipes changed what goes into their images between two commits, as a
# JSON array of slugs, for publish.yml to decide which recipes to republish.
#
#   .ci/changed-recipes.sh BEFORE AFTER
#
# Run from the repository root. The recipes are recipes.json's, the list CI
# builds and smoke-tests. A change counts unless it is Markdown or the
# recipe's own example workflow under <recipe>/.github/: neither goes into an
# image.
#
# BEFORE is the last commit publish.yml published in full, not the previous
# push, so a run that failed or was replaced in the queue is made up for.
# Every recipe counts when there is no BEFORE to compare with (a manual run,
# the first run, a commit this clone does not have) or when the publishing
# itself changed (publish.yml or this script).
# .ci/changed-recipes-test.sh holds it to that.
set -euo pipefail
[ $# -eq 2 ] || { echo "usage: $0 BEFORE AFTER" >&2; exit 2; }
before=$1 after=$2

recipes=()
while IFS= read -r slug; do recipes+=("$slug"); done < <(jq -r '.recipes[].slug' recipes.json)

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
  # No grep -q at the end of the pipe: it would stop reading at the first
  # match, and under pipefail the writer's SIGPIPE would turn a match into a
  # miss on a diff long enough to fill the pipe.
  counted=$(grep -E "^$r/" <<<"$changed" | grep -vE '\.md$' | grep -vE "^$r/\.github/" || true)
  [ -z "$counted" ] || hit+=("$r")
done
emit "${hit[@]+"${hit[@]}"}"
