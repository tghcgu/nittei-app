import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.NITTEI_TEST_DIST_DIR || '.next',
  typescript: {
    tsconfigPath: process.env.NITTEI_TEST_DIST_DIR ? 'tsconfig.tests.json' : 'tsconfig.json',
  },
  // Cloudflare (OpenNext) が standalone 形式のビルド成果物を必要とする。Vercel でもこの設定のまま動く
  output: "standalone",
};

export default nextConfig;
