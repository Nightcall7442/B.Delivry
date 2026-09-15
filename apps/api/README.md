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
