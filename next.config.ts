import type { NextConfig } from 'next';

/**
 * Security headers applied to every response.
 *
 * The Content-Security-Policy is NOT set here - it is generated per-request in
 * `src/middleware.ts` so that it can carry a fresh nonce. Everything below is
 * request-independent and therefore safe to set statically.
 */
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  { key: 'X-DNS-Prefetch-Control', value: 'off' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  experimental: {
    /*
     * Both upload surfaces - a bet slip and an analyst's identity document -
     * arrive through a Server Action, and `storeScreenshot`/`storeIdentityDocument`
     * accept up to 12MB before re-encoding. The Server Action body limit
     * defaults to 1MB, though, so a real phone photo (routinely 3-8MB) made
     * the request hang at "იგზავნება…" with nothing surfaced to the user.
     * The ceiling here sits just above the 12MB the uploader itself enforces,
     * so the honest "too large" message comes from our validator, not from a
     * generic framework rejection.
     */
    serverActions: {
      bodySizeLimit: '13mb',
    },
  },

  /*
   * Dev only (ignored by `next build`): lets a phone on the same Wi-Fi open
   * the dev server via the machine's LAN address. Next 16 refuses dev-asset
   * requests from any origin it was not started on, so without this the page
   * loads from http://<lan-ip>:3000 but every chunk 403s. Private ranges
   * only - this never widens anything in production.
   */
  allowedDevOrigins: [
    '127.0.0.1',
    'localhost',
    '192.168.*.*',
    '10.*.*.*',
    '172.16.*.*',
  ],

  // The generated Prisma client must not be bundled into the browser build.
  // opencv.js is a 14MB WebAssembly script loaded with require() at runtime
  // (src/lib/logo-detect.ts); left external so the bundler neither inlines
  // nor rewrites it, and file tracing carries it into the serverless bundle.
  serverExternalPackages: ['@prisma/client', '@techstark/opencv-js'],

  typescript: {
    // Never ship a build that does not typecheck.
    ignoreBuildErrors: false,
  },

  async redirects() {
    return [
      // The analyst ranking moved to the root; old links keep working.
      { source: '/analysts', destination: '/', permanent: true },
    ];
  },

  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
