#!/usr/bin/env bash
# Build one image and start it with no environment. A recipe that needs
# configuration must say so and exit, not hang or crash-loop quietly: on
# gagarin a missing --deps looks exactly like this.
#
#   .ci/missing-env.sh <recipe> <context>
set -euo pipefail
recipe=$1 context=$2
suffix=$(echo "$context" | tr -c 'a-z0-9\n' '-' | sed 's/^-*$/root/')
tag="recipe-${recipe}-${suffix}"
docker build -q -t "$tag" "$recipe/$context" >/dev/null
id=$(docker run -d "$tag")
trap 'docker rm -f "$id" >/dev/null 2>&1' EXIT
for _ in $(seq 90); do
  [ "$(docker inspect -f '{{.State.Running}}' "$id")" = false ] && break
  sleep 1
done
if [ "$(docker inspect -f '{{.State.Running}}' "$id")" = true ]; then
  echo "$recipe/$context: still running after 90s with no environment; it should exit and say what is missing"
  exit 1
fi
code=$(docker inspect -f '{{.State.ExitCode}}' "$id")
if [ "$code" = 0 ]; then
  echo "$recipe/$context: exited 0 with no environment; it should refuse to start"
  exit 1
fi
echo "$recipe/$context: exits $code without its environment:"
docker logs "$id" 2>&1 | tail -3 | sed 's/^/  /'
