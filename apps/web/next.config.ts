import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  devIndicators: false,
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
    remotePatterns: [{ protocol: 'https', hostname: 'upload.wikimedia.org' }],
  },
  async headers() {
    return [
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

export default nextConfig;
