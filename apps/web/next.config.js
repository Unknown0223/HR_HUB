/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // A production build writes to the same directory the dev server serves from,
  // which corrupts its chunk manifest ("Cannot find module './997.js'").
  // Set NEXT_DIST_DIR to verify a build while `dev:web` keeps running.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // Railway: bind to all interfaces when started via `next start`.
  output: undefined,
};

module.exports = nextConfig;
