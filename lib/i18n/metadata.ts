import type { Metadata } from 'next'
import { siteUrl } from '@/lib/site'
import { getI18n, localizedPath, type Locale, type MessageKey } from './index'

export const englishTitle = 'Nitteigumi - Free Scheduling Polls'
export const englishDescription = 'Find a date together. Create an event, share a link, and collect availability without accounts. Free scheduling polls with calendar imports.'

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
    openGraph: {
      title: title ? t(title) : englishTitle,
      description: description ? t(description) : englishDescription,
      url,
      siteName: 'Nitteigumi', locale: 'en_US', type: 'website',
    },
    twitter: { card: 'summary', title: title ? t(title) : englishTitle, description: description ? t(description) : englishDescription },
    icons: { icon: [{ url: '/favicon.ico' }, { url: '/icon.png', type: 'image/png' }], apple: '/icon.png' },
  }
}
