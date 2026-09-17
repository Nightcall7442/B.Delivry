# The API (apps/api) as one image, built from the repo root (Railway:
# RAILWAY_DOCKERFILE_PATH=apps/api/Dockerfile). Workspace packages are
# source-only, so the server runs through tsx; migrations apply on start.
FROM node:22-alpine
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate && apk add --no-cache openssl
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile --filter "@bazar/api..."
WORKDIR /app/apps/api
RUN node node_modules/prisma/build/index.js generate
ENV NODE_ENV=production API_HOST=0.0.0.0
EXPOSE 4000
CMD ["sh", "-c", "node node_modules/prisma/build/index.js migrate deploy && API_PORT=${PORT:-4000} pnpm exec tsx src/main.ts"]
