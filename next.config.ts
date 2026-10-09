import type { NextConfig } from "next";

// 全ページ共通の安全のための設定。
// 他のサイトに日程組のページを埋め込ませない（だまして操作させる攻撃を防ぐ）、
// 外部サイトへは URL のうちドメインだけを送る（どのイベントを見ていたかを渡さない）など。
const securityHeaders = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
  { key: "Strict-Transport-Security", value: "max-age=31536000" },
];

const nextConfig: NextConfig = {
  distDir: process.env.NITTEI_TEST_DIST_DIR || '.next',
  typescript: {
    tsconfigPath: process.env.NITTEI_TEST_DIST_DIR ? 'tsconfig.tests.json' : 'tsconfig.json',
  },
  // Cloudflare (OpenNext) が standalone 形式のビルド成果物を必要とする。Vercel でもこの設定のまま動く
  output: "standalone",
  // どの仕組みで動いているかを外に知らせない
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
