# The API (apps/api) as one image, built from the repo root (Railway:
# RAILWAY_DOCKERFILE_PATH=apps/api/Dockerfile). Workspace packages are
# source-only, so the server runs through tsx. Runs as the unprivileged
# `node` user; `.storage` (local uploads) and `.tessdata` (OCR models) are
# the only writable dirs. Migrations apply on start — one instance, so no
# race; move `migrate deploy` to a release step before scaling out.
FROM node:22-alpine
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate && apk add --no-cache openssl
WORKDIR /app
COPY --chown=node:node . .
USER node
RUN pnpm install --frozen-lockfile --filter "@bazar/api..."
WORKDIR /app/apps/api
RUN node node_modules/prisma/build/index.js generate && mkdir -p .storage .tessdata
ENV NODE_ENV=production API_HOST=0.0.0.0
EXPOSE 4000
# SEED_ON_BOOT=1 runs the (idempotent) reference seed before the server: set it for one deploy, then unset.
CMD ["sh", "-c", "node node_modules/prisma/build/index.js migrate deploy && if [ \"$SEED_ON_BOOT\" = 1 ]; then pnpm exec tsx prisma/seed.ts; fi && API_PORT=${PORT:-4000} pnpm exec tsx src/main.ts"]
