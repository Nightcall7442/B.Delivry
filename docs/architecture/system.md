# System Overview

## Actors

Customer · Courier · Vendor/Store · Operator · Admin · Super Admin (future: corporate clients, restaurants, dark stores, logistics partners).

## Runtime components

- `apps/api` — REST + WebSocket, background workers (same codebase, separate process possible)
- `apps/web`, `apps/admin` — Next.js
- `apps/customer`, `apps/courier` — Expo
- PostgreSQL (source of truth), Redis (cache, sessions, rate limit, queues, pub/sub)
- Observability: OTel → Jaeger / Prometheus / Loki / Grafana

## Order lifecycle

State machine defined in `@bazar/constants` (`ORDER_STATUS`) and enforced in `modules/orders/domain/order-state-machine.ts`.
Every transition is persisted to `OrderStatusHistory` and published as a domain event.

## Realtime

WebSocket gateway with rooms (`order:{id}`, `courier:{id}`, `operator:{city}`); Redis pub/sub for multi-instance fan-out.

## Multi-tenancy

Tenant resolved per request → AsyncLocalStorage → Prisma extension injects `tenantId`. Cities/zones are tenant-agnostic reference data.

## Scaling path

1. Single API instance + Postgres + Redis
2. Horizontal API replicas (stateless; WS via Redis pub/sub), separate worker process
3. Read replicas, PostGIS, location time-series store
4. Extract hot modules (tracking, notifications) into services behind the same interfaces

TODO: diagrams (C4 level 1–2).
