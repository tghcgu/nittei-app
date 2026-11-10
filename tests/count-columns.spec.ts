import { expect, test } from '@playwright/test'
import { DEFAULT_ANSWER_CHOICES } from '../lib/answer-choices'
import { getI18n } from '../lib/i18n'

const api = 'http://127.0.0.1:54329/rest/v1'

for (const locale of ['ja', 'en'] as const) {
  test(`${locale}: the tally leaves out −, which each person's column still shows`, async ({ page, request }) => {
    const { t, path } = getI18n(locale)
    const shareId = `no-dash-count-${locale}`
    const [event] = await (await request.post(`${api}/events`, {
      data: { share_id: shareId, name: 'Tally', answer_choices: DEFAULT_ANSWER_CHOICES },
    })).json()
    const candidates = await (await request.post(`${api}/candidates`, {
      data: [0, 1].map(index => ({ event_id: event.id, date: `2026-12-0${index + 1}`, time_label: '21:00', sort_order: index })),
    })).json()
    for (const [name, values] of [['A', ['○', '-']], ['B', ['-', '✕']]] as const) {
      const [response] = await (await request.post(`${api}/responses`, { data: { event_id: event.id, name } })).json()
      expect((await request.post(`${api}/answers`, {
        data: candidates.map((candidate: { id: string }, index: number) => ({
          response_id: response.id, candidate_id: candidate.id, value: values[index],
        })),
      })).ok()).toBe(true)
    }

    await page.goto(path(`/e/${shareId}`))
    const results = page.locator('#responses-section')
    const table = results.locator('table')
    await expect(table).toContainText('B')
    await results.getByRole('checkbox', { name: t('集計'), exact: true }).check()
    const dash = /^[-−]$/

    // dates down the side: one tally column per symbol, none for −
    await results.getByRole('button', { name: t('縦 ╦'), exact: true }).click()
    for (const value of ['○', '△', '✕']) await expect(table.getByTitle(t('{0}の人数', value), { exact: true })).toHaveCount(1)
    await expect(table.getByTitle(t('{0}の人数', '−'), { exact: true })).toHaveCount(0)
    await expect(table.locator('td').filter({ hasText: dash })).toHaveCount(2)

    // dates across the top: one tally row per symbol, none for −
    await results.getByRole('button', { name: t('╠═╣ 横'), exact: true }).click()
    const rowHeads = table.locator('tbody th')
    for (const value of ['○', '△', '✕']) await expect(rowHeads.filter({ hasText: new RegExp(`^${value}$`) })).toHaveCount(1)
    await expect(rowHeads.filter({ hasText: dash })).toHaveCount(0)
    await expect(table.locator('td').filter({ hasText: dash })).toHaveCount(2)
  })
}
