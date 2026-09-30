import { expect, test } from '@playwright/test'
import { getI18n } from '../lib/i18n'

const api = 'http://127.0.0.1:54329/rest/v1'

for (const locale of ['ja', 'en'] as const) {
  test(`${locale}: shared links carry a preview image and the app icons`, async ({ page, request }) => {
    const { path } = getI18n(locale)
    const shareId = `share-preview-${locale}`
    expect((await request.post(`${api}/events`, { data: { share_id: shareId, name: 'Preview' } })).ok()).toBe(true)
    const image = locale === 'en' ? '/og-en.png' : '/og.png'
    // the home page, an event page with its own title and description, and a plain sub-page
    for (const route of ['/', `/e/${shareId}`, '/history']) {
      await page.goto(path(route))
      const content = (selector: string) => page.locator(selector).getAttribute('content')
      expect(new URL((await content('meta[property="og:image"]'))!).pathname, route).toBe(image)
      expect(await content('meta[property="og:image:width"]'), route).toBe('1200')
      expect(await content('meta[property="og:image:height"]'), route).toBe('630')
      expect(await content('meta[name="twitter:card"]'), route).toBe('summary_large_image')
      expect(new URL((await content('meta[name="twitter:image"]'))!).pathname, route).toBe(image)
      await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href', '/apple-touch-icon.png')
      await expect(page.locator('link[rel="icon"][type="image/png"]')).toHaveAttribute('href', '/icon.png')
    }
  })
}

test('preview images and icons are small static files listed in both manifests', async ({ request }) => {
  const files: [string, number][] = [
    ['/og.png', 60_000], ['/og-en.png', 60_000], ['/icon.png', 100_000], ['/icons/icon-192.png', 20_000], ['/apple-touch-icon.png', 20_000],
  ]
  for (const [url, maxBytes] of files) {
    const response = await request.get(url)
    expect(response.status(), url).toBe(200)
    expect(response.headers()['content-type'], url).toBe('image/png')
    expect((await response.body()).length, url).toBeLessThan(maxBytes)
  }
  for (const url of ['/manifest.webmanifest', '/en/manifest.webmanifest']) {
    const manifest = await (await request.get(url)).json() as { icons: { src: string; sizes: string }[] }
    expect(manifest.icons.map(icon => [icon.src, icon.sizes]), url).toEqual([['/icons/icon-192.png', '192x192'], ['/icon.png', '512x512']])
  }
})
