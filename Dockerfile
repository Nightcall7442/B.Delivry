# The public web app (apps/web) as one image: install only what @bazar/web needs,
# build the standalone server, run it on $PORT. LANDING_ONLY=1 makes the domain
# root the landing until the storefront launches.
FROM node:22-alpine AS build
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile --filter "@bazar/web..."
ARG NEXT_PUBLIC_API_URL=https://api.bazar-delivery.uz/api/v1
ARG NEXT_PUBLIC_WS_URL=wss://api.bazar-delivery.uz
ARG LANDING_ONLY=1
# Error reports (docs/monitoring.md), all optional: with no DSN the site sends nothing; with no auth
# token (below) the build makes no source maps. SENTRY_ORG/PROJECT/RELEASE matter only with the token.
ARG NEXT_PUBLIC_SENTRY_DSN=
ARG NEXT_PUBLIC_SENTRY_ENVIRONMENT=production
ARG SENTRY_ORG=
ARG SENTRY_PROJECT=
ARG SENTRY_RELEASE=
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL LANDING_ONLY=$LANDING_ONLY NEXT_TELEMETRY_DISABLED=1 \
    NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN NEXT_PUBLIC_SENTRY_ENVIRONMENT=$NEXT_PUBLIC_SENTRY_ENVIRONMENT \
    SENTRY_ORG=$SENTRY_ORG SENTRY_PROJECT=$SENTRY_PROJECT SENTRY_RELEASE=$SENTRY_RELEASE
# The token uploads source maps and is a build *secret* (--secret id=sentry_auth_token,...), never an
# ARG: an ARG stays readable in the image's history. Without it the file is absent and the token empty.
RUN --mount=type=secret,id=sentry_auth_token \
    SENTRY_AUTH_TOKEN="$(cat /run/secrets/sentry_auth_token 2>/dev/null || true)" \
    pnpm --filter @bazar/web build

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /app/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
