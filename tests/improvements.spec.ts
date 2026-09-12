import { expect, test } from '@playwright/test'
import { getI18n } from '../lib/i18n'

const overnight = Buffer.from([
  'BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT', 'UID:overnight-review',
  'DTSTART:20260915T233000', 'DTEND:20260916T003000', 'END:VEVENT', 'END:VCALENDAR',
].join('\r\n'))

for (const locale of ['ja', 'en'] as const) {
  test(`${locale}: overnight import and language changes keep drafts and undo`, async ({ page }) => {
    const { t, path } = getI18n(locale)
    const other = getI18n(locale === 'ja' ? 'en' : 'ja')
    const away = locale === 'ja' ? 'English' : '\u65e5\u672c\u8a9e'
    const back = locale === 'ja' ? '\u65e5\u672c\u8a9e' : 'English'
    const name = `Overnight draft ${locale}`
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(path('/'))
    await expect(page.locator('[data-calendar-date]').first()).toBeVisible()
    await page.getByPlaceholder(t('\u4f8b\uff1a\u307f\u3093\u306a\u3067\u3054\u98ef')).fill(name)
    await page.locator('.candidate-default-times input').first().fill('23:00')
    await page.locator('.candidate-default-times input').last().fill('01:00')
    await page.getByRole('button', { name: t('\ud83d\udcc5 \u7bc4\u56f2\u3067\u8ffd\u52a0'), exact: true }).click()
    const dialog = page.locator('.fixed.inset-0')
    await dialog.locator('input[type=date]').first().fill('2026-09-15')
    await dialog.locator('input[type=date]').last().fill('2026-09-15')
    await dialog.getByRole('button', { name: t('{0}\u65e5\u3092\u8ffd\u52a0', 1), exact: true }).click()
    await expect(page.locator('.candidate-row')).toHaveCount(1)
    await page.getByRole('link', { name: away, exact: true }).click()
    await expect(page.getByPlaceholder(other.t('\u4f8b\uff1a\u307f\u3093\u306a\u3067\u3054\u98ef'))).toHaveValue(name)
    await expect(page.locator('.candidate-row input[type=time]').first()).toHaveValue('23:00')
    await expect(page.locator('.candidate-row input[type=time]').last()).toHaveValue('01:00')
    await page.getByRole('button', { name: other.t('\u21b6 \u623b\u3059'), exact: true }).click()
    await expect(page.locator('.candidate-row')).toHaveCount(0)
    await page.getByRole('button', { name: other.t('\u21b7 \u9032\u3080'), exact: true }).click()
    await expect(page.locator('.candidate-row')).toHaveCount(1)
    await page.locator('input[type=file]').setInputFiles({ name: 'overnight.ics', mimeType: 'text/calendar', buffer: overnight })
    await expect(page.locator('.candidate-row')).toHaveCount(0)
    await page.getByRole('button', { name: other.t('\u21b6 \u623b\u3059'), exact: true }).click()
    await expect(page.locator('.candidate-row')).toHaveCount(1)
    await page.getByRole('button', { name: other.t('\u4f5c\u6210\u3059\u308b'), exact: true }).first().click()
    await page.waitForURL(/\/e\/[a-z0-9]+$/)
    await page.getByPlaceholder(other.t('\u4f8b\uff1a\u5c71\u7530')).fill('Draft participant')
    await page.locator('[data-answer-candidate-id][data-answer-value="-"]').first().click()
    await page.getByPlaceholder(other.t('\u30e1\u30e2(\u4efb\u610f)'), { exact: true }).first().fill('After midnight')
    await page.getByRole('link', { name: back, exact: true }).click()
    await expect(page.getByPlaceholder(t('\u4f8b\uff1a\u5c71\u7530'))).toHaveValue('Draft participant')
    await expect(page.getByPlaceholder(t('\u30e1\u30e2(\u4efb\u610f)'), { exact: true }).first()).toHaveValue('After midnight')
    await page.locator('input[type=file]').setInputFiles({ name: 'overnight.ics', mimeType: 'text/calendar', buffer: overnight })
    await expect(page.locator('[data-answer-candidate-id][data-answer-value="\u2715"]').first()).toHaveClass(/bg-stone-100/)
    expect(errors).toEqual([])
  })
}

test('English month action fits one line on mobile without widening the page', async ({ page }) => {
  await page.goto('/en')
  const button = page.getByRole('button', { name: /Select remaining days/ })
  await expect(button).toBeVisible()
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    const geometry = await button.evaluate(el => {
      const range = document.createRange()
      range.selectNodeContents(el)
      return { lines: range.getClientRects().length, scroll: document.documentElement.scrollWidth }
    })
    expect(geometry.lines).toBe(1)
    expect(geometry.scroll).toBeLessThanOrEqual(width)
    await page.screenshot({ path: `test-results/improved-home-en-${width}.png` })
  }
})

test('failed draft storage cancels language navigation', async ({ page }) => {
  await page.goto('/en')
  await expect(page.locator('[data-calendar-date]').first()).toBeVisible()
  await page.getByPlaceholder('e.g. Dinner with friends').fill('Keep this draft')
  await page.evaluate(() => { Object.defineProperty(window, 'sessionStorage', { get() { throw new Error('Blocked storage') } }) })
  const alert = page.waitForEvent('dialog')
  const click = page.getByRole('link', { name: '\u65e5\u672c\u8a9e', exact: true }).click()
  const message = await alert
  expect(message.type()).toBe('alert')
  await message.accept()
  await click
  await expect(page).toHaveURL(/\/en$/)
  await expect(page.getByPlaceholder('e.g. Dinner with friends')).toHaveValue('Keep this draft')
})
