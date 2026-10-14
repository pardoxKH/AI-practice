import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["better-sqlite3"],
  outputFileTracingIncludes: { "/**": ["./data/sample/**"] },
  // The ops utilization report is uploaded through a server action.
  experimental: { serverActions: { bodySizeLimit: "10mb" } },
};

export default nextConfig;
