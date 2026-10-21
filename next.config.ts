import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.NITTEI_TEST_DIST_DIR || '.next',
  typescript: {
    tsconfigPath: process.env.NITTEI_TEST_DIST_DIR ? 'tsconfig.tests.json' : 'tsconfig.json',
  },
  // 全ページを、ビルドのときにファイルとして書き出す（out/）。
  // Cloudflare はファイルを Worker を動かさずに返すので、無料プランの CPU 上限（1回10ms）にかからない。
  // イベントのページは1つの共通ファイル（e/_）で、custom-worker.mjs がイベントの中身を入れて返す。
  // 書き出しでは next.config の headers() が使えないため、安全のためのヘッダーは public/_headers と custom-worker.mjs で送る。
  output: "export",
  images: { unoptimized: true },
};

export default nextConfig;
