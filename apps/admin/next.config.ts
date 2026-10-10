import path from 'node:path';

import { withSentryConfig } from '@sentry/nextjs/config';
import type { NextConfig } from 'next';

const sentryDsn = process.env['NEXT_PUBLIC_SENTRY_DSN'] ?? '';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // One self-contained server for the Docker image; tracing from the monorepo root.
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname, '../../'),
  eslint: { ignoreDuringBuilds: true },
  // Error reports start only from a DSN built into the code (src/lib/monitoring/dsn.ts). Next inlines
  // a NEXT_PUBLIC_ variable only if it exists at build time; naming it here makes «no DSN» the empty
  // string in every build, so the bundler can see the Sentry branches are dead and drops the SDK.
  env: { NEXT_PUBLIC_SENTRY_DSN: sentryDsn },
  transpilePackages: [
    '@bazar/ui',
    '@bazar/i18n',
    '@bazar/api-client',
    '@bazar/utils',
    '@bazar/constants',
    '@bazar/maps',
    '@bazar/types',
    '@bazar/storefront',
  ],
  webpack(config) {
    // Workspace packages import each other with explicit .js extensions (the API
    // is NodeNext and needs them). TypeScript maps those onto the .ts sources;
    // webpack has to be told the same thing or every barrel fails to resolve.
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      '.js': ['.ts', '.tsx', '.js'],
    };
    return config;
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'geolocation=(), camera=(), microphone=()' },
        ],
      },
    ];
  },
};

const sentryAuthToken = process.env['SENTRY_AUTH_TOKEN'] || undefined;

/**
 * Sentry's build step: readable stack traces for the minified code (source maps uploaded at build
 * time, then deleted so they are not served) — and nothing else. Left alone, the plugin switches
 * source maps on for every build, token or not: the image would carry tens of MB of them and the
 * build take longer. So without SENTRY_AUTH_TOKEN (a developer, CI, a plain image) it does
 * nothing at all. The SDK itself starts from NEXT_PUBLIC_SENTRY_DSN (src/lib/monitoring,
 * docs/monitoring.md); the options are the storefront's (apps/web/next.config.ts).
 *
 * Without a DSN there is nothing to report to, and the config is not wrapped at all: the plugin
 * would still stamp every entry chunk with the release and the SDK's build variables.
 */
export default sentryDsn
  ? withSentryConfig(nextConfig, {
      org: process.env['SENTRY_ORG'],
      project: process.env['SENTRY_PROJECT'],
      authToken: sentryAuthToken,
      silent: !process.env['CI'],
      telemetry: false,
      sourcemaps: { disable: sentryAuthToken === undefined, deleteSourcemapsAfterUpload: true },
      // Navigations are not traced, so the hook the SDK asks for to trace them is not wanted.
      suppressOnRouterTransitionStartWarning: true,
      // Errors only: tracing (and the route list it groups transactions by) is cut out of the bundle.
      routeManifestInjection: false,
      bundleSizeOptimizations: {
        excludeDebugStatements: true,
        excludeTracing: true,
        excludeReplayIframe: true,
        excludeReplayShadowDom: true,
        excludeReplayWorker: true,
      },
      // Errors reach Sentry through `onRequestError` (src/instrumentation.ts). The wrappers that
      // would also trace every page, route and the middleware cost build time and server weight.
      webpack: {
        autoInstrumentServerFunctions: false,
        autoInstrumentMiddleware: false,
        autoInstrumentAppDirectory: false,
      },
    })
  : nextConfig;
