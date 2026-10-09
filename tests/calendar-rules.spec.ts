import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { getI18n } from '../lib/i18n'

const api = 'http://127.0.0.1:54329/rest/v1'
const dates = ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05']

// Floating local times keep the result independent of the machine's time zone.
const event = (uid: string, start: string, end: string) =>
  ['BEGIN:VEVENT', `UID:${uid}`, 'DTSTAMP:20260901T000000Z', `DTSTART:${start}`, `DTEND:${end}`, 'SUMMARY:Busy', 'END:VEVENT'].join('\r\n')
const ics = (...events: string[]) => ({
  name: 'calendar.ics', mimeType: 'text/calendar',
  buffer: Buffer.from(['BEGIN:VCALENDAR', 'VERSION:2.0', ...events, 'END:VCALENDAR'].join('\r\n')),
})

async function seed(request: APIRequestContext, shareId: string, answerChoices: string) {
  const created = await request.post(`${api}/events`, { data: { share_id: shareId, name: 'Free time', answer_choices: answerChoices } })
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
  // a legend that gives each symbol its own time
  test(`${locale}: each symbol can have the time that must be free`, async ({ page, request }) => {
    const { t, path } = getI18n(locale)
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    const ids = await seed(request, `calendar-rules-${locale}`, '◎○△✕')
    await page.goto(path(`/e/calendar-rules-${locale}`))
    const file = page.locator('input[type="file"]')
    // 10/01 free, 10/02 an evening event, 10/03 an afternoon event, 10/04 both, 10/05 only after 23:00
    const calendar = ics(
      event('evening', '20261002T190000', '20261002T200000'),
      event('afternoon', '20261003T140000', '20261003T150000'),
      event('both-afternoon', '20261004T140000', '20261004T150000'),
      event('both-evening', '20261004T190000', '20261004T200000'),
      event('late', '20261005T233000', '20261006T003000'),
    )

    // by default each date is checked at its own time, which is the whole day here
    await file.setInputFiles(calendar)
    await expect.poll(() => selectedAnswers(page, ids)).toEqual(['○', '✕', '✕', '✕', '✕'])

    await page.getByRole('button', { name: `${t('設定')}▼`, exact: true }).click()
    await page.getByLabel(t('時間で記号を決める')).check()
    await expect(page.getByText(t('予定あり：'), { exact: true })).toHaveCount(0)
    const rules = page.locator('[data-ics-rules]')
    // the example uses only the symbols of this event
    await expect(rules.getByText(t('例：◎ 1日OK、○ 夜だけOK、△ 遅れて参加 なら、◎ 10:00〜22:00、○ 18:00〜22:00、△ 20:00〜22:00。'), { exact: true })).toBeVisible()

    // with no time entered, nothing changes and the reason is shown
    await file.setInputFiles(calendar)
    await expect(page.getByText(t('時間を入れた記号がありません。記号ごとに時間を入れてください。'), { exact: true })).toBeVisible()
    expect(await selectedAnswers(page, ids)).toEqual(['○', '✕', '✕', '✕', '✕'])

    for (const [value, start, end] of [['◎', '10:00', '23:00'], ['○', '10:00', '17:00'], ['△', '18:00', '23:00']]) {
      await rules.getByLabel(t('{0}の開始時刻', value)).fill(start)
      await rules.getByLabel(t('{0}の終了時刻', value)).fill(end)
    }
    await file.setInputFiles(calendar)
    await expect.poll(() => selectedAnswers(page, ids)).toEqual(['◎', '○', '△', '✕', '◎'])

    // a date set to the "none is free" symbol by hand stays; that symbol can be changed
    await page.locator(`[data-answer-candidate-id="${ids[0]}"][data-answer-value="✕"]`).click()
    await file.setInputFiles(calendar)
    await expect.poll(() => selectedAnswers(page, ids)).toEqual(['✕', '○', '△', '✕', '◎'])
    await rules.getByRole('button', { name: t('どれも空いていない日を{0}にする', '-'), exact: true }).click()
    await file.setInputFiles(calendar)
    await expect.poll(async () => (await selectedAnswers(page, ids))[3]).toBe('-')

    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      expect(await page.evaluate(() => document.documentElement.scrollWidth), `${width}px page width`).toBeLessThanOrEqual(width)
    }
    expect(errors).toEqual([])
  })

  // "○ both halves of the day, △ either half": a symbol with two times
  test(`${locale}: a symbol with two times is used when either is free`, async ({ page, request }) => {
    const { t, path } = getI18n(locale)
    const ids = await seed(request, `calendar-rules-half-${locale}`, '○△✕')
    await page.goto(path(`/e/calendar-rules-half-${locale}`))
    // 10/01 free, 10/02 a morning event, 10/03 an afternoon event, 10/04 both, 10/05 an evening event
    const calendar = ics(
      event('morning', '20261002T100000', '20261002T110000'),
      event('afternoon', '20261003T140000', '20261003T150000'),
      event('both-morning', '20261004T100000', '20261004T110000'),
      event('both-afternoon', '20261004T140000', '20261004T150000'),
      event('evening', '20261005T190000', '20261005T200000'),
    )
    await page.getByRole('button', { name: `${t('設定')}▼`, exact: true }).click()
    await page.getByLabel(t('時間で記号を決める')).check()
    const rules = page.locator('[data-ics-rules]')
    await expect(rules.locator('[data-ics-rule]')).toHaveCount(2)
    await expect(rules.getByText(t('例：○ 1日OK、△ 夜だけOK なら、○ 10:00〜22:00、△ 18:00〜22:00。'), { exact: true })).toBeVisible()
    await rules.getByLabel(t('{0}の開始時刻', '○')).fill('09:00')
    await rules.getByLabel(t('{0}の終了時刻', '○')).fill('17:00')
    await rules.getByLabel(t('{0}の開始時刻', '△')).fill('09:00')
    await rules.getByLabel(t('{0}の終了時刻', '△')).fill('12:00')
    await rules.locator('[data-ics-rule="△"]').getByRole('button', { name: t('＋別の時間'), exact: true }).click()
    await rules.getByLabel(t('{0}の2つ目の開始時刻', '△')).fill('13:00')
    await rules.getByLabel(t('{0}の2つ目の終了時刻', '△')).fill('17:00')
    await expect(rules.locator('[data-ics-rule="△"]').getByRole('button', { name: t('＋別の時間'), exact: true })).toHaveCount(0)
    await page.locator('input[type="file"]').setInputFiles(calendar)
    await expect.poll(() => selectedAnswers(page, ids)).toEqual(['○', '△', '△', '✕', '○'])

    // without the afternoon, only a free morning gives △
    await rules.getByRole('button', { name: t('{0}の2つ目の時間を消す', '△'), exact: true }).click()
    await page.locator('input[type="file"]').setInputFiles(calendar)
    await expect.poll(() => selectedAnswers(page, ids)).toEqual(['○', '✕', '△', '✕', '○'])
  })

  // "✕ busy in the evening, △ busy late in the afternoon", checked from the top
  test(`${locale}: the time rules can check busy times instead of free ones`, async ({ page, request }) => {
    const { t, path } = getI18n(locale)
    const ids = await seed(request, `calendar-rules-busy-${locale}`, '○△✕')
    await page.goto(path(`/e/calendar-rules-busy-${locale}`))
    // 10/01 free, 10/02 an evening event, 10/03 a late-afternoon event, 10/04 both, 10/05 a morning event
    const calendar = ics(
      event('evening', '20261002T200000', '20261002T210000'),
      event('afternoon', '20261003T173000', '20261003T180000'),
      event('both-afternoon', '20261004T173000', '20261004T180000'),
      event('both-evening', '20261004T200000', '20261004T210000'),
      event('morning', '20261005T100000', '20261005T110000'),
    )
    await page.getByRole('button', { name: `${t('設定')}▼`, exact: true }).click()
    await page.getByLabel(t('時間で記号を決める')).check()
    const rules = page.locator('[data-ics-rules]')
    await rules.getByRole('button', { name: t('埋まっていたら'), exact: true }).click()
    // busy rules use ✕ first and then △; dates with nothing busy get ○
    expect(await rules.locator('[data-ics-rule]').evaluateAll(rows => rows.map(row => row.getAttribute('data-ics-rule')))).toEqual(['✕', '△'])
    await expect(rules.getByText(t('例：✕ 夜に予定あり、△ 夕方に予定あり なら、✕ 19:00〜22:00、△ 17:00〜19:00。'), { exact: true })).toBeVisible()
    await expect(rules.getByRole('button', { name: t('どれも埋まっていない日を{0}にする', '○'), exact: true })).toHaveCount(0)
    await expect(rules.getByRole('button', { name: t('どれも埋まっていない日の入力を解除する'), exact: true })).toHaveCount(1)
    await rules.getByLabel(t('{0}の開始時刻', '✕')).fill('19:00')
    await rules.getByLabel(t('{0}の終了時刻', '✕')).fill('22:00')
    await rules.getByLabel(t('{0}の開始時刻', '△')).fill('17:00')
    await rules.getByLabel(t('{0}の終了時刻', '△')).fill('19:00')
    await page.locator('input[type="file"]').setInputFiles(calendar)
    await expect.poll(() => selectedAnswers(page, ids)).toEqual(['○', '✕', '△', '✕', '○'])

    // each direction keeps its own times
    await rules.getByRole('button', { name: t('空いていたら'), exact: true }).click()
    expect(await rules.locator('[data-ics-rule]').evaluateAll(rows => rows.map(row => row.getAttribute('data-ics-rule')))).toEqual(['○', '△'])
    await expect(rules.getByLabel(t('{0}の開始時刻', '△'))).toHaveValue('')
    await rules.getByRole('button', { name: t('埋まっていたら'), exact: true }).click()
    await expect(rules.getByLabel(t('{0}の開始時刻', '△'))).toHaveValue('17:00')
  })
}
