import { expect, test, type Page } from '@playwright/test'
import { getI18n } from '../lib/i18n'

const api = 'http://127.0.0.1:54329/rest/v1'

// Every small control has a tap area of at least 24×24px, and the strip added around it reaches that control.
const smallTapAreas = (page: Page) => page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.hit-area')].flatMap(element => {
  if (element.getBoundingClientRect().width === 0) return []
  element.scrollIntoView({ block: 'center', inline: 'center' })
  const box = element.getBoundingClientRect()
  const area = getComputedStyle(element, '::after')
  const width = Math.max(box.width, parseFloat(area.width))
  const height = Math.max(box.height, parseFloat(area.height))
  const label = (element.innerText || '').trim().slice(0, 20)
  if (!(width >= 24 && height >= 24)) return [`${label}: ${width}x${height}`]
  if (box.height >= 24) return []
  const strip = (24 - box.height) / 2
  const x = box.left + box.width / 2
  // the middle of the strip added above and below the visible box (where two areas meet, either may win)
  return [box.top - strip / 2, box.bottom + strip / 2].flatMap(y => {
    const hit = document.elementFromPoint(x, y)
    return hit && (hit === element || element.contains(hit)) ? [] : [`${label}: ${Math.round(y - box.top)}px goes to ${hit?.tagName ?? 'nothing'}`]
  })
}))

for (const locale of ['ja', 'en'] as const) {
  test(`${locale}: small buttons and links are easy to tap, and the answers beside the form scroll with the keyboard`, async ({ page, request }) => {
    const { t, path } = getI18n(locale)
    const shareId = `tap-targets-${locale}`
    const seeded = await request.post(`${api}/events`, { data: { share_id: shareId, name: 'Tap targets' } })
    expect(seeded.ok()).toBe(true)
    const [event] = await seeded.json()
    const candidates = await (await request.post(`${api}/candidates`, {
      data: ['2026-11-02', '2026-11-03', '2026-11-04'].map((date, index) => ({ event_id: event.id, date, time_label: '19:00〜22:00', sort_order: index })),
    })).json()
    for (const name of ['Participant one', 'Participant two', 'Participant three', 'Participant four', 'Participant five', 'Participant six']) {
      const [response] = await (await request.post(`${api}/responses`, { data: { event_id: event.id, name } })).json()
      await request.post(`${api}/answers`, {
        data: candidates.map((candidate: { id: string }) => ({ response_id: response.id, candidate_id: candidate.id, value: '○' })),
      })
    }
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(path(`/e/${shareId}`))
    await expect(page.locator('#responses-section table')).toBeVisible()
    await page.getByRole('button', { name: `${t('設定')}▼`, exact: true }).click()
    await page.getByLabel(t('時間で記号を決める')).check()
    await page.getByRole('button', { name: `${t('書き出し方法を見る')}▼`, exact: true }).click()
    await page.getByRole('button', { name: t('📋 範囲で一括回答'), exact: true }).click()
    expect(await page.locator('.hit-area').count()).toBeGreaterThan(10)
    expect(await smallTapAreas(page)).toEqual([])

    // the wider tap areas never make the results scroll up and down
    for (const layout of ['v', 'h'] as const) {
      await page.locator('#responses-section').getByRole('button', { name: t(layout === 'v' ? '縦 ╦' : '╠═╣ 横'), exact: true }).click()
      const scrollsUpAndDown = await page.locator('#responses-section table').evaluate(table => {
        const box = table.parentElement!
        return /auto|scroll/.test(getComputedStyle(box).overflowY) && box.scrollHeight > box.clientHeight
      })
      expect(scrollsUpAndDown, layout).toBe(false)
    }

    // the answers beside the form have nothing to press, so the area itself takes the keyboard
    const others = page.getByRole('region', { name: t('他の人の回答'), exact: true })
    await expect(others).toHaveAttribute('tabindex', '0')
    expect(await others.evaluate(element => element.scrollWidth > element.clientWidth)).toBe(true)
    await others.focus()
    await page.keyboard.press('ArrowRight')
    await expect.poll(() => others.evaluate(element => element.scrollLeft)).toBeGreaterThan(0)

    await page.goto(path('/'))
    await page.getByRole('button', { name: `${t('書き出し方法を見る')}▼`, exact: true }).waitFor()
    expect(await smallTapAreas(page)).toEqual([])
  })
}
