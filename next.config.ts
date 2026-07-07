import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    localPatterns: [
      {
        pathname: "/psbeacon.png",
        search: "?v=20260707",
      },
    ],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.supabase.co",
      },
    ],
  },
  serverExternalPackages: ["onnxruntime-node"],
};

export default nextConfig;
