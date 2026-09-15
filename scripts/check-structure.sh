#!/usr/bin/env bash
# Non-destructive sanity checks for the monorepo skeleton
set -euo pipefail
cd "$(dirname "$0")/.."
fail=0
for f in package.json pnpm-workspace.yaml turbo.json tsconfig.base.json .env.example docker-compose.yml; do
  [ -f "$f" ] || { echo "MISSING $f"; fail=1; }
done
for d in apps/web apps/admin apps/courier apps/customer apps/api packages/ui packages/config; do
  [ -f "$d/package.json" ] || { echo "MISSING $d/package.json"; fail=1; }
done
node -e 'for (const f of process.argv.slice(1)) JSON.parse(require("fs").readFileSync(f,"utf8"))' \
  $(git ls-files '*.json' 2>/dev/null || find . -name '*.json' -not -path '*/node_modules/*')
[ $fail -eq 0 ] && echo "structure OK"
exit $fail
