# ADR-0007: Geo storage

**Status:** accepted
**Date:** 2026-09-08

## Context

Three geo questions are asked constantly:

1. Which delivery zone covers this address? (every quote, every order)
2. Which couriers are near this pickup point? (every courier search)
3. Where is the courier now? (every few seconds per active delivery)

PostGIS answers all three well, at the cost of an extension, a different
migration story, and raw SQL for anything Prisma cannot express.

## Decision

**Plain `Decimal(9, 6)` lat/lng columns, with the geometry done in
application code**, plus one deliberate deviation from the original sketch.

- Zones are stored as GeoJSON in a `Json` column and tested with
  `pointInPolygon` from `@bazar/maps` (`modules/geo/domain/geofence.ts`).
- Nearby searches use a bounding box in SQL — which an index serves — followed
  by an exact haversine filter in memory (`boundingBox` in `@bazar/maps`).
- Region / City / District / Mahalla are **one self-referencing `GeoPlace`
  table** with a `level` enum, not four identical tables.

`Decimal(9, 6)` is about 11 cm of precision, far finer than a phone GPS fix.

## Consequences

- No PostGIS: standard Postgres anywhere, and migrations stay ordinary.
- The polygon check is a linear scan over one city's zones. A city has tens of
  zones, not thousands, so this is cheaper than the dependency it replaces.
  Marked with a `ponytail:` comment naming the ceiling.
- The bounding-box prefilter is what keeps the courier search off a full scan.
  It is intentionally slightly wider than the radius: it must never exclude a
  courier the exact check would have accepted.
- One `GeoPlace` table means one tree walk instead of four joins, and adding a
  level later is an enum value rather than a table.
- `CourierLocation` grows fast. It is pruned nightly to 30 days; partitioning
  or TimescaleDB is the next step if that stops being enough.

## Alternatives considered

- **PostGIS from the start** — correct at scale, and the right move once zone
  counts or courier density make the linear scan hurt. Premature now: it would
  buy nothing measurable and cost every developer a heavier local setup.
- **Four separate geo tables** — as the original schema sketched. Rejected:
  four tables with identical columns, and every query joining through all of
  them to answer "which city is this mahalla in".
