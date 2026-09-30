import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test'
import { getI18n } from '../lib/i18n'

const api = 'http://127.0.0.1:54329/rest/v1'
const dates = ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05']

// Floating local times keep the result independent of the machine's time zone.
const event = (uid: string, start: string, end: string) =>
  ['BEGIN:VEVENT', `UID:${uid}`, 'DTSTAMP:20260901T000000Z', `DTSTART:${start}`, `DTEND:${end}`, 'SUMMARY:Busy', 'END:VEVENT'].join('\r\n')
const calendar = {
  name: 'calendar.ics', mimeType: 'text/calendar',
  buffer: Buffer.from(['BEGIN:VCALENDAR', 'VERSION:2.0',
    event('daytime', '20261002T100000', '20261002T120000'),
    event('evening', '20261003T190000', '20261003T210000'),
    event('late', '20261004T220000', '20261004T233000'),
    // a daytime event plus one after midnight: 20:00-24:00 stays free
    event('daytime-2', '20261005T100000', '20261005T120000'),
    event('after-midnight', '20261006T003000', '20261006T013000'),
    'END:VCALENDAR'].join('\r\n')),
}
// the legend "◎ all day / ○ 20:00-24:00 / △ 23:00-26:00 / ✕ none" applied to the calendar above
const legendAnswers = ['◎', '○', '△', '✕', '○']

