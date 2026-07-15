import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cloudflare (OpenNext) が standalone 形式のビルド成果物を必要とする。Vercel でもこの設定のまま動く
  output: "standalone",
};

export default nextConfig;
