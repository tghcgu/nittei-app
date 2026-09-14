import { expect, test } from '@playwright/test'
import { getI18n } from '../lib/i18n'

for (const locale of ['ja', 'en'] as const) {
  test(`${locale}: results repeat event details without widening or scrolling them with the table`, async ({ page, request }) => {
    const { t, path } = getI18n(locale)
    const api = 'http://127.0.0.1:54329/rest/v1'
    const shareId = `results-details-${locale}`
    const name = 'EventNameWithoutSpaces'.repeat(6)
    const description = '○: Available\n△: Maybe\n✕: Unavailable\n\n' + 'DescriptionWithoutSpaces'.repeat(24)
    const seeded = await request.post(`${api}/events`, { data: { share_id: shareId, name, description } })
    expect(seeded.ok()).toBe(true)
    const [event] = await seeded.json()
    const candidates = await (await request.post(`${api}/candidates`, {
      data: Array.from({ length: 12 }, (_, index) => ({
        event_id: event.id, date: `2026-10-${String(index + 1).padStart(2, '0')}`, sort_order: index,
      })),
    })).json()
    const [response] = await (await request.post(`${api}/responses`, { data: { event_id: event.id, name: 'A' } })).json()
    const answers = await request.post(`${api}/answers`, {
      data: candidates.map((candidate: { id: string }) => ({ response_id: response.id, candidate_id: candidate.id, value: '○' })),
    })
    expect(answers.ok()).toBe(true)
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(path(`/e/${shareId}`))
    const results = page.locator('#responses-section')
    const details = results.locator('.response-event-details')
    const title = details.getByRole('heading', { level: 3 })
    await expect(title).toHaveText(name)
    expect(await details.locator('p').textContent()).toBe(description)
    await expect(details.locator('p')).toHaveCSS('white-space', 'pre-wrap')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(name)
    await expect(results.locator('.response-results-table')).toContainText('A')

    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      for (const layout of ['v', 'h'] as const) {
        await results.getByRole('button', { name: t(layout === 'v' ? '縦 ╦' : '╠═╣ 横'), exact: true }).click()
        const geometry = await details.evaluate(element => {
          const panel = element.parentElement!
          const table = panel.querySelector('table')!
          const box = element.getBoundingClientRect()
          const width = panel.getBoundingClientRect().width
          const tableWidth = table.getBoundingClientRect().width
          const textFits = [...element.children].every(child => {
            const range = document.createRange()
            range.selectNodeContents(child)
            return [...range.getClientRects()].every(rect => rect.left >= box.left - 1 && rect.right <= box.right + 1)
          })
          element.style.display = 'none'
          const withoutDetails = panel.getBoundingClientRect().width
          const tableWithoutDetails = table.getBoundingClientRect().width
          element.removeAttribute('style')
          return { width, withoutDetails, tableWidth, tableWithoutDetails, textFits }
        })
        expect(Math.abs(geometry.width - geometry.withoutDetails)).toBeLessThan(1)
        expect(Math.abs(geometry.tableWidth - geometry.tableWithoutDetails)).toBeLessThan(1)
        expect(geometry.textFits).toBe(true)
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
        const scroller = results.locator('table').locator('..')
        const before = (await title.boundingBox())!
        await scroller.evaluate(element => { element.scrollLeft = element.scrollWidth })
        if (layout === 'h' && width === 320) expect(await scroller.evaluate(element => element.scrollLeft)).toBeGreaterThan(0)
        expect(Math.abs((await title.boundingBox())!.x - before.x)).toBeLessThan(1)
        const tableBox = (await results.locator('table').boundingBox())!
        const detailsBox = (await details.boundingBox())!
        expect(tableBox.y).toBeGreaterThanOrEqual(detailsBox.y + detailsBox.height)
        await results.evaluate(element => element.scrollIntoView({ block: 'start' }))
        await page.screenshot({ path: `test-results/results-details-${locale}-${width}-${layout}.png` })
      }
    }
    await page.locator('.theme-toggle').click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await results.evaluate(element => element.scrollIntoView({ block: 'start' }))
    await page.screenshot({ path: `test-results/results-details-${locale}-dark.png` })
    await results.getByRole('button', { name: t('↑ 回答へ'), exact: true }).click()
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0)
    expect(errors).toEqual([])
  })

  test(`${locale}: empty results still show the name and omit an empty description`, async ({ page, request }) => {
    const { t, path } = getI18n(locale)
    for (const [index, description] of [null, '', '  \n  '].entries()) {
      const shareId = `empty-details-${locale}-${index}`
      const seeded = await request.post('http://127.0.0.1:54329/rest/v1/events', {
        data: { share_id: shareId, name: 'Short event', description },
      })
      expect(seeded.ok()).toBe(true)
      await page.goto(path(`/e/${shareId}`))
      const results = page.locator('#responses-section')
      await expect(results.getByRole('heading', { level: 3 })).toHaveText('Short event')
      await expect(results.locator('.response-event-details p')).toHaveCount(0)
      await expect(results.getByText(t('まだ回答がありません。'), { exact: true })).toBeVisible()
      await expect(results.locator('input, textarea')).toHaveCount(0)
    }
  })
}
