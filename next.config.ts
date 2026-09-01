import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
  async headers() {
    return [
      {
        // Baseline hardening on every response. (Vercel already forces HTTPS.)
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
          },
        ],
      },
      {
        // The push service worker must never be cached, or opted-in users get
        // stuck on a stale version after a deploy.
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
    ];
  },
  experimental: {
    serverActions: {
      // Group file uploads allow up to 10MB; leave headroom for multipart overhead.
      bodySizeLimit: "12mb",
    },
    // The Supabase session-refresh middleware runs on every route, so without this
    // Next.js truncates any request body over its 10MB default before it reaches the
    // upload action - producing a raw "Unexpected end of form" parse error instead of
    // the app's own friendly size-limit message.
    proxyClientMaxBodySize: "12mb",
  },
};

export default nextConfig;
