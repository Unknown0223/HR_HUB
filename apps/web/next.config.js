/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // A production build writes to the same directory the dev server serves from,
  // which corrupts its chunk manifest ("Cannot find module './997.js'").
  // Set NEXT_DIST_DIR to verify a build while `dev:web` keeps running.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // TypeScript is checked during `next build`. ESLint is not configured in this
  // app yet (no eslint-config-next); keep ignore until a real lint setup exists.
  eslint: { ignoreDuringBuilds: true },
};

module.exports = nextConfig;
