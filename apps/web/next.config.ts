import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@atrium/api",
    "@atrium/db",
    "@atrium/domain",
    "@atrium/ui",
    "@atrium/trackers",
    "@atrium/harness",
  ],
};

export default nextConfig;
