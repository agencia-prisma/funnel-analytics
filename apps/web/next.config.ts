import type { NextConfig } from 'next';

const securityHeaders = [
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=()',
  },
];

const nextConfig: NextConfig = {
  transpilePackages: [
    '@funnel/auth',
    '@funnel/config',
    '@funnel/db',
    '@funnel/event-contracts',
    '@funnel/observability',
    '@funnel/pixel',
    '@funnel/ui',
  ],
  async headers() {
    return [
      {
        headers: securityHeaders,
        source: '/(.*)',
      },
    ];
  },
};

export default nextConfig;
