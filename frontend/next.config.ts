import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow dev resources from these origins (LAN + Tailscale + public domain via CF tunnel)
  allowedDevOrigins: [
    "127.0.0.1",
    "localhost",
    "192.168.0.222",
    "100.100.239.67",
    "boot.abbamarkt.nl",
  ],

  // Proxy /api/* to the FastAPI backend so the panel works from any hostname
  // (browser hits the same host, Next.js forwards to the backend on localhost)
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://127.0.0.1:8086/api/:path*",
      },
    ];
  },
};

export default nextConfig;
