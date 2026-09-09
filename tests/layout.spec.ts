import { expect, test, type Locator } from '@playwright/test'
import { getI18n } from '../lib/i18n'
import { ANSWER_CHOICE_SETS, DEFAULT_ANSWER_CHOICES } from '../lib/answer-choices'

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
  test(`${locale}: language switch shares the existing footer without adding height`, async ({ page, request }) => {
    const { t, path } = getI18n(locale)
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    const shareId = `header-${locale}`
    const seeded = await request.post('http://127.0.0.1:54329/rest/v1/events', {
      data: { share_id: shareId, name: 'Header layout', answer_choices: DEFAULT_ANSWER_CHOICES },
    })
    expect(seeded.ok()).toBe(true)

    for (const route of ['/', `/e/${shareId}`]) {
      await page.goto(path(route))
      const brand = route === '/'
        ? page.getByRole('heading', { level: 1 })
        : page.getByRole('link', { name: t('\u65e5\u7a0b\u7d44\u3067\u65b0\u3057\u3044\u30a4\u30d9\u30f3\u30c8\u3092\u4f5c\u6210'), exact: true })
      await expect(brand).toBeVisible()
      const language = page.getByRole('link', { name: locale === 'ja' ? 'English' : '\u65e5\u672c\u8a9e', exact: true })
      await expect(language).toHaveCount(1)
      await expect(language.locator('..')).toHaveClass(/footer-links/)
      await expect(page.locator('body > footer')).toHaveCount(0)
      await expect(language).toHaveAttribute('href', getI18n(locale === 'ja' ? 'en' : 'ja').path(route))

      for (const width of [320, 360, 390, 400, 1440]) {
        await page.setViewportSize({ width, height: 900 })
        await page.evaluate(() => window.scrollTo(0, 0))
        const title = (await brand.boundingBox())!
        const theme = (await page.locator('.theme-toggle').boundingBox())!
        const footer = (await language.boundingBox())!
        expect(title.y).toBeLessThan(30)
        expect(Math.abs(title.x + title.width / 2 - width / 2)).toBeLessThan(1)
        expect(theme.x + theme.width).toBeLessThanOrEqual(title.x)
        expect(footer.y).toBeGreaterThan(title.y + title.height)
        const footerGeometry = await language.evaluate(link => {
          const row = link.parentElement!
          const separator = link.previousElementSibling as HTMLElement
          const height = row.getBoundingClientRect().height
          const links = [...row.querySelectorAll('a')].map(item => item.getBoundingClientRect())
          link.style.display = 'none'
          separator.style.display = 'none'
          row.classList.remove('footer-links')
          const originalHeight = row.getBoundingClientRect().height
          row.classList.add('footer-links')
          link.removeAttribute('style')
          separator.removeAttribute('style')
          return { height, originalHeight, rows: new Set(links.map(item => item.y)).size }
        })
        expect(footerGeometry.height).toBeLessThanOrEqual(footerGeometry.originalHeight)
        if (route === '/') expect(footerGeometry.rows).toBe(1)
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
        if (route !== '/') {
          const edit = (await page.getByRole('link', { name: t('\u65e5\u7a0b\u3092\u7de8\u96c6'), exact: true }).boundingBox())!
          expect(edit.x).toBeGreaterThanOrEqual(title.x + title.width)
          expect(edit.x + edit.width).toBeLessThanOrEqual(width)
        }
        await page.screenshot({ path: `test-results/header-${route === '/' ? 'home' : 'event'}-${locale}-${width}.png` })
      }
      await page.locator('.theme-toggle').click()
      await expect(page.locator('html')).toHaveAttribute('data-theme', route === '/' ? 'dark' : 'light')
      await language.scrollIntoViewIfNeeded()
      expect(await page.locator('.theme-toggle').evaluate(element => getComputedStyle(element).position)).toBe('absolute')
      await page.screenshot({ path: `test-results/language-footer-${route === '/' ? 'home' : 'event'}-${locale}.png` })
    }
    expect(errors).toEqual([])
  })

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
    for (const width of [320, 360, 390, 500]) {
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
      for (const [index, choice] of (await choices.all()).entries()) {
        await expect(choice).toHaveText(t(ANSWER_CHOICE_SETS[index].label))
        const textFits = await choice.evaluate(button => {
          const box = button.getBoundingClientRect()
          const range = document.createRange()
          range.selectNodeContents(button)
          return [...range.getClientRects()].every(line => line.left >= box.left && line.right <= box.right)
        })
        expect(textFits).toBe(true)
        const before = await choice.boundingBox()
        await choice.click()
        await expect(choice).toHaveAttribute('aria-pressed', 'true')
        await expect(page.locator('.answer-choice-options [aria-pressed="true"]')).toHaveCount(1)
        expect(await choice.boundingBox()).toEqual(before)
      }
      if (locale === 'ja' || width >= 390) {
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
    expect(await page.locator('.answer-choice-options button').first().evaluate(button => getComputedStyle(button).fontSize)).toBe('14px')
  })

  test(`${locale}: desktop time controls keep the phone row order`, async ({ page }) => {
    const { path } = getI18n(locale)
    await page.goto(path('/'))
    await expect(page.locator('[data-calendar-date]').first()).toBeVisible()
    const panel = page.locator('.candidate-default-times').locator('..')
    for (const width of [390, 640, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 1000 })
      const geometry = await panel.evaluate(el => {
        const box = el.getBoundingClientRect()
        const style = getComputedStyle(el)
        const times = el.querySelector('.candidate-default-times')!.getBoundingClientRect()
        const buttons = [...el.querySelectorAll('button')].map(button => button.getBoundingClientRect())
        const row = (rects: DOMRect[]) => new Set(rects.map(rect => Math.round(rect.top))).size
        return {
          actionsBelow: buttons.slice(0, 3).every(button => button.top >= times.bottom),
          actionsOnOneRow: row(buttons.slice(0, 3)) === 1,
          historyBelow: buttons.slice(3).every(button => button.top >= Math.max(...buttons.slice(0, 3).map(action => action.bottom))),
          historyOnOneRow: row(buttons.slice(3)) === 1,
          historyRight: Math.abs(buttons.at(-1)!.right - (box.right - parseFloat(style.paddingRight) - 1)) < 1,
          contained: buttons.every(button => button.left >= box.left && button.right <= box.right),
        }
      })
      expect({ width, ...geometry }).toEqual({
        width,
        actionsBelow: true,
        actionsOnOneRow: true,
        historyBelow: true,
        historyOnOneRow: true,
        historyRight: true,
        contained: true,
      })
    }
  })
}
