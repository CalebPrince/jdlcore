import type { NextConfig } from "next";

const ROOT_HOST = "jdlcore.com";

const nextConfig: NextConfig = {
  serverExternalPackages: ["exceljs"],
  // Server Actions default to a 1 MB body limit, well under the 4 MB file caps
  // enforced in code (receipts, uploads) — raise it so those checks are the ones
  // that actually fire, instead of Next hard-rejecting the request first.
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  async rewrites() {
    return {
      beforeFiles: [
        { source: "/", has: [{ type: "host", value: "inspect.jdlcore.com" }], destination: "/inspection" },
        { source: "/", has: [{ type: "host", value: "analytics.jdlcore.com" }], destination: "/analytics" },
        { source: "/", has: [{ type: "host", value: "academy.jdlcore.com" }], destination: "/academy" },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
  async redirects() {
    return [
      {
        source: "/inspection",
        has: [{ type: "host", value: ROOT_HOST }],
        destination: "https://inspect.jdlcore.com",
        permanent: true,
      },
      {
        source: "/analytics",
        has: [{ type: "host", value: ROOT_HOST }],
        destination: "https://analytics.jdlcore.com/analytics",
        permanent: true,
      },
      {
        source: "/analytics/:path+",
        has: [{ type: "host", value: ROOT_HOST }],
        destination: "https://analytics.jdlcore.com/analytics/:path+",
        permanent: true,
      },
      {
        source: "/academy",
        has: [{ type: "host", value: ROOT_HOST }],
        destination: "https://academy.jdlcore.com/academy",
        permanent: true,
      },
      {
        source: "/academy/:path+",
        has: [{ type: "host", value: ROOT_HOST }],
        destination: "https://academy.jdlcore.com/academy/:path+",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
