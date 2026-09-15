# Deployment

Environments: local → staging → production.

- Local: `docker compose up` (postgres, redis), `pnpm dev`
- CI: GitHub Actions (`ci.yml`, `test.yml`, `build.yml`) — no production deploy in this stage
- Images: `apps/api/Dockerfile` (multi-stage), Next apps standalone builds (TODO)
- Mobile: EAS Build (`eas.json`)
- Prod: `infrastructure/docker/docker-compose.prod.yml` behind Nginx; managed Postgres/Redis recommended
- Migrations: `prisma migrate deploy` as release step
- TODO: backups, blue/green, rollback runbook
