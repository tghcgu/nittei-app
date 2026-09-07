import { expect, test, type Locator } from '@playwright/test'
import { getI18n } from '../lib/i18n'
import { DEFAULT_ANSWER_CHOICES } from '../lib/answer-choices'

async function expectTextInsideCell(text: Locator, wrapped = false) {
  const geometry = await text.evaluate(element => {
    const cell = element.closest('th, td')!.getBoundingClientRect()
    const range = document.createRange()
    range.selectNodeContents(element)
    const lines = [...range.getClientRects()]
    return {
      width: cell.width,
      lines: new Set(lines.map(line => line.top)).size,
      contained: lines.every(line => line.left >= cell.left - 1 && line.right <= cell.right + 1),
    }
  })
  expect(geometry.contained).toBe(true)
  if (wrapped) expect(geometry.lines).toBeGreaterThan(1)
  return geometry.width
}

for (const locale of ['ja', 'en'] as const) {
  test(`${locale}: long Latin names and comments wrap without widening short names`, async ({ page, request }) => {
    const { t, path } = getI18n(locale)
    const shareId = `wrap-${locale}`
    const api = 'http://127.0.0.1:54329/rest/v1'
    const [event] = await (await request.post(`${api}/events`, {
      data: { share_id: shareId, name: 'Name wrapping', answer_choices: DEFAULT_ANSWER_CHOICES },
    })).json()
    const [candidate] = await (await request.post(`${api}/candidates`, {
      data: { event_id: event.id, date: '2026-09-14', time_label: null, sort_order: 0 },
    })).json()
    const names = ['A', 'Alex', 'UNBHG VJTYI'.replaceAll(' ', '').repeat(6), 'jfjdstgreoigufdty'.repeat(5), '\u5c71\u7530'.repeat(12)]
    const note = 'AvailabilityWithoutSpaces'.repeat(5)
    const dayNote = 'EveningAvailabilityWithoutSpaces'.repeat(4)
    const respondents = await (await request.post(`${api}/responses`, {
      data: names.map((name, index) => ({ event_id: event.id, name, note: index === 2 ? note : null })),
    })).json()
    await request.post(`${api}/answers`, {
      data: respondents.map((response: { id: string }, index: number) => ({
        response_id: response.id, candidate_id: candidate.id, value: '-', note: index === 3 ? dayNote : null,
      })),
    })

    await page.goto(path(`/e/${shareId}`))
    const table = page.locator('.response-results-table')
    await expect(table.getByText(names[0], { exact: true })).toBeVisible()
    await page.getByRole('checkbox', { name: t('集計'), exact: true }).uncheck()
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 })
      await page.getByRole('button', { name: t('縦 ╦'), exact: true }).click()
      for (let index = 0; index < names.length; index++) {
        const cellWidth = await expectTextInsideCell(table.getByText(names[index], { exact: true }), index >= 2)
        if (index < 2) expect(cellWidth).toBeLessThan(45)
      }
      await expectTextInsideCell(table.getByText(note, { exact: true }), true)
      await expectTextInsideCell(table.getByText(dayNote, { exact: true }), true)
      await table.screenshot({ path: `test-results/wrapped-results-${locale}-${width}.png` })

      const peer = page.getByTitle(names[2], { exact: true })
      await expect(peer).toBeVisible()
      expect(await peer.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
      expect((await peer.boundingBox())!.width).toBeLessThanOrEqual(96)
      const peerShort = page.getByTitle(names[0], { exact: true })
      expect((await peerShort.boundingBox())!.width).toBeLessThan(30)

      await page.getByRole('button', { name: t('╠═╣ 横'), exact: true }).click()
      await expectTextInsideCell(table.getByText(names[2], { exact: true }), true)
      await expectTextInsideCell(table.getByText(note, { exact: true }), true)
      await expectTextInsideCell(table.getByText(dayNote, { exact: true }), true)
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
    }
  })

  test(`${locale}: mobile time controls fill the row with actions and history below`, async ({ page }) => {
    const { t, path } = getI18n(locale)
    await page.goto(path('/'))
    await expect(page.locator('[data-calendar-date]').first()).toBeVisible()
    await page.locator('.theme-toggle').click()
    for (const width of [320, 390, 500]) {
      await page.setViewportSize({ width, height: 1000 })
      const times = page.locator('.candidate-default-times')
      const panel = times.locator('..')
      const geometry = await panel.evaluate(el => {
        const box = el.getBoundingClientRect()
        const style = getComputedStyle(el)
        const times = el.querySelector('.candidate-default-times')!.getBoundingClientRect()
        const inputs = [...el.querySelectorAll('input[type="time"]')].map(input => input.getBoundingClientRect())
        const label = el.querySelector('span')!.getBoundingClientRect()
        const buttons = [...el.querySelectorAll('button')].map(button => button.getBoundingClientRect())
        return {
          innerWidth: box.width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - 2,
          timesWidth: times.width,
          equalInputs: Math.abs(inputs[0].width - inputs[1].width) < 1,
          labelAbove: label.bottom <= times.top,
          actionsBelow: buttons.slice(0, 3).every(button => button.top >= times.bottom),
          historyBelow: buttons.slice(3).every(button => button.top >= Math.max(...buttons.slice(0, 3).map(action => action.bottom))),
          historyRight: Math.abs(buttons.at(-1)!.right - times.right) < 1,
          contained: [...inputs, ...buttons].every(item => item.left >= box.left && item.right <= box.right),
        }
      })
      expect(Math.abs(geometry.timesWidth - geometry.innerWidth)).toBeLessThan(1)
      expect(geometry.equalInputs).toBe(true)
      expect(geometry.labelAbove).toBe(true)
      expect(geometry.actionsBelow).toBe(true)
      expect(geometry.historyBelow).toBe(true)
      expect(geometry.historyRight).toBe(true)
      expect(geometry.contained).toBe(true)
      const choices = page.locator('button[aria-pressed]')
      await expect(choices).toHaveCount(3)
      for (const choice of await choices.all()) {
        expect(await choice.innerText()).not.toContain('\u304b\u3089\u9078\u629e')
      }
      if (width >= 390) {
        const tops = await choices.evaluateAll(buttons => buttons.map(button => button.getBoundingClientRect().top))
        expect(new Set(tops).size).toBe(1)
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
      await page.screenshot({ path: `test-results/mobile-times-${locale}-${width}.png`, fullPage: true })
    }
    await page.getByRole('button', { name: t('時刻なし'), exact: true }).click()
    await expect(page.locator('.candidate-default-times input').first()).toHaveValue('')
    await page.getByRole('button', { name: t('↶ 戻す'), exact: true }).click()
    await expect(page.locator('.candidate-default-times input').first()).toHaveValue('21:00')
    await page.setViewportSize({ width: 1440, height: 900 })
    expect((await page.locator('.candidate-default-times input').first().boundingBox())!.width).toBe(112)
  })
}
