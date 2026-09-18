import { expect, test } from '@playwright/test'
import { getI18n } from '../lib/i18n'

for (const locale of ['ja', 'en'] as const) {
  test(`${locale}: event titles are compact bold monochrome bands in both themes`, async ({ page, request }) => {
    const { path } = getI18n(locale)
    const api = 'http://127.0.0.1:54329/rest/v1'
    const name = locale === 'ja' ? 'みんなで集まる日' : 'Get together'
    const description = 'First line\nSecond line\n\nFinal line'
    const shareId = `event-title-${locale}`
    const seeded = await request.post(`${api}/events`, { data: { share_id: shareId, name, description } })
    expect(seeded.ok()).toBe(true)
    const [event] = await seeded.json()
    await request.post(`${api}/candidates`, {
      data: Array.from({ length: 3 }, (_, index) => ({ event_id: event.id, date: `2026-10-0${index + 1}`, sort_order: index })),
    })
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(path(`/e/${shareId}`))
    const heading = page.getByRole('heading', { level: 1 })
    const results = page.locator('#responses-section')
    const repeated = results.getByRole('heading', { level: 3 })
    await expect(heading).toHaveText(name)
    await expect(repeated).toHaveText(name)
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      for (const theme of ['light', 'dark']) {
        if (await page.locator('html').getAttribute('data-theme') !== theme) await page.locator('.theme-toggle').click()
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
        for (const title of [heading, repeated]) {
          await expect(title).toHaveCSS('color', theme === 'dark' ? 'rgb(255, 255, 255)' : 'rgb(17, 17, 17)')
          await expect(title).toHaveCSS('font-weight', '700')
          await expect(title).toHaveCSS('border-top-width', '1px')
          await expect(title).toHaveCSS('border-bottom-width', '1px')
          await expect(title).toHaveCSS('border-left-width', '3px')
          await expect(title).toHaveCSS('border-radius', '0px')
          const fullWidth = await title.evaluate(element => Math.abs(element.getBoundingClientRect().width - element.parentElement!.getBoundingClientRect().width))
          expect(fullWidth).toBeLessThan(1)
        }
        expect((await heading.boundingBox())!.height).toBeLessThanOrEqual(30)
        expect((await repeated.boundingBox())!.height).toBeLessThanOrEqual(22)
        expect((await heading.boundingBox())!.width).toBe(width - 32)
        expect(await heading.locator('..').locator('p').textContent()).toBe(description)
        expect(await results.locator('.response-event-details p').textContent()).toBe(description)
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
        await page.evaluate(() => window.scrollTo(0, 0))
        await page.screenshot({ path: `test-results/event-title-${locale}-${width}-${theme}.png`, animations: 'disabled' })
        await results.scrollIntoViewIfNeeded()
        await page.screenshot({ path: `test-results/event-title-results-${locale}-${width}-${theme}.png`, animations: 'disabled' })
      }
    }
    expect(errors).toEqual([])
  })
}
