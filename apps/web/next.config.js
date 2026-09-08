/** @type {import('next').NextConfig} */
const API_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') || 'http://localhost:3002';

const nextConfig = {
  reactStrictMode: true,
  // A production build writes to the same directory the dev server serves from,
  // which corrupts its chunk manifest ("Cannot find module './997.js'").
  // Set NEXT_DIST_DIR to verify a build while `dev:web` keeps running.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // TypeScript is checked during `next build`. ESLint is not configured in this
  // app yet (no eslint-config-next); keep ignore until a real lint setup exists.
  eslint: { ignoreDuringBuilds: true },
  async rewrites() {
    return [
      { source: '/api/:path*', destination: `${API_URL}/api/:path*` },
      // Swagger UI (API). Media is served under /api/storage/file, not /media.
      { source: '/docs', destination: `${API_URL}/docs` },
      { source: '/docs/:path*', destination: `${API_URL}/docs/:path*` },
    ];
  },
};

module.exports = nextConfig;
