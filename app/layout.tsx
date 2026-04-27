import type { Metadata } from "next";
import { Noto_Sans_JP, Noto_Serif_JP } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";

const notoSans = Noto_Sans_JP({
  variable: "--font-sans",
  subsets: ["latin"],
});

const notoSerif = Noto_Serif_JP({
  variable: "--font-serif",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "日調web",
  description: "候補日を作成してURLを共有するだけ。参加者が〇△✕で回答できる、シンプルなグループ日程調整アプリです。登録不要・無料で使えます。",
  verification: {
    google: "D8IL6531W2fqD0YQrgOz-ODECBHjxCAeoyet1LAC34U",
  },
  openGraph: {
    title: "日調web",
    description: "候補日を作成してURLを共有するだけ。参加者が〇△✕で回答できる、シンプルなグループ日程調整アプリです。登録不要・無料で使えます。",
    url: "https://nittei-app-five.vercel.app",
    siteName: "日調web",
    locale: "ja_JP",
    type: "website",
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "日調web",
  url: "https://nittei-app-five.vercel.app",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className={`${notoSans.variable} ${notoSerif.variable}`}>
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
