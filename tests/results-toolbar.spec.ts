import { expect, test, type APIRequestContext } from '@playwright/test'
import { getI18n } from '../lib/i18n'

const api = 'http://127.0.0.1:54329/rest/v1'

async function seed(request: APIRequestContext, shareId: string) {
  const created = await request.post(`${api}/events`, { data: { share_id: shareId, name: 'Results toolbar' } })
  expect(created.ok()).toBe(true)
  const [event] = await created.json()
  const candidates = await (await request.post(`${api}/candidates`, {
    data: Array.from({ length: 3 }, (_, index) => ({
      event_id: event.id, date: `2026-10-0${index + 1}`, time_label: '21:00', sort_order: index,
    })),
  })).json()
  const [response] = await (await request.post(`${api}/responses`, { data: { event_id: event.id, name: 'A', note: 'General note' } })).json()
  expect((await request.post(`${api}/answers`, {
    data: candidates.map((candidate: { id: string }) => ({ response_id: response.id, candidate_id: candidate.id, value: '○' })),
  })).ok()).toBe(true)
}

for (const locale of ['ja', 'en'] as const) {
  test(`${locale}: answer link sits beside the heading and the controls fit one row on phones`, async ({ page, request }) => {
    const { t, path } = getI18n(locale)
    const shareId = `results-toolbar-${locale}`
    await seed(request, shareId)
    await page.setViewportSize({ width: 390, height: 900 })
    await page.goto(path(`/e/${shareId}`))
    const results = page.locator('#responses-section')
    const heading = results.getByRole('heading', { name: t('みんなの回答'), exact: true })
    await expect(heading).toBeVisible()
    const answerLink = results.getByRole('button', { name: t('↑ 回答へ'), exact: true })
    const controls = results.locator('.results-controls')
    for (const width of [320, 360, 375, 390, 430, 639, 640, 700, 768, 820, 890, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      const title = (await heading.boundingBox())!
      const link = (await answerLink.boundingBox())!
      expect(Math.abs(link.y + link.height / 2 - (title.y + title.height / 2)), `${width}px answer link on the heading line`).toBeLessThan(4)
      expect(link.x, `${width}px answer link after the heading`).toBeGreaterThanOrEqual(title.x + title.width)
      const geometry = await controls.evaluate(el => {
        const box = el.getBoundingClientRect()
        const centers = [...el.children].map(child => {
          const rect = child.getBoundingClientRect()
          return rect.top + rect.height / 2
        })
        return {
          pageWidth: document.documentElement.scrollWidth,
          rowSpread: Math.max(...centers) - Math.min(...centers),
          inside: [...el.children].every(child => {
            const rect = child.getBoundingClientRect()
            return rect.left >= box.left - 1 && rect.right <= box.right + 1
          }),
          scrolls: el.scrollWidth > el.clientWidth + 1,
        }
      })
      expect(geometry.pageWidth, `${width}px page width`).toBeLessThanOrEqual(width)
      if (width < 640) {
        expect(geometry.rowSpread, `${width}px controls share one row`).toBeLessThan(3)
        // both languages fit without scrolling from 360px; only smaller phones scroll the row
        if (width >= 360) expect(geometry.scrolls, `${width}px controls fit the phone row`).toBe(false)
      } else {
        expect(geometry.inside, `${width}px controls fully visible`).toBe(true)
        expect(geometry.scrolls, `${width}px controls need no sideways scroll`).toBe(false)
      }
    }
    // every control stays reachable on the narrowest phone, by scrolling its own row
    await page.setViewportSize({ width: 320, height: 900 })
    for (const control of await controls.locator('button, label').all()) {
      await control.scrollIntoViewIfNeeded()
      const box = (await control.boundingBox())!
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width).toBeLessThanOrEqual(320)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
  })
}
