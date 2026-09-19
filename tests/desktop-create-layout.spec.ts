import { expect, test } from '@playwright/test'
import { getI18n } from '../lib/i18n'

for (const locale of ['ja', 'en'] as const) {
  test(`${locale}: desktop date tools sit beside the form without resetting mobile input`, async ({ page }) => {
    const { t, path } = getI18n(locale)
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.clock.setFixedTime(new Date('2026-09-19T12:00:00'))
    await page.goto(path('/'))
    const form = page.locator('form')
    const calendar = page.locator('.home-calendar')
    const name = page.getByPlaceholder(t('例：みんなでご飯'))
    const description = page.getByPlaceholder(t('場所や詳細など'))
    await expect(calendar.locator('[data-calendar-date]').first()).toBeVisible()
    await name.fill('Weekend plans')
    await description.fill('First line\nSecond line')
    await page.locator('.candidate-default-times input').first().fill('18:30')
    for (const day of [21, 22, 23]) await calendar.locator(`[data-calendar-date="2026-09-${day}"]`).click()
    await calendar.getByRole('button', { name: t('{0}日を追加', 3), exact: true }).click()
    await expect(page.locator('.candidate-row')).toHaveCount(3)

    for (const width of [320, 390, 768, 1023, 1024, 1280, 1440, 1920]) {
      await page.setViewportSize({ width, height: 900 })
      const desktop = width >= 1024
      await expect(form).toHaveCSS('display', desktop ? 'grid' : 'block')
      await expect(name).toHaveValue('Weekend plans')
      await expect(description).toHaveValue('First line\nSecond line')
      await expect(page.locator('.candidate-row')).toHaveCount(3)
      await expect(page.locator('.candidate-row input[type=time]').first()).toHaveValue('18:30')
      const nameBox = (await name.boundingBox())!
      const calBox = (await calendar.boundingBox())!
      const timesBox = (await page.locator('.candidate-default-times').locator('..').boundingBox())!
      if (desktop) {
        const toolsBox = (await page.locator('.home-date-tools').boundingBox())!
        const detailsBox = (await page.locator('.home-details').boundingBox())!
        const listBox = (await page.locator('.home-candidate-list').boundingBox())!
        const submitBox = (await page.locator('.home-submit').boundingBox())!
        const shellBox = (await page.locator('.home-desktop-layout').boundingBox())!
        expect(detailsBox.x - toolsBox.x - toolsBox.width).toBe(24)
        expect(Math.abs(detailsBox.y - toolsBox.y)).toBeLessThan(1)
        expect(listBox.x).toBe(detailsBox.x)
        expect(submitBox.x).toBe(detailsBox.x)
        expect(calBox.x + calBox.width).toBeLessThan(nameBox.x)
        expect(shellBox.width).toBe(960)
        expect(shellBox.x + shellBox.width / 2).toBe(width / 2)
        expect(timesBox.y).toBe(toolsBox.y)
      } else {
        expect(calBox.y).toBeGreaterThan(nameBox.y + nameBox.height)
        expect(timesBox.y + timesBox.height).toBeLessThan(calBox.y)
        await expect(page.locator('.home-date-tools')).toHaveCSS('display', 'contents')
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      for (const theme of ['light', 'dark']) {
        if (await page.locator('html').getAttribute('data-theme') !== theme) await page.locator('.theme-toggle').click()
        await page.evaluate(() => window.scrollTo(0, 0))
        await page.screenshot({ path: `test-results/desktop-create-${locale}-${width}-${theme}.png`, fullPage: true, animations: 'disabled' })
      }
    }
    await page.getByRole('button', { name: t('↶ 戻す'), exact: true }).click()
    await expect(page.locator('.candidate-row')).toHaveCount(0)
    await page.getByRole('button', { name: t('↷ 進む'), exact: true }).click()
    await expect(page.locator('.candidate-row')).toHaveCount(3)
    await expect(form.locator('input[type=text]')).toHaveCount(1)
    await expect(form.locator('textarea')).toHaveCount(1)
    expect(errors).toEqual([])
  })
}
