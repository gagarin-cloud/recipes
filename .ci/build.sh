#!/usr/bin/env bash
# Build one image, for images that run without configuration (a static site).
#   .ci/build.sh <recipe> <context>
set -euo pipefail
docker build -q "$1/$2" >/dev/null
echo "$1/$2: builds"
