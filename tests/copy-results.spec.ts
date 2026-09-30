import { expect, test } from '@playwright/test'
import { getI18n } from '../lib/i18n'

const api = 'http://127.0.0.1:54329/rest/v1'
const dates = ['2026-10-01', '2026-10-02', '2026-10-03']

test.use({ permissions: ['clipboard-read', 'clipboard-write'] })

for (const locale of ['ja', 'en'] as const) {
  test(`${locale}: the totals can be copied as text for a chat message`, async ({ page, request }) => {
    const { t, path, formatDate } = getI18n(locale)
    const shareId = `copy-results-${locale}`
    const created = await request.post(`${api}/events`, { data: { share_id: shareId, name: 'Copy results' } })
    expect(created.ok()).toBe(true)
    const [event] = await created.json()
    const candidates = await (await request.post(`${api}/candidates`, {
      data: dates.map((date, index) => ({ event_id: event.id, date, time_label: index === 0 ? '21:00〜' : null, sort_order: index })),
    })).json() as { id: string }[]
    await page.goto(path(`/e/${shareId}`))
    // nothing to copy until someone has answered
    await expect(page.getByRole('button', { name: t('⧉ 集計をテキストでコピー'), exact: true })).toHaveCount(0)

    for (const [name, values] of [['A', ['○', '○', '✕']], ['B', ['○', '△', '✕']]] as const) {
      const [response] = await (await request.post(`${api}/responses`, { data: { event_id: event.id, name } })).json()
      expect((await request.post(`${api}/answers`, {
        data: candidates.map((candidate, index) => ({ response_id: response.id, candidate_id: candidate.id, value: values[index] })),
      })).ok()).toBe(true)
    }
    await page.reload()
    const copy = page.locator('#responses-section').getByRole('button', { name: t('⧉ 集計をテキストでコピー'), exact: true })
    await copy.click()
    await expect(page.locator('#responses-section').getByRole('button', { name: t('✓ コピーしました'), exact: true })).toBeVisible()
    // the first date has the most ○, and "-" is left out because nobody used it
    // Windows hands the clipboard text back with CRLF line endings
    expect((await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n')).toBe([
      'Copy results',
      `${t('回答人数：')}2${t('人')}`,
      `★${formatDate(dates[0])} 21:00〜 ○2 △0 ✕0`,
      `${formatDate(dates[1])} ○1 △1 ✕0`,
      `${formatDate(dates[2])} ○0 △0 ✕2`,
      t('★は参加できる人が最も多い日'),
      `http://127.0.0.1:3100${path(`/e/${shareId}`)}`,
    ].join('\n'))
    await expect(copy).toBeVisible({ timeout: 5000 })
  })
}
