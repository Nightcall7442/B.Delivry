# API

- Base path: `/api/v1`
- Auth: `Authorization: Bearer <access>`; refresh via `/auth/refresh`
- Headers: `X-Request-Id`, `Accept-Language: uz|ru|en`, `X-Tenant-Id` (optional)
- Response envelope & error format: TODO (see `apps/api/src/common/errors/error-codes.ts`)
- Pagination: cursor-based by default
- Webhooks: `/webhooks/payments/:provider`, `/webhooks/telegram` — signature verified
- OpenAPI spec: `docs/api/openapi.yaml` (TODO, generated from Zod schemas)
