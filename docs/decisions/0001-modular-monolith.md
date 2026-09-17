# ADR-0001: Modular monolith first

**Status:** accepted · **Date:** 2026-09-07

## Context

Team is small; product must reach 1 city → all Uzbekistan. Microservices upfront add operational cost without benefit.

## Decision

Single deployable API organized by domain modules with strict boundaries (index.ts-only exports, events for cross-module async).

## Consequences

Simple dev/test/deploy. Later extraction possible module-by-module. Requires discipline: lint rules for boundaries.
