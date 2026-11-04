import type { Metadata } from "next";
import {
  previousSiteUrl,
  siteDescription,
  siteKeywords,
  siteName,
  siteShortName,
  siteTitle,
  siteUrl,
} from "@/lib/site";
import { ThemeToggle } from "./ThemeToggle";
import { LocaleProvider } from './LocaleProvider';
import type { Locale } from '@/lib/i18n';
import { appIcons, englishDescription } from '@/lib/i18n/metadata';
import { LANGUAGE_SWITCH_EVENT, RELOAD_DETAIL } from '@/lib/draft-events';
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
  // 共有リンクのプレビューは文字だけにする。大きな画像は 2026-10-03 にやめた
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
  icons: appIcons,
};

// Google検索の「サイト名」表示にはWebSite型が使われる（ないと住所のドメイン名が出る）
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

// 前の住所（nittei-app.qoj.workers.dev）から移ってきたとき、前の住所に保存されていたもの（ページ表示履歴・設定など。
// custom-worker.mjs が URL の # の後ろに nittei-move= として入れて渡す）を、この住所に取り込む。
// ほかのサイトからのリンクで勝手に書き込まれないよう、前の住所から来たときだけ取り込む。
// 表示履歴は両方を合わせ、それ以外はこの住所にまだ無いものだけ入れる。テーマを読む前に動かす
const moveFromPreviousSiteScript = `
(() => {
  const match = location.hash.match(/(^#|&)nittei-move=([^&]*)/);
  if (!match) return;
  const rest = location.hash.replace(match[0], '').replace(/^&/, '#');
  history.replaceState(history.state, '', location.pathname + location.search + (rest === '#' ? '' : rest));
  if (!document.referrer.startsWith(${JSON.stringify(previousSiteUrl + '/')})) return;
  try {
    const data = JSON.parse(decodeURIComponent(match[2]));
    const allowed = /^nittei-(theme|table-prefs|history|(ics|updated)-[A-Za-z0-9_-]+|(event|response)-key-[A-Za-z0-9_-]+)$/;
    for (const key of Object.keys(data)) {
      const value = data[key];
      if (typeof value !== 'string' || !allowed.test(key)) continue;
      if (key === 'nittei-history') {
        const merged = new Map();
        for (const list of [JSON.parse(localStorage.getItem(key) || '[]'), JSON.parse(value)]) {
          if (!Array.isArray(list)) continue;
          for (const entry of list) {
            if (!entry || typeof entry.shareId !== 'string' || typeof entry.at !== 'string') continue;
            const known = merged.get(entry.shareId);
            if (!known || known.at < entry.at) merged.set(entry.shareId, entry);
          }
        }
        localStorage.setItem(key, JSON.stringify([...merged.values()].sort((a, b) => (a.at < b.at ? 1 : -1))));
      } else if (localStorage.getItem(key) === null) {
        localStorage.setItem(key, value);
      }
    }
  } catch {
    // 取り込めなくても、ページはそのまま使える
  }
})();
`;

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

// A tab opened before a deploy can ask for chunks the new version no longer serves. Reload once,
// after pages save their drafts as they do for a language switch, instead of leaving it broken.
const staleChunkReloadScript = `
(() => {
  const reload = () => {
    try {
      const last = Number(sessionStorage.getItem('nittei-chunk-reload') || 0);
      if (Date.now() - last < 60000) return;
      sessionStorage.setItem('nittei-chunk-reload', String(Date.now()));
    } catch {
      return;
    }
    const save = new CustomEvent(${JSON.stringify(LANGUAGE_SWITCH_EVENT)}, { cancelable: true, detail: ${JSON.stringify(RELOAD_DETAIL)} });
    if (window.dispatchEvent(save)) location.reload();
  };
  addEventListener('error', (event) => {
    const el = event.target;
    const url = el instanceof HTMLScriptElement ? el.src
      : el instanceof HTMLLinkElement && el.rel === 'stylesheet' ? el.href : '';
    if (url.includes('/_next/static/')) reload();
  }, true);
  addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    if (/ChunkLoadError|Loading (CSS )?chunk .+ failed/.test(String(reason && reason.name) + ' ' + String(reason && reason.message))) reload();
  });
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
        <script dangerouslySetInnerHTML={{ __html: moveFromPreviousSiteScript }} />
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <script dangerouslySetInnerHTML={{ __html: staleChunkReloadScript }} />
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
          {children}
          <ThemeToggle />
        </LocaleProvider>
        {/* テスト用のビルド（tests/server.mjs）には入れない。手元では Cloudflare に送れずエラーになるため */}
        {process.env.NODE_ENV === "production" && !process.env.NITTEI_TEST_DIST_DIR && (
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
