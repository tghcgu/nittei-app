import { expect, test, type APIRequestContext } from '@playwright/test'
import type { AnswerChoiceSet } from '../lib/database.types'
import { getI18n } from '../lib/i18n'

const api = 'http://127.0.0.1:54329/rest/v1'

async function seed(request: APIRequestContext, shareId: string, choices: AnswerChoiceSet, zero = false) {
  const created = await request.post(`${api}/events`, {
    data: { share_id: shareId, name: 'Attendance highlights', answer_choices: choices },
  })
  expect(created.ok()).toBe(true)
  const [event] = await created.json()
  const candidates = await (await request.post(`${api}/candidates`, {
    data: Array.from({ length: 4 }, (_, index) => ({
      event_id: event.id, date: `2026-10-0${index + 1}`, time_label: '21:00', sort_order: index,
    })),
  })).json()
  const maybe = choices.includes('△') ? '△' : '✕'
  const values = zero
    ? [[maybe, '-', '✕'], ['✕', '-', maybe], ['-', maybe, '✕'], [maybe, '-', '✕']]
    : [['○', maybe, '✕'], [choices.includes('◎') ? '◎' : '○', '○', '-'], ['○', '○', '✕'], [maybe, '-', '✕']]
  for (const [index, name] of ['A', 'B', 'C'].entries()) {
    const [response] = await (await request.post(`${api}/responses`, { data: { event_id: event.id, name } })).json()
    expect((await request.post(`${api}/answers`, {
      data: candidates.map((candidate: { id: string }, date: number) => ({
        response_id: response.id, candidate_id: candidate.id, value: values[date][index],
      })),
    })).ok()).toBe(true)
  }
}

for (const locale of ['ja', 'en'] as const) {
  for (const [choiceIndex, choices] of (['○✕', '○△✕', '◎○△✕'] as const).entries()) {
    test(`${locale}: highlight tied best dates for ${choices} without changing table geometry`, async ({ page, request }) => {
      const { t, path, formatDate } = getI18n(locale)
      const shareId = `highlights-${locale}-${choiceIndex}`
      await seed(request, shareId, choices)
      const errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      await page.goto(path(`/e/${shareId}`))
      const results = page.locator('#responses-section')
      const table = results.locator('table')
      await expect(table).toContainText('C')
      for (const width of choices.includes('◎') ? [320, 390, 1440] : [390]) {
        await page.setViewportSize({ width, height: 900 })
        for (const theme of ['light', 'dark']) {
          if (await page.locator('html').getAttribute('data-theme') !== theme) await page.locator('.theme-toggle').click()
          for (const layout of ['v', 'h']) {
            await results.getByRole('button', { name: t(layout === 'v' ? '縦 ╦' : '╠═╣ 横'), exact: true }).click()
            await results.getByRole('checkbox', { name: t('集計'), exact: true }).check()
            const highlightedDates = table.locator('.response-best-candidate:not(.response-best-count)')
            await expect(highlightedDates).toHaveCount(2)
            await expect(highlightedDates.nth(0)).toContainText(formatDate('2026-10-02'))
            await expect(highlightedDates.nth(1)).toContainText(formatDate('2026-10-03'))
            const counts = table.locator('.response-best-count')
            await expect(counts).toHaveCount(choices.includes('◎') ? 3 : 2)
            expect(await counts.allTextContents()).toEqual(choices.includes('◎') ? ['1', '1', '2'] : ['2', '2'])
            for (const cell of await table.locator('.response-best-candidate').all()) {
              await expect(cell).toHaveCSS('background-color', theme === 'dark' ? 'rgb(68, 59, 22)' : 'rgb(255, 244, 184)')
            }
            await expect(counts.first()).toHaveCSS('color', theme === 'dark' ? 'rgb(252, 165, 165)' : 'rgb(185, 28, 28)')
            // Removing only the highlight must not change row heights or column widths.
            const geometry = await table.evaluate(element => {
              const measure = () => [...element.querySelectorAll('th, td')].map(cell => {
                const { width, height } = cell.getBoundingClientRect()
                return [width, height]
              })
              const before = measure()
              const cells = [...element.querySelectorAll('.response-best-candidate')]
              cells.forEach(cell => cell.classList.remove('response-best-candidate'))
              const after = measure()
              cells.forEach(cell => cell.classList.add('response-best-candidate'))
              return { before, after }
            })
            expect(geometry.after).toEqual(geometry.before)
            await results.getByRole('checkbox', { name: t('見出し固定'), exact: true }).uncheck()
            await expect(highlightedDates.first()).toHaveCSS('background-color', theme === 'dark' ? 'rgb(68, 59, 22)' : 'rgb(255, 244, 184)')
            await results.getByRole('checkbox', { name: t('見出し固定'), exact: true }).check()
            await results.scrollIntoViewIfNeeded()
            if (choices.includes('◎')) await page.screenshot({ path: `test-results/highlight-${locale}-${width}-${theme}-${layout}.png`, animations: 'disabled' })
            await results.getByRole('checkbox', { name: t('集計'), exact: true }).uncheck()
            await expect(counts).toHaveCount(0)
            await expect(highlightedDates).toHaveCount(2)
            expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
          }
        }
      }
      expect(errors).toEqual([])
    })
  }

  test(`${locale}: no highlight for zero availability or no responses`, async ({ page, request }) => {
    const { t, path } = getI18n(locale)
    const shareId = `zero-highlight-${locale}`
    await seed(request, shareId, '◎○△✕', true)
    await page.goto(path(`/e/${shareId}`))
    const results = page.locator('#responses-section')
    await expect(results.locator('table')).toContainText('C')
    for (const layout of ['v', 'h']) {
      await results.getByRole('button', { name: t(layout === 'v' ? '縦 ╦' : '╠═╣ 横'), exact: true }).click()
      await expect(results.locator('.response-best-candidate')).toHaveCount(0)
    }
    const emptyId = `empty-highlight-${locale}`
    expect((await request.post(`${api}/events`, { data: { share_id: emptyId, name: 'No responses' } })).ok()).toBe(true)
    await page.goto(path(`/e/${emptyId}`))
    await expect(results.getByText(t('まだ回答がありません。'), { exact: true })).toBeVisible()
    await expect(results.locator('.response-best-candidate')).toHaveCount(0)
  })
}
