import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
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

async function seed(request: APIRequestContext, shareId: string) {
  const created = await request.post(`${api}/events`, { data: { share_id: shareId, name: 'Calendar window', answer_choices: '◎○△✕' } })
  expect(created.ok()).toBe(true)
  const [seeded] = await created.json()
  const inserted = await request.post(`${api}/candidates`, {
    data: dates.map((date, index) => ({ event_id: seeded.id, date, sort_order: index })),
  })
  expect(inserted.ok()).toBe(true)
  return (await inserted.json() as { id: string }[]).map(candidate => candidate.id)
}

const selectedAnswers = (page: Page, ids: string[]) => page.evaluate(candidateIds => candidateIds.map(id =>
  [...document.querySelectorAll(`[data-answer-candidate-id="${id}"]`)]
    .find(button => button.classList.contains('font-bold'))?.getAttribute('data-answer-value') ?? null), ids)

for (const locale of ['ja', 'en'] as const) {
  // "[time]〜[time] に [予定がある日|予定がない日] を [symbol] にする", for the dates and weekdays above
  test(`${locale}: dates busy or free at a time take the chosen symbol, within the date range`, async ({ page, request }) => {
    const { t, path } = getI18n(locale)
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    const ids = await seed(request, `calendar-window-${locale}`)
    await page.goto(path(`/e/calendar-window-${locale}`))
    await page.getByRole('button', { name: t('📋 範囲で一括回答'), exact: true }).click()
    const block = page.locator('[data-calendar-window]')
    const message = block.getByRole('status')
    const start = block.getByLabel(t('予定を調べる時間の開始'))
    const end = block.getByLabel(t('予定を調べる時間の終了'))
    const apply = block.getByRole('button', { name: t('カレンダーで適用'), exact: true })

    // 23:00-26:00: the late event and the one after midnight are in it; the file is chosen on the first apply
    await start.fill('23:00')
    await end.fill('02:00')
    const chooser = page.waitForEvent('filechooser')
    await block.getByRole('button', { name: t('カレンダーを選んで適用'), exact: true }).click()
    await (await chooser).setFiles(calendar)
    await expect.poll(() => selectedAnswers(page, ids)).toEqual([null, null, null, '✕', '✕'])
    await expect(message).toHaveText(t('{0}件の候補に入力しました。内容を確認してから送信してください。', 2))

    // free dates: the usual ✕ turns into ○, and the loaded calendar is used again
    await block.getByRole('button', { name: t('予定がない日'), exact: true }).click()
    await expect(block.getByRole('button', { name: t('予定がない日を{0}にする', '○'), exact: true })).toHaveAttribute('aria-pressed', 'true')
    await start.fill('20:00')
    await end.fill('00:00')
    await apply.click()
    // 20:00-24:00 is free on 10/01, 10/02 and 10/05; the ✕ the calendar wrote on 10/05 is redone
    await expect.poll(() => selectedAnswers(page, ids)).toEqual(['○', '○', null, '✕', '○'])

    // no time means the whole day; a date changed by hand stays
    await block.getByRole('button', { name: t('予定がある日'), exact: true }).click()
    await page.locator(`[data-answer-candidate-id="${ids[1]}"][data-answer-value="◎"]`).click()
    await start.fill('')
    await end.fill('')
    await apply.click()
    await expect.poll(() => selectedAnswers(page, ids)).toEqual(['○', '◎', '✕', '✕', '✕'])
    await expect(message).toHaveText(t('{0}件の候補に入力しました（手で入力した{1}件は変更していません）。', 3, 1))

    // one time alone is not enough; a time with no events says so
    await start.fill('03:00')
    await expect(apply).toBeDisabled()
    await end.fill('04:00')
    await apply.click()
    await expect(message).toHaveText(t('この時間に予定がかぶる日はありませんでした。'))

    // only the dates in the range above change
    const range = page.locator('input[type=date]')
    await range.first().fill(dates[2])
    await range.last().fill(dates[2])
    await start.fill('')
    await end.fill('')
    await block.getByRole('button', { name: t('予定がある日を{0}にする', '△'), exact: true }).click()
    await apply.click()
    await expect.poll(() => selectedAnswers(page, ids)).toEqual(['○', '◎', '△', '✕', '✕'])

    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      expect(await page.evaluate(() => document.documentElement.scrollWidth), `${width}px page width`).toBeLessThanOrEqual(width)
    }
    expect(errors).toEqual([])
  })
}
