import { expect, test, type APIRequestContext } from '@playwright/test'
import { getI18n } from '../lib/i18n'

const api = 'http://127.0.0.1:54329/rest/v1'
const notes = ['After 19:00\nSecond line', 'NoteWithoutSpaces'.repeat(35)]
const names = ['A', 'LongNameWithoutSpaces'.repeat(5), 'Blank', 'Null', 'Empty']
const individualNote = 'Only for this date'

async function seed(request: APIRequestContext, shareId: string, mode: 'notes' | 'blank' | 'empty' = 'notes') {
  const created = await request.post(`${api}/events`, { data: { share_id: shareId, name: 'General notes' } })
  expect(created.ok()).toBe(true)
  const [event] = await created.json()
  const candidates = await (await request.post(`${api}/candidates`, {
    data: Array.from({ length: 8 }, (_, index) => ({
      event_id: event.id, date: `2026-10-0${index + 1}`, time_label: '21:00', sort_order: index,
    })),
  })).json()
  const values = mode === 'empty' ? [] : mode === 'blank' ? [' \n ', null, ''] : [...notes, ' \n ', null, '']
  for (const [index, note] of values.entries()) {
    const [response] = await (await request.post(`${api}/responses`, { data: { event_id: event.id, name: names[index], note } })).json()
    expect((await request.post(`${api}/answers`, {
      data: candidates.map((candidate: { id: string }, date: number) => ({
        response_id: response.id, candidate_id: candidate.id,
        value: date === 0 && index === 0 ? '-' : '○',
        note: date === 0 && index === 0 ? individualNote : null,
      })),
    })).ok()).toBe(true)
  }
}

