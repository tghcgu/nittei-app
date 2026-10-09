import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { getI18n } from '../lib/i18n'

const api = 'http://127.0.0.1:54329/rest/v1'
const dates = ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05']

async function seed(request: APIRequestContext, shareId: string, timeLabels: (string | null)[]) {
  const created = await request.post(`${api}/events`, { data: { share_id: shareId, name: 'Time range', answer_choices: '◎○△✕' } })
  expect(created.ok()).toBe(true)
  const [seeded] = await created.json()
  const inserted = await request.post(`${api}/candidates`, {
    data: dates.map((date, index) => ({ event_id: seeded.id, date, time_label: timeLabels[index], sort_order: index })),
  })
  expect(inserted.ok()).toBe(true)
  return (await inserted.json() as { id: string }[]).map(candidate => candidate.id)
}

const selectedAnswers = (page: Page, ids: string[]) => page.evaluate(candidateIds => candidateIds.map(id =>
  [...document.querySelectorAll(`[data-answer-candidate-id="${id}"]`)]
    .find(button => button.classList.contains('font-bold'))?.getAttribute('data-answer-value') ?? null), ids)

for (const locale of ['ja', 'en'] as const) {
  test(`${locale}: the time block appears only when the dates have times`, async ({ page, request }) => {
    const { t, path } = getI18n(locale)
    await seed(request, `time-range-none-${locale}`, dates.map(() => null))
    await page.goto(path(`/e/time-range-none-${locale}`))
    await page.getByRole('button', { name: t('📋 範囲で一括回答'), exact: true }).click()
    await expect(page.getByText(t('日程範囲と回答を選択して「適用」'), { exact: true })).toBeVisible()
    // these dates have no time of their own, so there is nothing to compare
    await expect(page.locator('[data-time-window]')).toHaveCount(0)
    // "適用" says what it did, also when every date was already answered
    const apply = page.getByRole('button', { name: t('適用'), exact: true })
    await apply.click()
    await expect(page.getByRole('status').filter({ hasText: t('{0}件に入れました。', 5) })).toBeVisible()
    await apply.click()
    await expect(page.getByRole('status').filter({ hasText: t('入力済みの{0}件は変えていません。変えるには「入力済の行は変更しない」を外してください。', 5) })).toBeVisible()
  })

  // "[time]〜[time] に [かぶる日程|かぶらない日程] を [symbol] にする", with the dates' own times and no calendar
  test(`${locale}: dates overlapping a time, or the others, take the chosen symbol`, async ({ page, request }) => {
    const { t, path } = getI18n(locale)
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    const ids = await seed(request, `time-range-both-${locale}`, ['10:00〜12:00', '19:00〜21:00', '22:00〜', '18:00〜19:00', null])
    await page.goto(path(`/e/time-range-both-${locale}`))
    await page.getByRole('button', { name: t('📋 範囲で一括回答'), exact: true }).click()
    const block = page.locator('[data-time-window]')
    const apply = block.getByRole('button', { name: t('適用'), exact: true })
    await expect(block.locator('input[type=file]')).toHaveCount(0)

    // 20:00-23:00 overlaps 19:00-21:00 and the three hours from 22:00, but not a date that ends at 19:00
    await block.getByLabel(t('時間の開始')).fill('20:00')
    await block.getByLabel(t('時間の終了')).fill('23:00')
    await apply.click()
    await expect.poll(() => selectedAnswers(page, ids)).toEqual([null, '✕', '✕', null, null])
    await expect(block.getByRole('status')).toHaveText(t('{0}件に入れました。', 2))

    // the other dates: the usual ✕ turns into ○; a date without a time is never changed
    await block.getByRole('button', { name: t('かぶらない日程'), exact: true }).click()
    await expect(block.getByRole('button', { name: t('かぶらない日程を{0}にする', '○'), exact: true })).toHaveAttribute('aria-pressed', 'true')
    await apply.click()
    await expect.poll(() => selectedAnswers(page, ids)).toEqual(['○', '✕', '✕', '○', null])
    await expect(block.getByRole('status')).toHaveText(t('{0}件に入れました。', 2))

    // answered dates stay while "keep existing answers" is on
    await block.getByRole('button', { name: t('かぶる日程'), exact: true }).click()
    await block.getByRole('button', { name: t('かぶる日程を{0}にする', '△'), exact: true }).click()
    await apply.click()
    expect(await selectedAnswers(page, ids)).toEqual(['○', '✕', '✕', '○', null])
    await expect(block.getByRole('status')).toHaveText(t('入力済みの{0}件は変えていません。変えるには「入力済の行は変更しない」を外してください。', 2))
    await page.getByLabel(t('入力済の行は変更しない')).uncheck()
    await apply.click()
    await expect.poll(() => selectedAnswers(page, ids)).toEqual(['○', '△', '△', '○', null])
    await expect(block.getByRole('status')).toHaveText(t('{0}件に入れました。', 2))

    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      expect(await page.evaluate(() => document.documentElement.scrollWidth), `${width}px page width`).toBeLessThanOrEqual(width)
    }
    expect(errors).toEqual([])
  })

  test(`${locale}: a candidate with only a start time counts as three hours for the time block`, async ({ page, request }) => {
    const { t, path } = getI18n(locale)
    const ids = await seed(request, `time-range-${locale}`, dates.map(() => '21:00〜'))
    await page.goto(path(`/e/time-range-${locale}`))
    await page.getByRole('button', { name: t('📋 範囲で一括回答'), exact: true }).click()
    const block = page.locator('[data-time-window]')
    const apply = block.getByRole('button', { name: t('適用'), exact: true })

    // 00:30-01:00 is after a 21:00-24:00 candidate has ended
    await block.getByLabel(t('時間の開始')).fill('00:30')
    await block.getByLabel(t('時間の終了')).fill('01:00')
    await apply.click()
    expect(await selectedAnswers(page, ids)).toEqual([null, null, null, null, null])
    await expect(block.getByRole('status')).toHaveText(t('当てはまる日程はありませんでした。'))
    // 22:00-23:00 starts after 21:00 but inside the three hours the calendar import also assumes
    await block.getByLabel(t('時間の開始')).fill('22:00')
    await block.getByLabel(t('時間の終了')).fill('23:00')
    await apply.click()
    await expect.poll(() => selectedAnswers(page, ids)).toEqual(['✕', '✕', '✕', '✕', '✕'])
  })
}
