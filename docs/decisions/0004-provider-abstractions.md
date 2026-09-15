# ADR-0004: Provider abstractions

**Status:** accepted · **Date:** 2026-09-07

Business logic depends only on interfaces: `MapProvider`, `PaymentProvider`, `NotificationProvider`, `StorageProvider`.
Contracts live in `packages/*`; adapters in `apps/api/src/integrations/*`; selection via config.
Enables Google/Yandex/2GIS/OSM, Payme/Click/Uzum, Eskiz/Playmobile, S3/MinIO without touching domain code.
