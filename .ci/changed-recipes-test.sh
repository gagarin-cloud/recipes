#!/usr/bin/env bash
# Hold .ci/changed-recipes.sh to what publish.yml relies on: a recipe is
# republished when what goes into its images changed, and only then, and
# every recipe is when there is nothing to compare with.
#
#   .ci/changed-recipes-test.sh
set -euo pipefail
check=$(cd "$(dirname "$0")" && pwd)/changed-recipes.sh
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
cd "$tmp"
git init -q -b main .
git config user.email ci@example.test
git config user.name ci
# No background gc after the wide commit below, racing the cleanup.
git config gc.auto 0
git config maintenance.auto false

# Two recipes in recipes.json, a directory that is no recipe at all, and one
# that has a Dockerfile and is still not a recipe, because recipes.json does
# not list it.
mkdir -p one/.github/workflows two/web .github/workflows .ci notes stray
echo 'FROM scratch' >one/Dockerfile
echo 'FROM scratch' >two/web/Dockerfile
echo 'FROM scratch' >stray/Dockerfile
echo '{"recipes":[{"slug":"one"},{"slug":"two"}]}' >recipes.json
for f in one/app.js one/README.md one/.github/workflows/deploy.yml two/web/app.js \
         two/README.md .github/workflows/publish.yml .ci/changed-recipes.sh notes/x.txt README.md stray/app.js; do
  echo 0 >"$f"
done
git add -A && git commit -qm base
base=$(git rev-parse HEAD)

status=0
expect() {
  local name=$1 want=$2 file=$3
  git checkout -q "$base"
  echo "$name" >>"$file"
  git commit -qam "$name"
  local got
  got=$("$check" "$base" HEAD)
  if [ "$got" = "$want" ]; then echo "  ok $name: $got"; else echo "FAIL $name: wanted $want, got $got"; status=1; fi
}

expect code-in-a-recipe         '["one"]'        one/app.js
expect code-a-level-down        '["two"]'        two/web/app.js
expect a-recipes-readme         '[]'             one/README.md
expect a-recipes-example-ci     '[]'             one/.github/workflows/deploy.yml
expect the-root-readme          '[]'             README.md
expect no-recipe-dir            '[]'             notes/x.txt
expect not-in-recipes-json      '[]'             stray/app.js
expect the-publish-workflow     '["one","two"]'  .github/workflows/publish.yml
expect this-detector            '["one","two"]'  .ci/changed-recipes.sh

# A change wide enough to fill a pipe, so a reader that stops at its first
# match would leave its writer to die of SIGPIPE.
git checkout -q "$base"
mkdir -p one/many
for i in $(seq 1 3000); do echo "$i" >"one/many/file-with-a-long-enough-name-$i.js"; done
git add -A && git commit -qm many
got=$("$check" "$base" HEAD)
if [ "$got" = '["one"]' ]; then echo "  ok a-wide-change: $got"; else echo "FAIL a-wide-change: got $got"; status=1; fi

for before in '' 0000000000000000000000000000000000000000 1234567890abcdef1234567890abcdef12345678; do
  got=$("$check" "$before" HEAD)
  if [ "$got" = '["one","two"]' ]; then echo "  ok no-usable-before '$before': $got"; else echo "FAIL no-usable-before '$before': got $got"; status=1; fi
done

exit "$status"
