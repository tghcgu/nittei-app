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

const siteName = "日程組";
const siteDescription =
  "日程組は、候補日を作成してURLを共有するだけで、参加者が〇△✕で回答できる日程調整アプリです。登録不要・無料で使えます。";
const siteUrl = "https://nittei-app-five.vercel.app";

export const metadata: Metadata = {
  title: siteName,
  applicationName: siteName,
  description: siteDescription,
  verification: {
    google: "D8IL6531W2fqD0YQrgOz-ODECBHjxCAeoyet1LAC34U",
  },
  openGraph: {
    title: siteName,
    description: siteDescription,
    url: siteUrl,
    siteName,
    locale: "ja_JP",
    type: "website",
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: siteName,
  description: siteDescription,
  url: siteUrl,
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
