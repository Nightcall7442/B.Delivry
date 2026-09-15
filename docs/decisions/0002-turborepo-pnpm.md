# ADR-0002: Turborepo + pnpm

**Status:** accepted · **Date:** 2026-09-07

Shared types/validation/constants between API, web and mobile require a monorepo. pnpm workspaces + Turborepo task graph & caching.
Consequence: Expo apps need `node-linker=hoisted` (per-app `.npmrc`).
