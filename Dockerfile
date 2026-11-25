# HoReCa Marketplace — ONE image, several entry points (D2-A4, README → CI/CD):
#
#   web      node web/server.js       (default CMD) Next.js standalone server on :3000
#   worker   node dist/worker.mjs     pg-boss worker (jobs, e-mail, later PDFs via Chromium)
#   migrate  node dist/migrate.mjs    one-shot: Drizzle migrations + pg-boss schema/queues/grants
#   (mock-services — decision 012 §8 — becomes the fourth entry, dist/mock-services.mjs, in D6-A3)
#
# Built once per commit and promoted unchanged from staging to production, so the build needs NO
# runtime configuration: SKIP_ENV_VALIDATION=1 in the build stage, and there are no NEXT_PUBLIC_*
# variables (CLAUDE.md rule 14). All configuration comes from the container environment at start.
#
# Runtime layout:
#   /app/web           Next.js standalone output (+ .next/static, public) with its own traced node_modules
#   /app/node_modules  full PRODUCTION dependencies for the bundled worker/migrate entries
#   /app/dist          worker.mjs, migrate.mjs (esbuild, scripts/build-entries.mjs)
#   /app/migrations    SQL migrations (MIGRATIONS_DIR)
#   /data/media        media volume mount point (MEDIA_DIR), owned by the non-root user
#   /ms-playwright     Chromium headless shell for the worker (PLAYWRIGHT_BROWSERS_PATH)

# Node 26.13.1 (security release, 10.11.2026) on Debian trixie slim — same Debian as our Postgres image.
# Pinned by digest, so a re-pushed tag cannot change what we build on.
ARG NODE_IMAGE=node:26.13.1-trixie-slim@sha256:abe7e5a82b61a8ef67b315b85497c9e65173387ccf2f4a029248184b8e020be5

# ── base: Node + pnpm (the version in package.json "packageManager", through corepack) ─────────
FROM ${NODE_IMAGE} AS base
ENV NEXT_TELEMETRY_DISABLED=1 \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    HUSKY=0
# Node 25+ no longer bundles corepack, so it is installed (pinned) from npm.
RUN npm install -g corepack@0.36.0 && corepack enable pnpm
WORKDIR /app

# ── deps: all dependencies (build tools included) ────────────────────────────────────────────────
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --store-dir /pnpm/store

# ── prod-deps: production dependencies only, for the worker / migrate entries ────────────────────
# --ignore-scripts: the root "prepare" script runs husky, which is a dev dependency. No production
# dependency needs an install script (sharp and Playwright ship prebuilt binaries / download nothing).
FROM base AS prod-deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod --ignore-scripts --store-dir /pnpm/store

# ── build: next build (standalone) + bundled entries ─────────────────────────────────────────────
FROM deps AS build
COPY . .
ENV SKIP_ENV_VALIDATION=1
RUN pnpm build \
 && pnpm build:entries \
 && mkdir -p public

# ── runtime ──────────────────────────────────────────────────────────────────────────────────────
FROM ${NODE_IMAGE} AS runtime
ARG PLAYWRIGHT_VERSION=1.65.0
# "0" skips the Chromium download (local builds on a network that blocks storage.googleapis.com).
# Such an image cannot render PDFs. CI and the release image always build with the default "1".
ARG INSTALL_CHROMIUM=1
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    MIGRATIONS_DIR=/app/migrations \
    MEDIA_DIR=/data/media \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    PLAYWRIGHT_VERSION=${PLAYWRIGHT_VERSION}
WORKDIR /app

# Chromium for PDF rendering (worker only, but one image): Playwright's own Debian packages
# (--with-deps) + the headless shell only (--only-shell; headless PDF rendering never uses the full
# browser, ~150 MB smaller). Fonts with Latin Extended-A glyphs, so č ć š ž đ render in PDFs.
# Done BEFORE copying node_modules, so this large layer stays cached when dependencies change;
# the version check below keeps it in step with package.json.
RUN apt-get update \
 && apt-get install -y --no-install-recommends fonts-dejavu-core fonts-liberation \
 && if [ "${INSTALL_CHROMIUM}" = "1" ]; then \
      npx -y "playwright@${PLAYWRIGHT_VERSION}" install --with-deps --only-shell chromium; \
    else \
      echo "INSTALL_CHROMIUM=${INSTALL_CHROMIUM}: skipping Chromium (this image cannot render PDFs)"; \
    fi \
 && rm -rf /var/lib/apt/lists/* /root/.npm /tmp/*

COPY --from=prod-deps /app/node_modules ./node_modules
RUN node -e "const v = require('/app/node_modules/playwright/package.json').version; \
  if (v !== process.env.PLAYWRIGHT_VERSION) { \
    console.error('playwright ' + v + ' in package.json, but the image installed Chromium for ' + process.env.PLAYWRIGHT_VERSION + ': update PLAYWRIGHT_VERSION in the Dockerfile'); \
    process.exit(1); }"

COPY --from=build /app/.next/standalone ./web
COPY --from=build /app/.next/static ./web/.next/static
COPY --from=build /app/public ./web/public
COPY --from=build /app/dist ./dist
COPY --from=build /app/src/server/db/migrations ./migrations

# Application files stay root-owned (read-only for the app). Only the media volume and Next's cache
# folder are writable. A new named volume mounted at /data/media inherits this ownership.
RUN mkdir -p /data/media web/.next/cache \
 && chown node:node /data/media web/.next/cache

# The official image's unprivileged user (uid/gid 1000).
USER node
EXPOSE 3000
CMD ["node", "web/server.js"]
