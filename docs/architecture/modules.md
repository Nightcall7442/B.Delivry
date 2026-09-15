# Backend Modules

| Module | Responsibility | Depends on |
|---|---|---|
| auth | OTP/password login, JWT, sessions | users, notifications |
| users | accounts | — |
| customers | customer profile | users, addresses |
| couriers | courier profile/status/wallet | users, geo |
| vendors | vendor onboarding | users |
| stores | stores, schedules | vendors, geo, addresses |
| products / categories / catalog | catalog write & read models | stores |
| cart | cart | catalog, pricing |
| orders | order lifecycle (state machine) | cart, pricing, payments (events), delivery (events) |
| delivery | courier matching, pickup/dropoff | couriers, geo, tracking |
| tracking | live location, ETA | geo |
| payments | PaymentProvider orchestration, wallet | orders (events) |
| pricing | tariffs, fees, commissions | geo |
| promotions | coupons | orders |
| addresses / geo | UZ addresses, zones, geofencing | maps integration |
| notifications | NotificationProvider dispatch | users |
| reviews / support / analytics / admin / audit | — | many (read-only) |

Rules
- A module exposes ONLY `index.ts` (service + types). Repositories are private.
- Dependency direction must be acyclic (enforce with eslint `import/no-cycle` + boundaries).
- Shared contracts live in `packages/*`; server adapters live in `apps/api/src/integrations/*`.
