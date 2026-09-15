import { expect, test } from '@playwright/test'
import { getI18n } from '../lib/i18n'
import { siteUrl } from '../lib/site'

for (const locale of ['ja', 'en'] as const) {
  test(`${locale}: optional sharing is compact and never includes event details`, async ({ page, context, request }) => {
    const { t, path } = getI18n(locale)
    const shareId = `service-share-${locale}`
    const eventName = 'PRIVATE-EVENT-DO-NOT-SHARE'
    const seeded = await request.post('http://127.0.0.1:54329/rest/v1/events', {
      data: { share_id: shareId, name: eventName },
    })
    expect(seeded.ok()).toBe(true)
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    let intentRequests = 0
    await context.route('https://x.com/intent/tweet?**', route => {
      intentRequests++
      return route.fulfill({ contentType: 'text/html', body: '<title>Share destination</title>' })
    })

    for (const route of ['/', `/e/${shareId}`, '/updates']) {
      await page.goto(path(route))
      const link = page.getByRole('link', { name: t('よければXでシェア'), exact: true })
      await expect(link).toHaveCount(1)
      const href = (await link.getAttribute('href'))!
      const intent = new URL(href)
      expect(intent.origin + intent.pathname).toBe('https://x.com/intent/tweet')
      expect(intent.searchParams.get('url')).toBe(siteUrl + path('/'))
      expect(intent.searchParams.get('text')).toBe(locale === 'ja' ? 'これめっちゃつかいやすい！！' : 'This is so easy to use!!')
      expect(intent.searchParams.get('lang')).toBe(locale)
      expect([...intent.searchParams.keys()].sort()).toEqual(['lang', 'text', 'url'])
      expect(decodeURIComponent(href)).not.toContain(shareId)
      expect(decodeURIComponent(href)).not.toContain(eventName)
      await expect(link).toHaveAttribute('target', '_blank')
      await expect(link).toHaveAttribute('rel', 'noopener noreferrer')
      await expect(link).toHaveAttribute('title', t('Xの投稿画面を開く'))
      expect(await link.evaluate(anchor => anchor.parentElement!.nextElementSibling)).toBeNull()
      if (route.startsWith('/e/')) {
        const info = page.getByText(t('【このページについての情報】'), { exact: true }).locator('..')
        await expect(info).toBeVisible()
        await expect(info.locator('a')).toHaveCount(0)
      }
      for (const width of [320, 390, 1440]) {
        await page.setViewportSize({ width, height: 900 })
        await link.scrollIntoViewIfNeeded()
        const geometry = await link.evaluate(anchor => {
          const row = anchor.parentElement!
          const separator = anchor.previousElementSibling as HTMLElement
          const height = row.getBoundingClientRect().height
          const rect = anchor.getBoundingClientRect()
          anchor.style.display = separator.style.display = 'none'
          const before = row.getBoundingClientRect().height
          anchor.removeAttribute('style')
          separator.removeAttribute('style')
          return { height, before, scroll: document.documentElement.scrollWidth, left: rect.left, right: rect.right }
        })
        expect(geometry.height).toBeLessThanOrEqual(geometry.before)
        expect(geometry.scroll).toBeLessThanOrEqual(width)
        expect(geometry.left).toBeGreaterThanOrEqual(0)
        expect(geometry.right).toBeLessThanOrEqual(width)
        await page.screenshot({ path: `test-results/service-share-${locale}-${route === '/' ? 'home' : route === '/updates' ? 'updates' : 'event'}-${width}.png` })
      }
    }

    expect(intentRequests).toBe(0)
    const originalUrl = page.url()
    const popupPromise = page.waitForEvent('popup')
    await page.getByRole('link', { name: t('よければXでシェア'), exact: true }).click()
    const popup = await popupPromise
    await popup.waitForLoadState('domcontentloaded')
    expect(intentRequests).toBe(1)
    expect(await popup.evaluate(() => window.opener)).toBeNull()
    expect(page.url()).toBe(originalUrl)
    await popup.close()
    expect(errors).toEqual([])
  })
}
