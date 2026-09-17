# Database

PostgreSQL + Prisma. Schema: `apps/api/prisma/schema.prisma`.

Conventions

- UUID ids, `createdAt/updatedAt`, soft delete where business requires
- Money as integer minor units + currency (UZS)
- `tenantId` on tenant-scoped tables, composite indexes `(tenantId, ...)`
- Status enums mirror `@bazar/constants`
- Geo: lat/lng Decimal now; PostGIS later (ADR)
- Time-series (`CourierLocation`): partition by day / retention policy

Planned models: see TODO list in schema.prisma and [erd.md](erd.md).
