# syntax=docker/dockerfile:1

# Front-end (Next.js). Build it from the repository root with
#   docker build --build-arg NEXT_PUBLIC_API_URL=https://example.org/api \
#     -t city-of-software-front-end front-end
# or run the whole stack with docker-compose.yml.
#
# NEXT_PUBLIC_API_URL is inlined into the JavaScript bundle by `next build`, so
# it is a build argument: changing it means rebuilding the image.

ARG NODE_VERSION=22

# --- deps: install the dependencies -------------------------------------------
FROM node:${NODE_VERSION}-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund

# --- build --------------------------------------------------------------------
FROM deps AS build
# The browser calls the API directly, so this must be a URL the browser can
# reach (the same value as PUBLIC_API_URL on the back-end), not a Docker network name.
ARG NEXT_PUBLIC_API_URL=http://localhost:4000/api
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_TELEMETRY_DISABLED=1
COPY . .
# The project has no public/ directory yet; creating it keeps the runtime COPY
# below working now and once one is added. .next/cache is only a build cache
# (about 100 MB), so it stays out of the image.
RUN mkdir -p public && npm run build && rm -rf .next/cache

# --- runtime ------------------------------------------------------------------
FROM node:${NODE_VERSION}-slim AS runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000
WORKDIR /app
# All of node_modules, dev dependencies included: next.config.ts is TypeScript,
# so `next start` needs the `typescript` package to load it (and tries to
# install it at start-up when it is missing).
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/package.json /app/next.config.ts ./
COPY --from=build /app/public ./public
# Owned by `node` because Next writes its runtime cache under .next/cache.
COPY --from=build --chown=node:node /app/.next ./.next

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 3000)).then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]

# Run Next directly (not through `npm start`) so signals reach the server.
CMD ["node", "node_modules/next/dist/bin/next", "start", "-H", "0.0.0.0"]
