# ADR-0006: Queue library

**Status:** accepted
**Date:** 2026-09-08

## Context

Background work here is not optional plumbing — it is the courier search, which
widens its radius over minutes and retries, plus notification delivery, payment
capture and the nightly sweeps.

Candidates: BullMQ (Redis-backed) and pg-boss (Postgres-backed).

## Decision

**BullMQ**, behind a `JobQueue` interface in
`infrastructure/redis/queue.ts`.

Nothing outside that file imports BullMQ. Job handlers receive a typed payload
and return; the queue that delivered it is not their concern.

Two implementations exist besides the real one: `InlineQueue` runs handlers
synchronously for tests, and a no-op queue lets the API boot with no Redis at
all.

## Consequences

- Redis is already a hard dependency for caching, rate limiting and websocket
  fan-out, so BullMQ adds no new infrastructure.
- Delayed and repeatable jobs come for free, which is exactly what the courier
  search (retry after the offer expires) and the nightly cleanups need.
- Workers run as a separate process (`jobs/worker.ts`), so a flood of location
  writes cannot eat the concurrency the HTTP API needs.
- Jobs are lost if Redis is lost. Accepted: every job is either retried from
  its source event or is a sweep that runs again on schedule. Nothing
  financial depends on a job surviving a Redis restart — payment state lives
  in Postgres and is reconciled from provider webhooks.

## Alternatives considered

- **pg-boss** — one less system to lose, and transactional enqueue with the
  business write. Rejected because the location and notification volume would
  land on the same database that serves the checkout path, and because
  repeatable-job support is weaker.
- **A plain table plus a polling loop** — tempting, and genuinely enough for
  the sweeps. Not enough for the courier search, which needs per-job delays.
