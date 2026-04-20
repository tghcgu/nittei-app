import type { Metadata } from "next";
import { Noto_Sans_JP, Noto_Serif_JP } from "next/font/google";
import Script from "next/script";
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
  title: "日程調整アプリ",
  description: "日程調整をかんたんに",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className={`${notoSans.variable} ${notoSerif.variable}`}>
      <body>
        {children}
        {/* Google Identity Services: ユーザーがボタンを押すまで読み込まない */}
        <Script
          src="https://accounts.google.com/gsi/client"
          strategy="lazyOnload"
        />
      </body>
    </html>
  );
}
