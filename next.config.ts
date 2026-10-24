import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Node-only packages; load them at runtime instead of bundling.
  serverExternalPackages: ["@electric-sql/pglite", "pg", "exceljs"],
  // A stray package-lock.json in the home folder confuses root detection.
  turbopack: { root: process.cwd() },
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Nobody can show this app inside their own page (clickjacking).
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
