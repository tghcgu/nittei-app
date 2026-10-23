import { expect, test } from '@playwright/test'
import { getI18n } from '../lib/i18n'

// a first visit: the notice has not been closed on this device yet
test.use({ storageState: { cookies: [], origins: [] } })

for (const locale of ['ja', 'en'] as const) {
  test(`${locale}: the notice about the new address sits on top until it is closed`, async ({ page }) => {
    const { t, path } = getI18n(locale)
    const notice = page.locator('.move-notice')
    await page.setViewportSize({ width: 320, height: 700 })
    await page.goto(path('/'))
    await expect(notice).toHaveText(t('日程組の住所が nitei.pages.dev に変わりました。ブックマークを登録し直してください。') + '×')
    // first on the page, with the theme button below it and nothing wider than the phone
    const box = (await notice.boundingBox())!
    expect(box.y).toBe(0)
    expect((await page.locator('.theme-toggle').boundingBox())!.y).toBeGreaterThanOrEqual(box.y + box.height)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
    const close = notice.getByRole('button', { name: t('お知らせを閉じる'), exact: true })
    const closeBox = (await close.boundingBox())!
    expect(Math.min(closeBox.width, closeBox.height)).toBeGreaterThanOrEqual(24)

    await close.click()
    await expect(notice).toBeHidden()
    expect(await page.evaluate(() => localStorage.getItem('nittei-move-notice'))).toBe('closed')
    // other pages hide it before they are drawn
    await page.goto(path('/updates'), { waitUntil: 'domcontentloaded' })
    await expect(page.locator('html')).toHaveAttribute('data-move-notice', 'closed')
    await expect(notice).toBeHidden()
  })
}
