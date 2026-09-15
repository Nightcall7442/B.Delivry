# syntax=docker/dockerfile:1.7
# Multi-stage build for @bazar/api (pnpm monorepo)

ARG NODE_VERSION=22
FROM node:${NODE_VERSION}-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate
WORKDIR /app

# ---------- deps: install workspace dependencies
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY apps/api/package.json apps/api/
COPY packages/*/package.json packages/
# TODO: use `pnpm fetch` + `pnpm install --offline` for better layer caching
RUN pnpm install --frozen-lockfile

# ---------- development: hot reload via tsx
FROM deps AS development
COPY . .
RUN pnpm --filter @bazar/api db:generate
EXPOSE 4000
CMD ["pnpm", "--filter", "@bazar/api", "dev"]

# ---------- build
FROM deps AS build
COPY . .
RUN pnpm --filter @bazar/api db:generate
RUN pnpm --filter @bazar/api... build
RUN pnpm --filter @bazar/api deploy --prod /pruned

# ---------- production
FROM node:${NODE_VERSION}-alpine AS production
ENV NODE_ENV=production
WORKDIR /app
RUN addgroup -S bazar && adduser -S bazar -G bazar
COPY --from=build --chown=bazar:bazar /pruned ./
USER bazar
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://localhost:4000/health || exit 1
CMD ["node", "dist/main.js"]
