import type { NextConfig } from 'next';

const backendUrl = (process.env.BACKEND_URL ?? 'http://localhost:8000').replace(/\/$/, '');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Self-contained server bundle for the Docker image (ignored by Vercel).
  output: 'standalone',
  // Cloudscape ships ESM with CSS modules that Next needs to compile.
  transpilePackages: ['@cloudscape-design/components', '@cloudscape-design/component-toolkit'],
  // Same-origin API: the browser only calls /api/* on this origin, so the session cookie stays
  // first-party in production. Next proxies those calls to the FastAPI backend.
  // Note: rewrites are resolved at build time, so BACKEND_URL must be set when building.
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${backendUrl}/api/:path*` }];
  },
};

export default nextConfig;
