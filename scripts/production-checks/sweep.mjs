// Opens every public page in light and dark at four widths and reports script errors, failed requests
// and horizontal overflow. Read-only. Usage: node scripts/production-checks/sweep.mjs [base URL]
// Set PLAYWRIGHT_CHROMIUM_EXECUTABLE when Playwright's own browser is not installed.
import { chromium } from 'playwright'

const base = process.argv[2] ?? 'https://nittei-app.qoj.workers.dev'

// page HTML is fetched outside the browser, so a local ad filter such as AdGuard cannot alter it
const bypassLocalFilter = async (target) => target.route(url => !url.pathname.startsWith('/_next/') && url.hostname.endsWith('workers.dev'), async route => {
  if (route.request().resourceType() !== 'document') return route.continue()
  return route.fulfill({ response: await route.fetch() })
})
const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {})
const problems = []
let checks = 0
const paths = ['/', '/en', '/e/ohbcvs2j', '/en/e/ohbcvs2j', '/history', '/terms', '/privacy', '/contact']
for (const scheme of ['light', 'dark']) {
  for (const path of paths) {
    const started = Date.now()
    const context = await browser.newContext({ colorScheme: scheme })
    const page = await context.newPage()
    await bypassLocalFilter(page)
    const errors = []
    page.on('pageerror', e => errors.push(`pageerror: ${e.message}`))
    page.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text().slice(0, 200)}`) })
    page.on('requestfailed', r => r.url().includes('cloudflareinsights') || errors.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`))
    page.on('crash', () => errors.push('RENDERER CRASH'))
    let status = 'ok'
    try {
      await page.setViewportSize({ width: 390, height: 900 })
      const response = await page.goto(base + path, { waitUntil: 'load', timeout: 20000 })
      if (response.status() !== 200) problems.push(`${scheme} ${path}: HTTP ${response.status()}`)
      for (const width of [320, 390, 768, 1440]) {
        checks++
        await page.setViewportSize({ width, height: 900 })
        await page.waitForTimeout(500)
        const size = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: window.innerWidth }))
        if (size.doc > size.win + 1) problems.push(`${scheme} ${width}px ${path}: overflow ${size.doc}>${size.win}`)
      }
      const memory = await page.evaluate(() => performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : -1)
      status = `ok heap=${memory}MB`
    } catch (e) {
      status = 'FAIL ' + e.message.split('\n')[0]
      problems.push(`${scheme} ${path}: ${status}`)
    }
    for (const e of errors) problems.push(`${scheme} ${path}: ${e}`)
    console.log(`${scheme.padEnd(5)} ${path.padEnd(16)} ${String(Date.now() - started).padStart(5)}ms ${status}${errors.length ? ' errors=' + errors.length : ''}`)
    await context.close().catch(() => {})
  }
}
await browser.close()
console.log(`\nchecked ${checks} width combinations`)
console.log(problems.length ? 'PROBLEMS:\n' + problems.join('\n') : 'NO PROBLEMS FOUND')
process.exitCode = problems.length ? 1 : 0
