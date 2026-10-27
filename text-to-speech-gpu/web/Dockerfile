# syntax=docker/dockerfile:1

# The page and the four routes that start and read GPU runs. Nothing here
# compiles: the S3 client and the Gagarin SDK are plain JS, and Next's build is
# a bundler run, so no toolchain reaches the final image.
ARG NODE_IMAGE=node:22-bookworm-slim

# ---------- deps ----------
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# --ignore-scripts: nothing in this tree has an install step worth running, and
# skipping them keeps a compromised transitive dependency from executing during
# a build that has network access.
RUN npm ci --ignore-scripts

# ---------- builder ----------
FROM ${NODE_IMAGE} AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# The build must not reach the bucket or Gagarin, and does not: every route
# that touches either is `export const dynamic = 'force-dynamic'`, so
# `next build` runs none of them. If that were ever dropped, the build would
# fail here, on a machine with no FILES_* and no token, rather than bake one
# request's listing into a static file.
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---------- runtime ----------
FROM ${NODE_IMAGE} AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    TZ=UTC \
    PORT=3000 \
    # A server bound to loopback is invisible from outside the container and
    # fails exactly like one that never started, so it is stated.
    HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1

# `output: 'standalone'` emits a server with only the traced dependencies, so
# these are the whole application. Static assets are not traced and are copied
# beside it; start.mjs is the entrypoint that checks the environment first.
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/start.mjs ./start.mjs

# Every request and every file is in the bucket; this process writes nothing
# to disk, so it needs no volume and no root.
USER node

EXPOSE 3000

# Exec form, so node is PID 1 and gets SIGTERM directly.
CMD ["node", "start.mjs"]
