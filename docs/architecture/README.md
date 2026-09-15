# Architecture

Bazar Delivery is a **modular monolith** (single deployable API) with strict module boundaries,
designed to be split into services later without rewriting domain logic.

Layers (inside each module): `controller → service → repository → Prisma`.
Cross-module communication: **service interfaces** (sync) or **domain events** (async). Never repository-to-repository.

Client flow: `Frontend → @bazar/api-client → REST API → services → repositories → PostgreSQL`.

Provider abstractions: `MapProvider`, `PaymentProvider`, `NotificationProvider` (push/sms/telegram/email), `StorageProvider`.

See: [system.md](system.md), [modules.md](modules.md).
