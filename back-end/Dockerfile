# syntax=docker/dockerfile:1

# Back-end API (Express + TypeScript). Build it from the repository root with
#   docker build -t city-of-software-back-end back-end
# or run the whole stack with docker-compose.yml, which supplies the environment
# and the storage volume.

# @google-cloud/documentai needs Node 22 or newer.
ARG NODE_VERSION=22

# --- build: install every dependency and compile TypeScript into dist/ -------
FROM node:${NODE_VERSION}-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

# --- prod-deps: runtime dependencies only (no TypeScript, no tsx) -------------
FROM node:${NODE_VERSION}-slim AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev --no-audit --no-fund

# --- runtime ------------------------------------------------------------------
FROM node:${NODE_VERSION}-slim AS runtime
# DOTENV_CONFIG_QUIET stops dotenv logging "injected env (0) from .env" tips on
# every start: there is no .env in the image, the settings come from the environment.
ENV NODE_ENV=production \
    PORT=4000 \
    EXTRACTION_STORAGE_DIR=/data/storage \
    DOTENV_CONFIG_QUIET=true
WORKDIR /app
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./

# The application code stays owned by root, so the API cannot rewrite itself.
# Downloaded PDFs are written to the one directory owned by the non-root `node`
# user, so a named volume mounted on it is writable too.
RUN mkdir -p "$EXTRACTION_STORAGE_DIR" && chown node:node "$EXTRACTION_STORAGE_DIR"

USER node
EXPOSE 4000

# GET /api/health answers without touching the database, so a slow or
# unreachable MongoDB does not mark the container unhealthy.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 4000) + '/api/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]

CMD ["node", "dist/index.js"]
