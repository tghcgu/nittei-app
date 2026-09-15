import { expect, test } from '@playwright/test'
import { getI18n } from '../lib/i18n'

for (const locale of ['ja', 'en'] as const) {
  test(`${locale}: compact forms preserve controls and keep adjacent sections close`, async ({ page, request }) => {
    const { t, path } = getI18n(locale)
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(path('/'))
    await expect(page.locator('[data-calendar-date]').first()).toBeVisible()
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      const form = page.locator('form')
      await expect(form.locator('textarea')).toHaveAttribute('rows', '2')
      await expect(form.locator('textarea')).toHaveCSS('font-size', '16px')
      expect((await form.locator('textarea').boundingBox())!.height).toBeLessThanOrEqual(70)
      await expect(form).toHaveCSS('padding-top', '8px')
      const panel = page.locator('.candidate-default-times').locator('..')
      await expect(panel).toHaveCSS('row-gap', '4px')
      await expect(panel).toHaveCSS('padding-top', '8px')
      await expect(panel).toHaveCSS('margin-bottom', '6px')
      expect((await page.locator('[data-calendar-date]').first().boundingBox())!.height).toBe(locale === 'en' && width <= 360 ? 32 : 36)
      expect((await form.locator('button[type=submit]').last().boundingBox())!.height).toBeGreaterThanOrEqual(44)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await page.screenshot({ path: `test-results/spacing-home-${locale}-${width}.png`, fullPage: true })
    }
    await page.setViewportSize({ width: 390, height: 900 })
    await page.getByRole('button', { name: t('📅 範囲で追加'), exact: true }).click()
    const modal = page.locator('.fixed.inset-0 > div')
    await expect(modal).toHaveCSS('padding-top', '12px')
    expect((await modal.boundingBox())!.height).toBeLessThan(250)
    await modal.screenshot({ path: `test-results/spacing-range-modal-${locale}.png` })
    await modal.getByRole('button', { name: t('キャンセル'), exact: true }).click()

    const api = 'http://127.0.0.1:54329/rest/v1'
    const shareId = `spacing-${locale}`
    const [event] = await (await request.post(`${api}/events`, {
      data: { share_id: shareId, name: 'Compact spacing', description: 'Line one\nLine two' },
    })).json()
    await request.post(`${api}/candidates`, {
      data: Array.from({ length: 3 }, (_, index) => ({ event_id: event.id, date: `2026-10-0${index + 1}`, time_label: '21:00', sort_order: index })),
    })
    await page.goto(path(`/e/${shareId}`))
    const form = page.locator('#answer-form')
    const results = page.locator('#responses-section')
    const info = page.getByText(t('【このページについての情報】'), { exact: true }).locator('..')
    await expect(info).toBeVisible()
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      const formBox = (await form.boundingBox())!
      const resultsBox = (await results.boundingBox())!
      const infoBox = (await info.boundingBox())!
      const footerBox = (await page.locator('.footer-links').boundingBox())!
      expect(resultsBox.y - formBox.y - formBox.height).toBeLessThanOrEqual(8)
      expect(infoBox.y - resultsBox.y - resultsBox.height).toBeLessThanOrEqual(8)
      expect(footerBox.y - infoBox.y - infoBox.height).toBeLessThanOrEqual(8)
      await expect(results).toHaveCSS('padding-top', '8px')
      await expect(results).toHaveCSS('padding-bottom', '8px')
      expect((await form.locator('.answer-inputs button').first().boundingBox())!.height).toBe(locale === 'en' && width <= 360 ? 28 : 32)
      expect((await form.locator('button[type=submit]').boundingBox())!.height).toBeGreaterThanOrEqual(44)
      const settings = form.getByRole('button', { name: new RegExp('^' + t('設定')) })
      const guide = form.getByRole('button', { name: new RegExp('^' + t('書き出し方法を見る')) })
      const settingsBox = (await settings.boundingBox())!
      const guideBox = (await guide.boundingBox())!
      expect(Math.abs(settingsBox.y + settingsBox.height / 2 - guideBox.y - guideBox.height / 2)).toBeLessThan(1)
      expect(guideBox.x).toBeGreaterThanOrEqual(settingsBox.x + settingsBox.width)
      await settings.click()
      await expect(settings).toHaveAttribute('aria-expanded', 'true')
      await guide.click()
      await expect(guide).toHaveAttribute('aria-expanded', 'true')
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await settings.click()
      await guide.click()
      await page.screenshot({ path: `test-results/spacing-response-${locale}-${width}.png`, fullPage: true })
    }
    await page.locator('.theme-toggle').click()
    await page.screenshot({ path: `test-results/spacing-response-${locale}-dark.png`, fullPage: true })
    expect(errors).toEqual([])
  })

  test(`${locale}: supporting pages use compact sections without header collisions`, async ({ page }) => {
    test.setTimeout(120000)
    const { t, path } = getI18n(locale)
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    for (const route of ['/updates', '/history', '/contact', '/terms', '/privacy']) {
      await page.goto(path(route))
      const heading = page.getByRole('heading', { level: 1 })
      const back = page.getByRole('link', { name: t('← 日程組 トップへ'), exact: true })
      await expect(heading).toBeVisible()
      for (const width of [320, 390, 1440]) {
        await page.setViewportSize({ width, height: 900 })
        await page.evaluate(() => window.scrollTo(0, 0))
        const themeBox = (await page.locator('.theme-toggle').boundingBox())!
        const backBox = (await back.boundingBox())!
        expect(backBox.x).toBeGreaterThanOrEqual(themeBox.x + themeBox.width)
        expect((await heading.boundingBox())!.y).toBeLessThanOrEqual(70)
        if (route === '/updates') {
          await expect(page.locator('article').first()).toHaveCSS('padding-top', '8px')
          await expect(page.locator('article').first()).toHaveCSS('padding-bottom', '8px')
        } else {
          await expect(heading.locator('..')).toHaveCSS('padding-top', '12px')
          for (const section of await page.locator('h2').all()) await expect(section).toHaveCSS('margin-top', '12px')
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
        await page.screenshot({ path: `test-results/spacing-${route.slice(1)}-${locale}-${width}.png` })
      }
      await page.locator('.theme-toggle').click()
      await page.screenshot({ path: `test-results/spacing-${route.slice(1)}-${locale}-theme.png` })
    }
    expect(errors).toEqual([])
  })
}
