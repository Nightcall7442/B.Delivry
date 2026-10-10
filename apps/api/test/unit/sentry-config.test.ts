/**
 * Error reporting is switched on by one variable, SENTRY_DSN, and an optional monitoring variable
 * must never be the reason the API does not boot: a blank value is unset, and a wrong one is the
 * SDK's business (a warning, see sentry-init.test.ts), not the schema's.
 */
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config/index.js';
import { envSchema } from '../../src/config/env.schema.js';
import { isValidDsn } from '../../src/infrastructure/telemetry/error-reporting.js';

const base = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db?schema=public',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
  SESSION_SECRET: 'c'.repeat(32),
};

const DSN = 'https://abc123@o1.ingest.de.sentry.io/456789';

const reporting = (extra: Record<string, string>) =>
  loadConfig({ ...base, ...extra }).observability.errorReporting;

describe('error reporting configuration', () => {
  it('is off when SENTRY_DSN is absent, blank or whitespace', () => {
    expect(reporting({}).dsn).toBeUndefined();
    expect(reporting({ SENTRY_DSN: '' }).dsn).toBeUndefined();
    expect(envSchema.parse({ ...base, SENTRY_DSN: '   ' }).SENTRY_DSN).toBeUndefined();
    expect(reporting({ SENTRY_DSN: '   ' }).dsn).toBeUndefined();
  });

  it('carries the DSN when it is set', () => {
    expect(reporting({ SENTRY_DSN: DSN }).dsn).toBe(DSN);
    expect(reporting({ SENTRY_DSN: `  ${DSN}  ` }).dsn).toBe(DSN);
  });

  it('never stops the boot because of the DSN, even a wrong one', () => {
    for (const dsn of ['not a url', 'https://', 'ftp://k@h/1', 'https://abc@host/not-a-number']) {
      expect(() => loadConfig({ ...base, SENTRY_DSN: dsn })).not.toThrow();
      expect(reporting({ SENTRY_DSN: dsn }).dsn).toBe(dsn);
    }
  });

  it('names the environment after APP_ENV unless SENTRY_ENVIRONMENT says otherwise', () => {
    expect(reporting({}).environment).toBe('local');
    expect(reporting({ APP_ENV: 'production' }).environment).toBe('production');
    expect(reporting({ APP_ENV: 'production', SENTRY_ENVIRONMENT: 'staging' }).environment).toBe(
      'staging',
    );
    expect(reporting({ APP_ENV: 'production', SENTRY_ENVIRONMENT: '' }).environment).toBe(
      'production',
    );
  });

  it('does not report a production service as a laptop when only the DSN was set', () => {
    // APP_ENV defaults to 'local'; a Railway service runs with NODE_ENV=production.
    const production = { NODE_ENV: 'production', DATABASE_URL: base.DATABASE_URL };
    const secrets = {
      JWT_ACCESS_SECRET: base.JWT_ACCESS_SECRET,
      JWT_REFRESH_SECRET: base.JWT_REFRESH_SECRET,
      SESSION_SECRET: base.SESSION_SECRET,
    };
    const env = (extra: Record<string, string>) =>
      envSchema.parse({ ...production, ...secrets, ...extra });
    const build = async (extra: Record<string, string>) => {
      const { buildObservabilityConfig } = await import('../../src/config/observability.config.js');
      return buildObservabilityConfig(env(extra)).errorReporting.environment;
    };
    return Promise.all([
      expect(build({})).resolves.toBe('production'),
      expect(build({ APP_ENV: 'staging' })).resolves.toBe('staging'),
      expect(build({ SENTRY_ENVIRONMENT: 'demo' })).resolves.toBe('demo'),
    ]);
  });

  it('names the release after SENTRY_RELEASE, then the Railway commit, then nothing', () => {
    expect(reporting({}).release).toBeUndefined();
    expect(reporting({ RAILWAY_GIT_COMMIT_SHA: 'c0ffee' }).release).toBe('c0ffee');
    expect(reporting({ RAILWAY_GIT_COMMIT_SHA: 'c0ffee', SENTRY_RELEASE: 'v1.2' }).release).toBe(
      'v1.2',
    );
    expect(reporting({ RAILWAY_GIT_COMMIT_SHA: 'c0ffee', SENTRY_RELEASE: ' ' }).release).toBe(
      'c0ffee',
    );
  });
});

describe('what counts as a DSN', () => {
  it('accepts the shape Sentry hands out, hosted or self-hosted', () => {
    expect(isValidDsn(DSN)).toBe(true);
    expect(isValidDsn('https://key:secret@sentry.example.com/12')).toBe(true);
    expect(isValidDsn('http://key@localhost:9000/2')).toBe(true);
    expect(isValidDsn('https://key@host/prefix/7')).toBe(true);
  });

  it('refuses everything else', () => {
    for (const dsn of [
      '',
      'not a url',
      'https://o1.ingest.sentry.io/456789', // no public key
      'https://abc123@o1.ingest.sentry.io', // no project
      'https://abc123@o1.ingest.sentry.io/', // no project
      'https://abc123@o1.ingest.sentry.io/project', // project is not a number
      'ftp://abc123@host/1',
      'abc123@host/1',
    ]) {
      expect(isValidDsn(dsn), dsn).toBe(false);
    }
  });
});
