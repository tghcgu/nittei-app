import { expect, test } from '@playwright/test'
import { getI18n } from '../lib/i18n'

for (const locale of ['ja', 'en'] as const) {
  test(`${locale}: wrapped names keep their line count without empty column width`, async ({ page, request }) => {
    const { t, path } = getI18n(locale)
    const api = 'http://127.0.0.1:54329/rest/v1'
    const shareId = `compact-names-${locale}`
    const names = ['A', '山田 太郎(Motoharu Example)', '青山', 'LongNameWithoutSpaces'.repeat(8), 'Alex \u05e9\u05dc\u05d5\u05dd Smith']
    const [event] = await (await request.post(`${api}/events`, { data: { share_id: shareId, name: 'Compact names' } })).json()
    const candidates = await (await request.post(`${api}/candidates`, {
      data: Array.from({ length: 3 }, (_, index) => ({ event_id: event.id, date: `2026-10-0${index + 1}`, sort_order: index })),
    })).json()
    for (const name of names) {
      const [response] = await (await request.post(`${api}/responses`, { data: { event_id: event.id, name } })).json()
      expect((await request.post(`${api}/answers`, {
        data: candidates.map((candidate: { id: string }) => ({ response_id: response.id, candidate_id: candidate.id, value: '○' })),
      })).ok()).toBe(true)
    }
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(path(`/e/${shareId}`))
    const results = page.locator('#responses-section')
    const labels = results.locator('.response-name')
    await expect(labels).toHaveCount(names.length)
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      for (const theme of ['light', 'dark']) {
        if (await page.locator('html').getAttribute('data-theme') !== theme) await page.locator('.theme-toggle').click()
        for (const counts of [true, false]) {
          await results.getByRole('checkbox', { name: t('集計'), exact: true }).setChecked(counts)
          const geometry = await labels.evaluateAll(elements => elements.map(element => {
            const label = element as HTMLElement
            const cell = label.parentElement!
            const range = document.createRange()
            range.selectNodeContents(label)
            const lines = [...range.getClientRects()]
            const widestLine = range.getBoundingClientRect().width
            const labelBox = label.getBoundingClientRect()
            const cellBox = cell.getBoundingClientRect()
            const editWidth = cell.querySelector('button')!.getBoundingClientRect().width
            const savedWidth = label.style.width
            label.style.width = ''
            const originalLines = [...range.getClientRects()]
            const originalWidth = label.getBoundingClientRect().width
            label.style.width = savedWidth
            return {
              width: labelBox.width, cellWidth: cellBox.width, editWidth, widestLine,
              lines: lines.length, originalLines: originalLines.length, originalWidth,
              fits: lines.every(line => line.left >= cellBox.left && line.right <= cellBox.right),
            }
          }))
          for (const item of geometry) {
            expect(item.width - item.widestLine).toBeGreaterThanOrEqual(0)
            expect(item.width - item.widestLine).toBeLessThan(1.1)
            expect(item.cellWidth).toBeLessThanOrEqual(Math.max(item.width, item.editWidth) + 1.1)
            expect(item.lines).toBe(item.originalLines)
            expect(item.fits).toBe(true)
          }
          expect(geometry[1].originalWidth - geometry[1].width).toBeGreaterThan(20)
          expect(geometry[0].cellWidth).toBeLessThan(30)
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
        }
        await results.evaluate(element => element.scrollIntoView({ block: 'start' }))
        await page.screenshot({ path: `test-results/compact-names-${locale}-${width}-${theme}.png`, animations: 'disabled' })
      }
    }
    const mixed = labels.nth(1)
    const before = (await mixed.boundingBox())!.width
    await mixed.locator('..').getByRole('button', { name: t('編集'), exact: true }).click()
    await page.getByPlaceholder(t('例：山田')).fill('B')
    await page.getByRole('button', { name: t('回答を更新'), exact: true }).click()
    await expect(mixed).toHaveText('B')
    expect((await mixed.boundingBox())!.width).toBeLessThan(15)
    await mixed.locator('..').getByRole('button', { name: t('編集'), exact: true }).click()
    await page.getByPlaceholder(t('例：山田')).fill(names[1])
    await page.getByRole('button', { name: t('回答を更新'), exact: true }).click()
    await expect(mixed).toHaveText(names[1])
    expect((await mixed.boundingBox())!.width).toBe(before)
    await results.getByRole('button', { name: t('╠═╣ 横'), exact: true }).click()
    await expect(results.locator('table')).toContainText(names[1])
    await results.getByRole('button', { name: t('縦 ╦'), exact: true }).click()
    expect((await mixed.boundingBox())!.width).toBe(before)
    expect(errors).toEqual([])
  })
}
