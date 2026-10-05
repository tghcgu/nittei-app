import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { getI18n } from '../lib/i18n'

const api = 'http://127.0.0.1:54329/rest/v1'
const dates = ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05']

async function seed(request: APIRequestContext, shareId: string, timeLabel: string | null = null) {
  const created = await request.post(`${api}/events`, { data: { share_id: shareId, name: 'Time range', answer_choices: '◎○△✕' } })
  expect(created.ok()).toBe(true)
  const [seeded] = await created.json()
  const inserted = await request.post(`${api}/candidates`, {
    data: dates.map((date, index) => ({ event_id: seeded.id, date, time_label: timeLabel, sort_order: index })),
  })
  expect(inserted.ok()).toBe(true)
  return (await inserted.json() as { id: string }[]).map(candidate => candidate.id)
}

const selectedAnswers = (page: Page, ids: string[]) => page.evaluate(candidateIds => candidateIds.map(id =>
  [...document.querySelectorAll(`[data-answer-candidate-id="${id}"]`)]
    .find(button => button.classList.contains('font-bold'))?.getAttribute('data-answer-value') ?? null), ids)

for (const locale of ['ja', 'en'] as const) {
  test(`${locale}: the time-range block appears only when the dates have times`, async ({ page, request }) => {
    const { t, path } = getI18n(locale)
    await seed(request, `time-range-none-${locale}`)
    await page.goto(path(`/e/time-range-none-${locale}`))
    await page.getByRole('button', { name: t('📋 範囲で一括回答'), exact: true }).click()
    await expect(page.getByText(t('日程範囲と回答を選択して「適用」'), { exact: true })).toBeVisible()
    // these dates have no time of their own, so there is nothing to compare
    await expect(page.getByText(t('日付範囲 + 時間帯で一括回答'), { exact: true })).toHaveCount(0)
  })

  test(`${locale}: a candidate with only a start time counts as three hours for the time-range block`, async ({ page, request }) => {
    const { t, path } = getI18n(locale)
    const ids = await seed(request, `time-range-${locale}`, '21:00〜')
    await page.goto(path(`/e/time-range-${locale}`))
    await page.getByRole('button', { name: t('📋 範囲で一括回答'), exact: true }).click()
    const block = page.getByText(t('日付範囲 + 時間帯で一括回答'), { exact: true }).locator('..')
    const window = block.locator('input[type=time]')
    const apply = block.getByRole('button', { name: t('適用'), exact: true })

    // 00:30-01:00 is after a 21:00-24:00 candidate has ended
    await window.first().fill('00:30')
    await window.last().fill('01:00')
    await apply.click()
    expect(await selectedAnswers(page, ids)).toEqual([null, null, null, null, null])
    // 22:00-23:00 starts after 21:00 but inside the three hours the calendar import also assumes
    await window.first().fill('22:00')
    await window.last().fill('23:00')
    await apply.click()
    await expect.poll(() => selectedAnswers(page, ids)).toEqual(['✕', '✕', '✕', '✕', '✕'])
  })
}