async function seed(request: APIRequestContext, shareId: string, timeLabel: string | null = null) {
  const created = await request.post(`${api}/events`, { data: { share_id: shareId, name: 'Free windows', answer_choices: '◎○△✕' } })
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

async function enterLegend(rules: Locator) {
  await expect(rules.locator('[data-free-rule]')).toHaveCount(3)
  await expect(rules.locator('[data-free-rule="◎"] input[type=checkbox]')).toBeChecked()
  await rules.locator('[data-free-rule="○"] input[type=time]').first().fill('20:00')
  await rules.locator('[data-free-rule="○"] input[type=time]').last().fill('00:00')
  await rules.locator('[data-free-rule="△"] input[type=time]').first().fill('23:00')
  await rules.locator('[data-free-rule="△"] input[type=time]').last().fill('02:00')
}

async function chooseCalendar(page: Page, button: Locator, file = calendar) {
  const chooser = page.waitForEvent('filechooser')
  await button.click()
  await (await chooser).setFiles(file)
}

for (const locale of ['ja', 'en'] as const) {
  test(`${locale}: legend rules fill each date with the first symbol whose time is free`, async ({ page, request }) => {
    const { t, path } = getI18n(locale)
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    const ids = await seed(request, `free-rules-${locale}`)
    await page.goto(path(`/e/free-rules-${locale}`))
    await page.getByRole('button', { name: t('📋 範囲で一括回答'), exact: true }).click()
    const rules = page.locator('[data-free-rules]')
    const message = rules.getByRole('status')
    const load = rules.getByRole('button', { name: t('カレンダーを選んで適用'), exact: true })
    const apply = rules.getByRole('button', { name: t('空き時間で適用'), exact: true })
    await enterLegend(rules)

    // the date range above limits which dates are filled
    const range = page.locator('input[type=date]')
    await expect(range.first()).toHaveValue(dates[0])
    await range.last().fill(dates[2])
    await chooseCalendar(page, load)
    await expect.poll(() => selectedAnswers(page, ids)).toEqual(['◎', '○', '△', null, null])
    await expect(message).toHaveText(t('{0}件の候補に入力しました。内容を確認してから送信してください。', 3))
    await range.last().fill(dates[4])
    await apply.click()
    await expect.poll(() => selectedAnswers(page, ids)).toEqual(legendAnswers)

    // a row changed by hand is kept while "keep existing answers" is on; rows the calendar filled are redone
    await page.locator(`[data-answer-candidate-id="${ids[0]}"][data-answer-value="✕"]`).click()
    await apply.click()
    await expect(message).toHaveText(t('{0}件の候補に入力しました（手で入力した{1}件は変更していません）。', 4, 1))
    expect(await selectedAnswers(page, ids)).toEqual(['✕', ...legendAnswers.slice(1)])
    await page.getByLabel(t('入力済の行は変更しない')).uncheck()
    await apply.click()
    await expect.poll(() => selectedAnswers(page, ids)).toEqual(legendAnswers)
    await page.getByRole('button', { name: t('↶ 戻す'), exact: true }).click()
    await expect.poll(() => selectedAnswers(page, ids)).toEqual(['✕', ...legendAnswers.slice(1)])

    // the symbol for "nothing is free" can be changed, and a rule without a time is skipped
    await rules.getByRole('button', { name: t('どれも空いていない日を{0}にする', '-'), exact: true }).click()
    await rules.locator('[data-free-rule="△"] input[type=time]').last().fill('')
    await apply.click()
    await expect.poll(() => selectedAnswers(page, ids)).toEqual(['◎', '○', '-', '-', '○'])

    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      expect(await page.evaluate(() => document.documentElement.scrollWidth), `${width}px page width`).toBeLessThanOrEqual(width)
    }
    expect(errors).toEqual([])
  })

  test(`${locale}: rows filled by the calendar import are redone by the legend rules`, async ({ page, request }) => {
    const { t, path } = getI18n(locale)
    const ids = await seed(request, `free-rules-import-${locale}`)
    await page.goto(path(`/e/free-rules-import-${locale}`))
    await page.getByRole('button', { name: t('📋 範囲で一括回答'), exact: true }).click()
    const rules = page.locator('[data-free-rules]')
    await enterLegend(rules)

    // a file that cannot be read reports the problem inside the block and changes nothing
    await chooseCalendar(page, rules.getByRole('button', { name: t('カレンダーを選んで適用'), exact: true }),
      { name: 'broken.ics', mimeType: 'text/calendar', buffer: Buffer.from('not a calendar') })
    await expect(rules.getByRole('status')).toHaveText(t('読み取りに失敗しました。.ics または .zip ファイルか確認して、手動で入力してください。'))
    expect(await selectedAnswers(page, ids)).toEqual([null, null, null, null, null])

    // the ordinary import judges dates without a time by the whole day: free or busy only
    await page.locator('input[type="file"]').setInputFiles(calendar)
    await expect.poll(() => selectedAnswers(page, ids)).toEqual(['○', '✕', '✕', '✕', '✕'])
    // "keep existing answers" is still on, yet these rows came from the calendar, so the rules replace them
    await expect(page.getByLabel(t('入力済の行は変更しない'))).toBeChecked()
    await rules.getByRole('button', { name: t('空き時間で適用'), exact: true }).click()
    await expect.poll(() => selectedAnswers(page, ids)).toEqual(legendAnswers)
    await expect(rules.getByRole('status')).toHaveText(t('{0}件の候補に入力しました。内容を確認してから送信してください。', 5))
  })

  test(`${locale}: dates with an overlapping event take the chosen symbol`, async ({ page, request }) => {
    const { t, path } = getI18n(locale)
    const ids = await seed(request, `busy-window-${locale}`)
    await page.goto(path(`/e/busy-window-${locale}`))
    await page.getByRole('button', { name: t('📋 範囲で一括回答'), exact: true }).click()
    const busy = page.locator('[data-busy-window]')
    const message = busy.getByRole('status')
    const apply = busy.getByRole('button', { name: t('かぶる日に適用'), exact: true })
    const window = busy.locator('input[type=time]')
    // these candidates have no time of their own, so the candidate-time block has nothing to compare
    await expect(page.getByText(t('日付範囲 + 時間帯で一括回答'), { exact: true })).toHaveCount(0)

    // 23:00-26:00: the late event and the one after midnight overlap it
    await window.first().fill('23:00')
    await window.last().fill('02:00')
    await chooseCalendar(page, busy.getByRole('button', { name: t('カレンダーを選んで適用'), exact: true }))
    await expect.poll(() => selectedAnswers(page, ids)).toEqual([null, null, null, '✕', '✕'])
    await expect(message).toHaveText(t('{0}件の候補に入力しました。内容を確認してから送信してください。', 2))

    // a second pass may overwrite what the first one wrote, even with "keep existing answers" on
    await window.first().fill('20:00')
    await window.last().fill('00:00')
    await busy.getByRole('button', { name: t('予定がかぶる日を{0}にする', '△'), exact: true }).click()
    await apply.click()
    await expect.poll(() => selectedAnswers(page, ids)).toEqual([null, null, '△', '△', '✕'])

    // a row changed by hand stays; "all day" means any event on that date
    await page.locator(`[data-answer-candidate-id="${ids[1]}"][data-answer-value="◎"]`).click()
    await busy.getByLabel(t('終日')).check()
    await busy.getByRole('button', { name: t('予定がかぶる日を{0}にする', '○'), exact: true }).click()
    await apply.click()
    await expect.poll(() => selectedAnswers(page, ids)).toEqual([null, '◎', '○', '○', '○'])
    await expect(message).toHaveText(t('{0}件の候補に入力しました（手で入力した{1}件は変更していません）。', 3, 1))

    await busy.getByLabel(t('終日')).uncheck()
    await window.first().fill('03:00')
    await window.last().fill('04:00')
    await apply.click()
    await expect(message).toHaveText(t('この時間に予定がかぶる日はありませんでした。'))
    expect(await selectedAnswers(page, ids)).toEqual([null, '◎', '○', '○', '○'])
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
