#!/usr/bin/env bash
# Hold .ci/deploy-example.sh to failing. Each case breaks the real example in
# one way and expects the check to refuse it; a case whose edit no longer
# matches the example fails too, so the test cannot quietly stop testing.
#
#   .ci/deploy-example-test.sh <workflow>
set -euo pipefail
[ $# = 1 ] || { echo "usage: $0 <workflow>" >&2; exit 2; }
example=$1
check=$(dirname "$0")/deploy-example.sh
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

status=0
expect() {
  local want=$1 name=$2 from=$3 to=$4 out=$tmp/$2.yml
  FROM=$from TO=$to perl -pe 's/\Q$ENV{FROM}\E/$ENV{TO}/' "$example" >"$out"
  if cmp -s "$example" "$out"; then
    echo "FAIL $name: '$from' is not in $example any more"
    status=1
    return
  fi
  if "$check" "$out" >/dev/null; then got=pass; else got=refuse; fi
  if [ "$got" = "$want" ]; then echo "  ok $name: $got"; else echo "FAIL $name: wanted $want, got $got"; status=1; fi
}

"$check" "$example" >/dev/null || { echo "FAIL the example itself is refused"; status=1; }

expect refuse gg-login          'run: gg registry login' 'run: gg login && gg registry login'
expect refuse echo-token        'run: gg status "$PROJECT"' 'run: echo "$GAGARIN_TOKEN"; gg status "$PROJECT"'
expect refuse echo-secret       'run: gg status "$PROJECT"' 'run: echo "${{ secrets.GAGARIN_TOKEN }}"; gg status "$PROJECT"'
expect refuse all-secrets       'run: gg status "$PROJECT"' 'run: echo "${{ toJSON(secrets) }}"; gg status "$PROJECT"'
expect refuse token-from-vars   'GAGARIN_TOKEN: ${{ secrets.GAGARIN_TOKEN }}' 'GAGARIN_TOKEN: ${{ vars.GAGARIN_TOKEN }}'
expect refuse untagged-build    '"$PROJECT/web:${{ github.sha }}" --context' '"$PROJECT/web" --context'
expect refuse chained-build     '--context ./web --push' '--context ./web --push && gg build "$PROJECT/web:latest" --context ./web'
expect refuse sha-not-the-tag   '"$PROJECT/web:${{ github.sha }}" --context ./web --push' '"$PROJECT/web:latest" --context ./web --push --file Dockerfile.${{ github.sha }}'
expect refuse deploy-latest     '"web:${{ github.sha }}"' '"web:latest"'
expect pass   quoted-env-line   'GAGARIN_TOKEN: ${{ secrets.GAGARIN_TOKEN }}' 'GAGARIN_TOKEN: "${{ secrets.GAGARIN_TOKEN }}"'

# A workflow that runs no gg is somebody else's business.
printf 'on: push\njobs:\n  t:\n    runs-on: ubuntu-latest\n    steps:\n      - run: npm test\n' >"$tmp/no-gg.yml"
if "$check" "$tmp/no-gg.yml" >/dev/null; then echo "  ok no-gg: pass"; else echo "FAIL no-gg: refused"; status=1; fi

exit "$status"
