import path from 'node:path';

import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // One self-contained server for the Docker image; tracing from the monorepo root.
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname, '../../'),
  eslint: { ignoreDuringBuilds: true },
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

export default nextConfig;
