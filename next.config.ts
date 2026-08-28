import type { NextConfig } from "next";

const ROOT_HOST = "jdlcore.com";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      { source: "/", has: [{ type: "host", value: "inspect.jdlcore.com" }], destination: "/inspection" },
      { source: "/", has: [{ type: "host", value: "analytics.jdlcore.com" }], destination: "/analytics" },
      { source: "/", has: [{ type: "host", value: "academy.jdlcore.com" }], destination: "/academy" },
    ];
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
