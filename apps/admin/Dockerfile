# The vendor cabinet + dispatcher desk (apps/admin) as one image, the same shape
# as the web image: pnpm-filtered install, standalone Next build, run on $PORT.
FROM node:22-alpine AS build
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile --filter "@bazar/admin..."
ARG NEXT_PUBLIC_API_URL=https://api.bazar-delivery.uz/api/v1
ARG NEXT_PUBLIC_WS_URL=wss://api.bazar-delivery.uz
# Error reports (docs/monitoring.md): with no DSN the desk sends nothing and the build is unchanged.
# On Railway, set the service variable NEXT_PUBLIC_SENTRY_DSN — a variable reaches the build only if
# it is declared here as an ARG. The commit sha names the release the reports belong to; it is read
# only when a DSN is set.
ARG NEXT_PUBLIC_SENTRY_DSN=
ARG NEXT_PUBLIC_SENTRY_ENVIRONMENT=production
ARG RAILWAY_GIT_COMMIT_SHA=
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL NEXT_TELEMETRY_DISABLED=1 \
    NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN NEXT_PUBLIC_SENTRY_ENVIRONMENT=$NEXT_PUBLIC_SENTRY_ENVIRONMENT \
    RAILWAY_GIT_COMMIT_SHA=$RAILWAY_GIT_COMMIT_SHA
RUN pnpm --filter @bazar/admin build

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000
COPY --from=build --chown=node:node /app/apps/admin/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/admin/.next/static ./apps/admin/.next/static
COPY --from=build --chown=node:node /app/apps/admin/public ./apps/admin/public
USER node
EXPOSE 3000
CMD ["node", "apps/admin/server.js"]
