import type { MetadataRoute } from 'next'
import { siteUrl } from '@/lib/site'
import { updates } from '@/lib/updates'

export default function sitemap(): MetadataRoute.Sitemap {
  const pages: MetadataRoute.Sitemap = [
    {
      url: siteUrl,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 1,
    },
    {
      url: `${siteUrl}/privacy`,
      lastModified: new Date(),
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: `${siteUrl}/terms`,
      lastModified: new Date(),
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: `${siteUrl}/contact`,
      lastModified: new Date(),
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: `${siteUrl}/updates`,
      lastModified: new Date(`${updates[0].date}T00:00:00+09:00`),
      changeFrequency: 'weekly',
      priority: 0.4,
    },
  ]
  return pages.flatMap((page) => {
    const pathname = page.url.slice(siteUrl.length)
    const englishUrl = `${siteUrl}/en${pathname}`
    const alternates = { languages: { ja: page.url, en: englishUrl } }
    return [{ ...page, alternates }, { ...page, url: englishUrl, alternates }]
  })
}
