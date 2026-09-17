# The public web app (apps/web) as one image: install only what @bazar/web needs,
# build the standalone server, run it on $PORT. LANDING_ONLY=1 makes the domain
# root the landing until the storefront launches.
FROM node:22-alpine AS build
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile --filter "@bazar/web..."
ARG NEXT_PUBLIC_API_URL=https://api.bazar-delivery.uz/api/v1
ARG LANDING_ONLY=1
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL LANDING_ONLY=$LANDING_ONLY NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @bazar/web build

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/public ./apps/web/public
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
