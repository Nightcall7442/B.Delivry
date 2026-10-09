import path from 'node:path';

import { withSentryConfig } from '@sentry/nextjs/config';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  // Docker image = the standalone server + static + public (see /Dockerfile); the
  // tracing root is the monorepo so workspace packages are followed into it.
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname, '../../'),
  eslint: { ignoreDuringBuilds: true },
  // The dev server is shown to the client through an Expo ws-tunnel; without this Next
  // refuses the tunnel host's HMR requests.
  allowedDevOrigins: ['*.boltexpo.dev'],
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
  images: {
    // Fixture photography (see packages/storefront/src/photos.ts); the storage bucket joins here.
    remotePatterns: [
      { protocol: 'https', hostname: 'bazar-delivery.uz' },
      { protocol: 'https', hostname: 'upload.wikimedia.org' },
    ],
  },
  async headers() {
    return [
      // Pictures, film frames, fonts and the map worker are files that are replaced by adding a new
      // one, not by editing: Next sends everything in /public with max-age=0, which makes every
      // return visit ask the server about every one of them. A week, and a day more of showing
      // the old one while the new is fetched.
      {
        source: '/(photos|promo|scenes|fonts|maplibre)/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=604800, stale-while-revalidate=86400' },
        ],
      },
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // The address picker asks for the location; nothing else on the page may.
          { key: 'Permissions-Policy', value: 'geolocation=(self), camera=(), microphone=()' },
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
 * docs/monitoring.md).
 */
export default withSentryConfig(nextConfig, {
  org: process.env['SENTRY_ORG'],
  project: process.env['SENTRY_PROJECT'],
  authToken: sentryAuthToken,
  silent: !process.env['CI'],
  telemetry: false,
  sourcemaps: { disable: sentryAuthToken === undefined, deleteSourcemapsAfterUpload: true },
  // Navigations are not traced, so the hook the SDK asks for to trace them is not wanted.
  suppressOnRouterTransitionStartWarning: true,
  // Errors only: tracing (and the route list it groups transactions by) is cut out of the bundle —
  // about 20 KB of what the browser fetches on its first error.
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
});
