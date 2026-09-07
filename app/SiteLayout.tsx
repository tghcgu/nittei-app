import type { Metadata } from "next";
import {
  siteDescription,
  siteKeywords,
  siteName,
  siteShortName,
  siteTitle,
  siteUrl,
} from "@/lib/site";
import { ThemeToggle } from "./ThemeToggle";
import { LocaleProvider } from './LocaleProvider';
import { LanguageSwitch } from './LanguageSwitch';
import type { Locale } from '@/lib/i18n';
import { englishDescription } from '@/lib/i18n/metadata';
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: siteTitle,
    template: `%s | ${siteName}（略して ${siteShortName}）`,
  },
  applicationName: siteName,
  appleWebApp: {
    capable: true,
    title: siteName,
    statusBarStyle: "black-translucent",
  },
  description: siteDescription,
  keywords: siteKeywords,
  alternates: {
    canonical: "/",
    languages: { ja: '/', en: '/en', 'x-default': '/' },
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  verification: {
    google: "D8IL6531W2fqD0YQrgOz-ODECBHjxCAeoyet1LAC34U",
  },
  openGraph: {
    title: siteTitle,
    description: siteDescription,
    url: siteUrl,
    siteName,
    locale: "ja_JP",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: siteTitle,
    description: siteDescription,
  },
};

// Google検索の「サイト名」表示にはWebSite型が使われる（ないと workers.dev の持ち主名が出る）
// alternateName（別名）は略称のみにする。タイトル全文は別名ではないため
const webSiteJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: siteName,
  alternateName: siteShortName,
  url: siteUrl,
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: siteName,
  alternateName: siteShortName,
  description: siteDescription,
  url: siteUrl,
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "JPY",
  },
};

const themeInitScript = `
(() => {
  try {
    const theme = localStorage.getItem('nittei-theme');
    document.documentElement.dataset.theme = theme === 'dark' ? 'dark' : 'light';
  } catch {
    document.documentElement.dataset.theme = 'light';
  }
})();
`;

export default function RootLayout({
  children,
  locale = 'ja',
}: Readonly<{
  children: React.ReactNode;
  locale?: Locale;
}>) {
  return (
    <html lang={locale} data-theme="light" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(webSiteJsonLd) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(locale === 'en' ? {
            ...jsonLd, name: 'Nitteigumi', description: englishDescription,
            url: `${siteUrl}/en`, inLanguage: 'en',
          } : jsonLd) }}
        />
        <LocaleProvider locale={locale}>
          <LanguageSwitch />
          {children}
          <ThemeToggle />
        </LocaleProvider>
        {process.env.NODE_ENV === "production" && (
          // Cloudflare Web Analytics(Cookie不使用のアクセス解析)
          <script
            type="module"
            defer
            src="https://static.cloudflareinsights.com/beacon.min.js"
            data-cf-beacon='{"token": "6c4b4109282a4446b40d67c5927786a9"}'
          />
        )}
      </body>
    </html>
  );
}
