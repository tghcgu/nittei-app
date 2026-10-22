import { expect, test } from '@playwright/test'
import worker from '../custom-worker.mjs'

const previous = 'https://nittei-app.qoj.workers.dev'
const next = 'https://nitei.pages.dev'
const local = 'http://127.0.0.1:3100'

// Serves the new address from the local test site.
async function fromLocalSite(route) {
  const url = new URL(route.request().url())
  const response = await fetch(local + url.pathname + url.search, { headers: { accept: route.request().headers().accept ?? '*/*' } })
  const headers = Object.fromEntries(response.headers)
  // fetch has already decompressed the body
  delete headers['content-encoding']
  delete headers['content-length']
  await route.fulfill({ status: response.status, headers, body: Buffer.from(await response.arrayBuffer()) })
}

test('the previous address sends every page to the same place on the new address', async () => {
  const env = { REDIRECT_TO: next }
  // search engines and link previews get a permanent redirect
  for (const method of ['GET', 'HEAD']) {
    const response = await worker.fetch(new Request(`${previous}/en/e/abc?x=1`, { method }), env)
    expect(response.status, method).toBe(301)
    expect(response.headers.get('location'), method).toBe(`${next}/en/e/abc?x=1`)
  }
  // a browser gets the small page that carries the saved data along
  const page = await worker.fetch(new Request(`${previous}/e/abc`, { headers: { 'Sec-Fetch-Mode': 'navigate' } }), env)
  expect(page.status).toBe(200)
  expect(page.headers.get('cache-control')).toBe('no-store')
  expect(await page.text()).toContain(`location.replace("${next}/e/abc"`)
  // the verification file stays, so Search Console can keep the previous address
  const verification = await worker.fetch(new Request(`${previous}/googlecc8378481687d5f8.html`), env)
  expect(await verification.text()).toBe('google-site-verification: googlecc8378481687d5f8.html')
})

test('opening the previous address brings the history and settings along once, without overwriting', async ({ page }) => {
  // Both addresses are simulated: the previous one by the Worker, the new one by the local test site.
  await page.route(`${previous}/**`, async route => {
    const response = await worker.fetch(new Request(route.request().url(), { headers: { 'Sec-Fetch-Mode': 'navigate' } }), { REDIRECT_TO: next })
    await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() })
  })
  await page.route(`${previous}/setup`, route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>setup</title>' }))
  await page.route(`${next}/**`, fromLocalSite)

  // saved on the previous address
  await page.goto(`${previous}/setup`)
  await page.evaluate(() => {
    localStorage.setItem('nittei-history', JSON.stringify([
      { shareId: 'moved-one', name: 'Moved event', at: '2026-10-01T00:00:00.000Z' },
      { shareId: 'on-both', name: 'Older copy', at: '2026-09-01T00:00:00.000Z' },
    ]))
    localStorage.setItem('nittei-theme', 'dark')
    localStorage.setItem('nittei-table-prefs', JSON.stringify({ counts: true, sticky: true, layout: 'h', notes: 'name' }))
    localStorage.setItem('nittei-ics-moved-one', JSON.stringify({ mode: 'rules' }))
    localStorage.setItem('someone-else', 'not ours')
  })
  // already saved on the new address
  await page.goto(`${next}/terms`)
  await page.evaluate(() => {
    localStorage.setItem('nittei-history', JSON.stringify([
      { shareId: 'on-both', name: 'Newer copy', at: '2026-10-05T00:00:00.000Z' },
    ]))
    localStorage.setItem('nittei-theme', 'light')
  })

  await page.goto(`${previous}/history#key=abc`)
  await page.waitForURL(`${next}/history#key=abc`)
  await expect(page.getByText('Moved event')).toBeVisible()
  const saved = await page.evaluate(() => ({
    history: JSON.parse(localStorage.getItem('nittei-history')).map(entry => `${entry.shareId}:${entry.name}`),
    theme: localStorage.getItem('nittei-theme'),
    prefs: localStorage.getItem('nittei-table-prefs'),
    ics: localStorage.getItem('nittei-ics-moved-one'),
    other: localStorage.getItem('someone-else'),
  }))
  // the newer entry wins, newest first; what the new address had is kept; unrelated keys stay behind
  expect(saved.history).toEqual(['on-both:Newer copy', 'moved-one:Moved event'])
  expect(saved.theme).toBe('light')
  expect(saved.prefs).toContain('"layout":"h"')
  expect(saved.ics).toBe('{"mode":"rules"}')
  expect(saved.other).toBeNull()

  // the second time nothing is carried (the URL stays plain)
  await page.goto(`${previous}/updates`)
  await page.waitForURL(`${next}/updates`)
})

test('a crafted link from another site cannot write into the saved data', async ({ page }) => {
  await page.route(`${next}/**`, fromLocalSite)
  const data = encodeURIComponent(JSON.stringify({ 'nittei-history': JSON.stringify([{ shareId: 'planted', name: 'Planted', at: '2030-01-01T00:00:00.000Z' }]) }))
  await page.goto(`${next}/history#nittei-move=${data}`)
  // the data is dropped from the address and not used
  await expect.poll(() => page.evaluate(() => location.hash)).toBe('')
  expect(await page.evaluate(() => localStorage.getItem('nittei-history'))).toBeNull()
  await expect(page.getByText('Planted')).toHaveCount(0)
})
