# ADR-0005: HTTP framework

**Status:** accepted
**Date:** 2026-09-08

## Context

The API needed an HTTP framework before `app/create-app.ts` could be written.
Candidates were Fastify (performance, schema-first, plugins), Express
(ubiquity), NestJS (opinionated DI, heavier) and Hono.

Three things about this codebase narrowed the choice:

- The scaffold already separates `controller` / `routes` / `service`, so an
  opinionated DI framework would replace a structure that already exists.
- `src/websocket/` assumes the websocket server shares the HTTP server.
- Validation is Zod everywhere, in packages shared with the frontends.

## Decision

**Fastify 5**, with `@fastify/cors`, `@fastify/helmet` and
`@fastify/websocket`.

Validation stays Zod through a `validate()` preHandler rather than Fastify's
JSON Schema layer, because the same schemas are shared with the web and mobile
apps through `@bazar/validation`. Fastify's schema compiler is not used.

## Consequences

- The hook lifecycle (`onRequest` / `preValidation` / `preHandler`) is what
  orders the middleware chain: request id, locale, auth, rate limit, tenant.
  That order is load-bearing and documented in `create-app.ts`.
- Tenant context is opened in a `preHandler` around `done()`, so every handler
  below runs inside the request's `AsyncLocalStorage` scope.
- `@fastify/websocket` shares the HTTP port, so `/ws` needs no second listener.
- Skipping the JSON Schema compiler gives up Fastify's fast serialization.
  Acceptable: responses here are small, and one validation vocabulary across
  the whole monorepo is worth more.

## Alternatives considered

- **Express 5** — familiar, but weaker types, and websockets and validation
  would each be a separate bolt-on.
- **NestJS** — fits "modular monolith", but would mean rewriting the existing
  folder structure into its module/decorator model for no behavioural gain.
- **Hono** — attractive and small, but the Node ecosystem around it (BullMQ
  boards, Prisma examples, websocket integration) is thinner.
