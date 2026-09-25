import { expect, test, type Page } from '@playwright/test'
import { getI18n } from '../lib/i18n'

const api = 'http://127.0.0.1:54329/rest/v1'

// Simulates HTML from an older deploy asking for a chunk the current version no longer serves.
const requestRemovedChunk = (page: Page) => page.evaluate(() => {
  const script = document.createElement('script')
  script.src = `/_next/static/chunks/removed-by-a-newer-deploy-${Date.now()}.js`
  document.head.append(script)
})

for (const locale of ['ja', 'en'] as const) {
  test(`${locale}: a missing chunk reloads once and keeps the unsaved answer`, async ({ page, request }) => {
    const { t, path } = getI18n(locale)
    const shareId = `stale-chunk-${locale}`
    const created = await request.post(`${api}/events`, { data: { share_id: shareId, name: 'Stale chunk' } })
    expect(created.ok()).toBe(true)
    const [event] = await created.json()
    expect((await request.post(`${api}/candidates`, {
      data: { event_id: event.id, date: '2026-10-01', time_label: '21:00', sort_order: 0 },
    })).ok()).toBe(true)

    await page.goto(path(`/e/${shareId}`))
    const name = page.getByPlaceholder(t('例：山田'))
    await name.fill('Unsaved participant')
    const reloaded = page.waitForEvent('load')
    await requestRemovedChunk(page)
    await reloaded
    await expect(page.getByPlaceholder(t('例：山田'))).toHaveValue('Unsaved participant')

    // a second failure within a minute must not start a reload loop
    let reloads = 0
    page.on('load', () => reloads++)
    await requestRemovedChunk(page)
    await page.waitForTimeout(1500)
    expect(reloads).toBe(0)
    await expect(page.getByPlaceholder(t('例：山田'))).toHaveValue('Unsaved participant')
  })
}

test('a page whose own chunk is missing on first load recovers after one reload', async ({ page }) => {
  // the page chunk is gone for the first document (preload and script alike), then served again
  let documents = 0
  page.on('request', request => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) documents++
  })
  let blocked = ''
  await page.route('**/_next/static/chunks/**', route => {
    const url = decodeURIComponent(route.request().url())
    if (documents === 1 && /\/chunks\/app\/.*page[^/]*\.js/.test(url)) {
      blocked = url
      return route.fulfill({ status: 404, contentType: 'text/html', body: 'Not found' })
    }
    return route.continue()
  })
  await page.goto('/')
  // the calendar only renders after hydration, so this proves the reloaded page works
  await expect(page.locator('[data-calendar-date]').first()).toBeVisible()
  expect(blocked).not.toBe('')
  expect(documents).toBe(2)
})
