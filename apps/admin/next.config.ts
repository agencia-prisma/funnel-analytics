import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  transpilePackages: [
    '@funnel/config',
    '@funnel/event-contracts',
    '@funnel/observability',
    '@funnel/ui',
  ],
  async headers() {
    return [
      {
        headers: [
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
        ],
        source: '/(.*)',
      },
    ];
  },
};

export default nextConfig;
