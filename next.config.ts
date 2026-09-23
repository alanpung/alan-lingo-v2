import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
  },
  async redirects() {
    return [
      {
        source: "/units",
        destination: "/library",
        permanent: true,
      },
      {
        source: "/units/:path*",
        destination: "/library/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
