import type { Metadata } from 'next'
import { siteUrl } from '@/lib/site'
import { getI18n, localizedPath, type Locale, type MessageKey } from './index'

export const englishTitle = 'Nitteigumi - Free Scheduling Polls'
export const englishDescription = 'Find a date together. Create an event, share a link, and collect availability without accounts. Free scheduling polls with calendar imports.'

// Static files in public/, so icons never run the Worker.
// favicon.ico is added by its file convention; these cover larger sizes and the iPhone home screen.
export const appIcons = {
  icon: [{ url: '/icon.png', type: 'image/png', sizes: '512x512' }],
  apple: [{ url: '/apple-touch-icon.png', sizes: '180x180' }],
}

export function localizedMetadata(locale: Locale, pathname = '/', title?: MessageKey, description?: MessageKey): Metadata {
  const { t } = getI18n(locale)
  const url = localizedPath(pathname, locale)
  return {
    metadataBase: new URL(siteUrl),
    title: title ? t(title) : { default: englishTitle, template: '%s | Nitteigumi' },
    applicationName: 'Nitteigumi',
    manifest: '/en/manifest.webmanifest',
    appleWebApp: { capable: true, title: 'Nitteigumi', statusBarStyle: 'black-translucent' },
    description: description ? t(description) : englishDescription,
    alternates: {
      canonical: url,
      languages: { ja: localizedPath(pathname, 'ja'), en: localizedPath(pathname, 'en'), 'x-default': localizedPath(pathname, 'ja') },
    },
    // Shared links show text only. The large preview image was dropped on 2026-10-03.
    openGraph: {
      title: title ? t(title) : englishTitle,
      description: description ? t(description) : englishDescription,
      url,
      siteName: 'Nitteigumi', locale: 'en_US', type: 'website',
    },
    twitter: {
      card: 'summary', title: title ? t(title) : englishTitle, description: description ? t(description) : englishDescription,
    },
    icons: appIcons,
  }
}
