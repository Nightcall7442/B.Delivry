/**
 * `PAYME_SECRET_KEY=` in a deployment (a variable created and left blank) used to arrive as an empty
 * string: not undefined, so the provider was switched on and its webhooks were signed with nothing.
 * A blank credential is no credential.
 */
import { describe, expect, it } from 'vitest';
import { envSchema } from '../../src/config/env.schema.js';

const base = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db?schema=public',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
  SESSION_SECRET: 'c'.repeat(32),
};

const parse = (extra: Record<string, string>) => envSchema.parse({ ...base, ...extra });

describe('provider credentials in the environment', () => {
  it('reads blank and whitespace-only values as unset', () => {
    const env = parse({
      PAYME_MERCHANT_ID: '',
      PAYME_SECRET_KEY: '',
      CLICK_MERCHANT_ID: ' ',
      CLICK_SERVICE_ID: '',
      CLICK_SECRET_KEY: '  ',
      UZUM_MERCHANT_ID: '',
      UZUM_SECRET_KEY: '',
      TELEGRAM_WEBHOOK_SECRET: '',
    });
    expect(env.PAYME_MERCHANT_ID).toBeUndefined();
    expect(env.PAYME_SECRET_KEY).toBeUndefined();
    expect(env.CLICK_MERCHANT_ID).toBeUndefined();
    expect(env.CLICK_SERVICE_ID).toBeUndefined();
    expect(env.CLICK_SECRET_KEY).toBeUndefined();
    expect(env.UZUM_MERCHANT_ID).toBeUndefined();
    expect(env.UZUM_SECRET_KEY).toBeUndefined();
    expect(env.TELEGRAM_WEBHOOK_SECRET).toBeUndefined();
  });

  it('keeps a real credential as it is', () => {
    const env = parse({ PAYME_MERCHANT_ID: 'm-1', PAYME_SECRET_KEY: 'k-1' });
    expect(env.PAYME_MERCHANT_ID).toBe('m-1');
    expect(env.PAYME_SECRET_KEY).toBe('k-1');
  });

  it('refuses to start with Payme as the default provider and a blank key', () => {
    const result = envSchema.safeParse({
      ...base,
      PAYMENTS_DEFAULT_PROVIDER: 'payme',
      PAYME_MERCHANT_ID: 'm-1',
      PAYME_SECRET_KEY: '',
    });
    expect(result.success).toBe(false);
  });
});
