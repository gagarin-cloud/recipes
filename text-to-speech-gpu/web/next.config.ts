import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  /**
   * This app has its own lockfile inside a repository of recipes, several of
   * which have one. Left to infer, the bundler walks up and may pick another's.
   * The Docker context is this directory alone, so saying so is the same answer
   * in both places.
   */
  turbopack: { root: import.meta.dirname },

  /**
   * Emit `.next/standalone`, a self-contained server with only the traced
   * dependencies, so the runtime image is `node server.js` over a copied
   * directory rather than a full node_modules. See the Dockerfile.
   */
  output: 'standalone',

  poweredByHeader: false,

  async headers() {
    // Production only: the dev server's hot reload needs eval.
    if (process.env.NODE_ENV !== 'production') return []
    const csp = [
      "default-src 'self'",
      // Next's hydration bootstrap is inline.
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      // The audio comes from this server, never from the bucket directly.
      "media-src 'self'",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join('; ')
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
        ],
      },
    ]
  },
}

export default nextConfig
