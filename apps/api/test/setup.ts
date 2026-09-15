/**
 * Vitest global setup.
 *
 * Unit tests here touch no database and no Redis: the logic worth testing
 * (state machine, pricing, geometry) is pure by design, and the repositories
 * are thin enough that mocking Prisma would test the mock.
 *
 * Integration tests build a container with `withoutRedis: true` and a real
 * test database, which is why the env below has to be valid rather than empty.
 */
import { beforeAll } from 'vitest';

const TEST_ENV: Record<string, string> = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://bazar:bazar@localhost:5432/bazar_test?schema=public',
  // Long enough to satisfy the secret length check in the env schema.
  JWT_ACCESS_SECRET: 'test-access-secret-0123456789-0123456789',
  JWT_REFRESH_SECRET: 'test-refresh-secret-0123456789-0123456789',
  SESSION_SECRET: 'test-session-secret-0123456789-0123456789',
  LOG_LEVEL: 'silent',
};

beforeAll(() => {
  for (const [key, value] of Object.entries(TEST_ENV)) {
    process.env[key] ??= value;
  }
});
