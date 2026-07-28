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
