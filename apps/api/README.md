# @bazar/api

Modular monolith REST API (Node.js + TypeScript).

```
src/
├── main.ts            # process entrypoint: load config → bootstrap app → listen
├── app/               # app composition: create server, register middleware/routes/ws, shutdown
├── config/            # typed env config (Zod-validated)
├── common/            # cross-cutting: errors, base types, pagination, tenant context
├── infrastructure/    # technical adapters: prisma client, redis abstractions, logger, telemetry
├── modules/           # DOMAIN MODULES (controller → service → repository)
├── database/          # transactions, unit-of-work helpers
├── jobs/              # background jobs / queues / schedulers
├── events/            # in-process domain event bus (decouples modules)
├── integrations/      # external providers behind interfaces (maps, payments, sms, ...)
├── middleware/        # HTTP middleware (auth, rbac, rate-limit, validation, ...)
├── routes/            # API route registration (/api/v1/*), aggregates module routes
└── websocket/         # realtime gateway, rooms, event handlers
```

Rules: controllers are thin · services own business logic · repositories own persistence ·
modules communicate via services/events, never via each other's repositories.

Framework decision: see `docs/decisions/0005-http-framework.md` (pending).

## Tests

`pnpm --filter @bazar/api test` runs the unit tests (`test/unit`, no database) and the order journey
(`test/integration`): a customer, a stall and a courier take an order from the basket to the door
through `@bazar/api-client`, against a real, migrated Postgres. The journey runs only when
`DATABASE_URL` names a database ending in `_test` or `_e2e`, and skips (saying why) otherwise — it
writes real rows, each run in a tenant of its own.

```sh
createdb bazar_test
export DATABASE_URL=postgresql://bazar:bazar@localhost:5432/bazar_test?schema=public
pnpm --filter @bazar/api exec prisma migrate deploy
pnpm --filter @bazar/api test
```

CI (`.github/workflows/test.yml`) migrates its Postgres service the same way before `pnpm test`.
