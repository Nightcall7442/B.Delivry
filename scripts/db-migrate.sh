#!/usr/bin/env bash
# Usage: scripts/db-migrate.sh <migration-name>
set -euo pipefail
cd "$(dirname "$0")/.."
pnpm --filter @bazar/api exec prisma migrate dev --name "${1:?migration name required}"
