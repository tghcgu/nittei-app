import { expect, test } from '@playwright/test'
import { getI18n } from '../lib/i18n'

for (const locale of ['ja', 'en'] as const) {
  test(`${locale}: a missing event or page explains itself and links onward`, async ({ page }) => {
    const { t, path } = getI18n(locale)
    // an event that was deleted or mistyped, and URLs that match no page at all
    for (const missing of ['/e/no-such-event', '/no-such-page', '/deeper/missing/path']) {
      const response = await page.goto(path(missing))
      expect(response!.status(), missing).toBe(404)
      await expect(page.locator('html')).toHaveAttribute('lang', locale)
      await expect(page.getByRole('heading', { level: 1, name: t('ページが見つかりません'), exact: true })).toBeVisible()
      await expect(page.getByText(t('URLが正しいかご確認ください。最後の更新から1年が経過したイベントは、自動的に削除されます。'), { exact: true })).toBeVisible()
      await expect(page.getByRole('link', { name: t('新しいイベントを作成する'), exact: true })).toHaveAttribute('href', path('/'))
      await expect(page.getByRole('link', { name: t('ページ表示履歴'), exact: true })).toHaveAttribute('href', path('/history'))
    }
    await page.getByRole('link', { name: t('新しいイベントを作成する'), exact: true }).click()
    await expect(page.locator('[data-calendar-date]').first()).toBeVisible()
  })
}

test('pages, files and API routes are not swallowed by the catch-all pages', async ({ request }) => {
  for (const url of ['/', '/en', '/history', '/en/terms', '/robots.txt', '/sitemap.xml', '/manifest.webmanifest', '/en/manifest.webmanifest', '/favicon.ico', '/icon.png']) {
    expect((await request.get(url)).status(), url).toBe(200)
  }
})
