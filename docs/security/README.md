# Security

- AuthN: phone + OTP (SMS) and/or password; JWT access (short TTL) + rotating refresh tokens (Redis session store)
- AuthZ: RBAC (`@bazar/auth`), permission checks in middleware + services (defense in depth)
- Passwords: argon2id (TODO ADR); OTP attempt limits
- Rate limiting: Redis sliding window per IP/user/route
- Validation: Zod on every boundary; input sanitization
- Headers: helmet-equivalent, strict CORS, CSRF strategy for cookie-based web sessions
- Audit log for admin/operator mutations
- Secrets: env / secret manager only; `.env` never committed; rotate keys
- Webhooks: signature verification + idempotency keys
- Uploads: signed URLs, content-type & size validation, AV scan (later)
- TODO: threat model, dependency scanning (Dependabot enabled), SAST in CI
