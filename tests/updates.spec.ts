import { expect, test } from '@playwright/test'
import { getI18n } from '../lib/i18n'
import { updates } from '../lib/updates'

test('release notes are dated, newest first, and translated', () => {
  const dates = updates.map(entry => entry.date)
  expect(dates).toEqual([...dates].sort().reverse())
  expect(new Set(dates).size).toBe(dates.length)
  for (const entry of updates) {
    expect(new Date(entry.date).toISOString().slice(0, 10)).toBe(entry.date)
    expect(entry.changes.length).toBeGreaterThan(0)
    for (const text of [entry.title, ...entry.changes]) {
      expect(getI18n('en').t(text)).not.toBe(text)
    }
  }
})

for (const locale of ['ja', 'en'] as const) {
  test(`${locale}: release history, language links, metadata, and responsive themes`, async ({ page, request }) => {
    const { t, path } = getI18n(locale)
    const other = getI18n(locale === 'ja' ? 'en' : 'ja')
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    const response = await page.goto(path('/updates'))
    expect(response?.status()).toBe(200)
    await expect(page.getByRole('heading', { level: 1, name: t('更新履歴'), exact: true })).toBeVisible()
    await expect(page).toHaveTitle(new RegExp(t('更新履歴')))
    await expect(page.locator('html')).toHaveAttribute('lang', locale)
    await expect(page.locator('link[rel=canonical]')).toHaveAttribute('href', 'https://nittei-app.qoj.workers.dev' + path('/updates'))
    await expect(page.locator('link[rel=alternate][hreflang=en]')).toHaveAttribute('href', /\/en\/updates$/)
    await expect(page.locator('article')).toHaveCount(updates.length)
    expect(await page.locator('time').evaluateAll(nodes => nodes.map(node => node.getAttribute('datetime')))).toEqual(updates.map(entry => entry.date))
    for (const entry of updates) {
      const article = page.locator(`#update-${entry.date}`)
      await expect(article.getByRole('heading', { level: 2 })).toHaveText(t(entry.title))
      for (const change of entry.changes) await expect(article).toContainText(t(change))
    }
    expect(await page.locator('main img').evaluate(img => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      await page.evaluate(() => window.scrollTo(0, 0))
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
      const theme = (await page.locator('.theme-toggle').boundingBox())!
      const back = (await page.getByRole('link', { name: t('← 日程組 トップへ'), exact: true }).boundingBox())!
      expect(back.y).toBeGreaterThanOrEqual(theme.y + theme.height)
      await page.screenshot({ path: `test-results/updates-${locale}-${width}.png`, fullPage: true })
    }
    await page.setViewportSize({ width: 390, height: 900 })
    await page.locator('.theme-toggle').click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await page.screenshot({ path: `test-results/updates-${locale}-dark.png`, fullPage: true, animations: 'disabled' })
    await page.goto(path('/updates') + '#update-2026-09-12')
    await page.getByRole('link', { name: locale === 'ja' ? 'English' : '日本語', exact: true }).click()
    await expect(page).toHaveURL(new RegExp(other.path('/updates') + '#update-2026-09-12$'))
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(other.t('更新履歴'))
    await page.getByRole('link', { name: other.t('← 日程組 トップへ'), exact: true }).click()
    await expect(page.locator('[data-calendar-date]').first()).toBeVisible()
    const sitemap = await request.get('/sitemap.xml')
    expect(sitemap.ok()).toBe(true)
    expect(await sitemap.text()).toContain('https://nittei-app.qoj.workers.dev' + path('/updates'))
    expect(errors).toEqual([])
  })

  test(`${locale}: home and response links add no footer height`, async ({ page, request }) => {
    const { t, path } = getI18n(locale)
    const shareId = `updates-${locale}`
    const seeded = await request.post('http://127.0.0.1:54329/rest/v1/events', {
      data: { share_id: shareId, name: 'Updates footer' },
    })
    expect(seeded.ok()).toBe(true)
    for (const route of ['/', `/e/${shareId}`]) {
      await page.goto(path(route))
      const link = page.getByRole('link', { name: t('更新履歴'), exact: true })
      await expect(link).toHaveCount(1)
      await expect(link).toHaveAttribute('href', path('/updates'))
      for (const width of [320, 390, 1440]) {
        await page.setViewportSize({ width, height: 900 })
        const geometry = await link.evaluate(anchor => {
          const row = anchor.parentElement!
          const separator = anchor.previousElementSibling as HTMLElement
          const height = row.getBoundingClientRect().height
          anchor.style.display = 'none'
          separator.style.display = 'none'
          const before = row.getBoundingClientRect().height
          anchor.removeAttribute('style')
          separator.removeAttribute('style')
          return { height, before, scroll: document.documentElement.scrollWidth }
        })
        expect(geometry.height).toBeLessThanOrEqual(geometry.before)
        expect(geometry.scroll).toBeLessThanOrEqual(width)
      }
      await link.click()
      await expect(page.getByRole('heading', { level: 1, name: t('更新履歴'), exact: true })).toBeVisible()
    }
  })
}