for (const locale of ['ja', 'en'] as const) {
  test(`${locale}: general notes move without widening the table or moving individual notes`, async ({ page, request }) => {
    const { t, path } = getI18n(locale)
    const shareId = `general-notes-${locale}`
    await seed(request, shareId)
    const errors: string[] = []
    const writes: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('request', request => {
      if (request.url().startsWith(api) && !['GET', 'HEAD', 'OPTIONS'].includes(request.method())) writes.push(request.method())
    })
    await page.goto(path(`/e/${shareId}`))
    const results = page.locator('#responses-section')
    const table = results.locator('table')
    const controls = results.getByRole('group', { name: t('全体メモの表示位置') })
    const byName = controls.getByRole('button', { name: t('名前の下'), exact: true })
    const below = controls.getByRole('button', { name: t('表の下'), exact: true })
    const list = results.locator('.response-general-notes')
    await expect(table.locator('.response-general-note')).toHaveCount(2)
    await expect(byName).toHaveAttribute('aria-pressed', 'true')
    await page.getByPlaceholder(t('例：山田')).fill('Unsubmitted draft')
    await page.getByPlaceholder(t('全体へのメモ(任意)')).fill('Keep my note')
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      for (const theme of ['light', 'dark']) {
        if (await page.locator('html').getAttribute('data-theme') !== theme) await page.locator('.theme-toggle').click()
        for (const layout of ['v', 'h']) {
          await results.getByRole('button', { name: t(layout === 'v' ? '縦 ╦' : '╠═╣ 横'), exact: true }).click()
          await byName.click()
          await expect(list).toHaveCount(0)
          await expect(table.locator('.response-general-note')).toHaveCount(2)
          expect(await table.locator('.response-general-note').first().textContent()).toBe(notes[0])
          await expect(table.locator('.response-general-note').first()).toHaveCSS('white-space', 'pre-wrap')
          const nameWidth = (await table.boundingBox())!.width
          await below.click()
          await expect(below).toHaveAttribute('aria-pressed', 'true')
          await expect(byName).toHaveAttribute('aria-pressed', 'false')
          await expect(table.locator('.response-general-note')).toHaveCount(0)
          await expect(table.getByText(individualNote, { exact: true })).toHaveCount(1)
          await expect(list.locator('li')).toHaveCount(2)
          for (const [index, note] of notes.entries()) {
            expect(await list.locator('li').nth(index).textContent()).toBe(`${names[index]}: ${note}`)
          }
          const geometry = await list.evaluate(element => {
            const panel = element.parentElement!
            const table = panel.querySelector('table')!
            const box = element.getBoundingClientRect()
            const tableBox = table.getBoundingClientRect()
            const panelWidth = panel.getBoundingClientRect().width
            const range = document.createRange()
            range.selectNodeContents(element)
            const textFits = [...range.getClientRects()].every(rect => rect.left >= box.left - 1 && rect.right <= box.right + 1)
            element.style.display = 'none'
            const hiddenPanelWidth = panel.getBoundingClientRect().width
            const hiddenTableWidth = table.getBoundingClientRect().width
            element.removeAttribute('style')
            return { panelWidth, hiddenPanelWidth, tableWidth: tableBox.width, hiddenTableWidth, textFits, y: box.y, tableBottom: tableBox.bottom }
          })
          expect(geometry.tableWidth).toBeLessThanOrEqual(nameWidth)
          expect(geometry.panelWidth).toBe(geometry.hiddenPanelWidth)
          expect(geometry.tableWidth).toBe(geometry.hiddenTableWidth)
          expect(geometry.y).toBeGreaterThanOrEqual(geometry.tableBottom)
          expect(geometry.textFits).toBe(true)
          const before = (await list.boundingBox())!.x
          const scroller = table.locator('..')
          await scroller.evaluate(element => { element.scrollLeft = element.scrollWidth })
          expect((await list.boundingBox())!.x).toBe(before)
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
          await results.scrollIntoViewIfNeeded()
          await page.screenshot({ path: `test-results/general-notes-${locale}-${width}-${theme}-${layout}.png`, animations: 'disabled' })
        }
      }
    }
    await expect(page.getByPlaceholder(t('例：山田'))).toHaveValue('Unsubmitted draft')
    await expect(page.getByPlaceholder(t('全体へのメモ(任意)'))).toHaveValue('Keep my note')
    expect(errors).toEqual([])
    expect(writes).toEqual([])
  })

  test(`${locale}: note position survives reload and language changes with old preferences`, async ({ page, request }) => {
    const { t, path } = getI18n(locale)
    const other = getI18n(locale === 'ja' ? 'en' : 'ja')
    const shareId = `notes-prefs-${locale}`
    await seed(request, shareId)
    await page.addInitScript(() => {
      if (!localStorage.getItem('nittei-table-prefs')) {
        localStorage.setItem('nittei-table-prefs', JSON.stringify({ counts: false, sticky: false, layout: 'h' }))
      }
    })
    await page.goto(path(`/e/${shareId}`))
    const results = page.locator('#responses-section')
    const below = results.getByRole('button', { name: t('表の下'), exact: true })
    await expect(results.getByRole('button', { name: t('名前の下'), exact: true })).toHaveAttribute('aria-pressed', 'true')
    await below.focus()
    await page.keyboard.press('Enter')
    await expect(results.locator('.response-general-notes li')).toHaveCount(2)
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('nittei-table-prefs')!))).toEqual({ counts: false, sticky: false, layout: 'h', notes: 'bottom' })
    await page.reload()
    await expect(below).toHaveAttribute('aria-pressed', 'true')
    await expect(results.getByRole('checkbox', { name: t('集計'), exact: true })).not.toBeChecked()
    await expect(results.getByRole('checkbox', { name: t('見出し固定'), exact: true })).not.toBeChecked()
    await page.getByRole('link', { name: locale === 'ja' ? 'English' : '日本語', exact: true }).click()
    await expect(results.getByRole('button', { name: other.t('表の下'), exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(results.locator('.response-general-notes li')).toHaveCount(2)
    await page.evaluate(() => localStorage.setItem('nittei-table-prefs', JSON.stringify({ counts: false, sticky: false, layout: 'h', notes: 'invalid' })))
    await page.reload()
    await expect(results.getByRole('button', { name: other.t('名前の下'), exact: true })).toHaveAttribute('aria-pressed', 'true')
    await page.evaluate(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('Blocked storage') } }) })
    await results.getByRole('button', { name: other.t('表の下'), exact: true }).click()
    await expect(results.locator('.response-general-notes li')).toHaveCount(2)
    await results.getByRole('button', { name: other.t('名前の下'), exact: true }).click()
    await expect(results.locator('.response-general-notes')).toHaveCount(0)
  })

  test(`${locale}: empty notes never leave an empty section`, async ({ page, request }) => {
    const { t, path } = getI18n(locale)
    for (const mode of ['empty', 'blank'] as const) {
      const shareId = `empty-notes-${mode}-${locale}`
      await seed(request, shareId, mode)
      await page.goto(path(`/e/${shareId}`))
      const results = page.locator('#responses-section')
      if (mode === 'empty') {
        await expect(results.getByText(t('まだ回答がありません。'), { exact: true })).toBeVisible()
        await expect(results.getByRole('group', { name: t('全体メモの表示位置') })).toHaveCount(0)
      } else {
        await results.getByRole('button', { name: t('表の下'), exact: true }).click()
      }
      await expect(results.locator('.response-general-notes')).toHaveCount(0)
      await expect(results.locator('.response-general-note')).toHaveCount(0)
    }
  })

  test(`${locale}: editing or clearing a note updates its current display position`, async ({ page, request }) => {
    const { t, path } = getI18n(locale)
    const shareId = `edit-notes-${locale}`
    await seed(request, shareId)
    await page.goto(path(`/e/${shareId}`))
    const results = page.locator('#responses-section')
    await results.getByRole('button', { name: t('表の下'), exact: true }).click()
    for (const value of ['Updated note', '']) {
      await results.locator('table').getByRole('button', { name: t('編集'), exact: true }).first().click()
      await page.getByPlaceholder(t('全体へのメモ(任意)')).fill(value)
      await page.getByRole('button', { name: t('回答を更新'), exact: true }).click()
      await expect(page.getByText(t('回答を更新しました！'), { exact: true })).toBeVisible()
      await expect(results.locator('.response-general-notes li')).toHaveCount(value ? 2 : 1)
      if (value) await expect(results.locator('.response-general-notes li').first()).toHaveText(`A: ${value}`)
      await expect(results.locator('table').getByText(individualNote, { exact: true })).toHaveCount(1)
    }
    await results.getByRole('button', { name: t('名前の下'), exact: true }).click()
    await expect(results.locator('table .response-general-note')).toHaveCount(1)
    await page.reload()
    await expect(results.locator('table .response-general-note')).toHaveCount(1)
  })
}
