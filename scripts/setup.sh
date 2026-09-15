#!/usr/bin/env bash
# First-time local setup
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f .env ] || cp .env.example .env
corepack enable
pnpm install
echo "Next: pnpm docker:up && pnpm db:generate && pnpm dev"
