// Read-only checks of the public site after a release. Nothing is submitted or saved.
// Uses the check event /e/ohbcvs2j, which lives in the production database: never press 送信 there.
// Usage: node scripts/production-checks/features.mjs [base URL] [folder for screenshots]
// Set PLAYWRIGHT_CHROMIUM_EXECUTABLE when Playwright's own browser is not installed.
// When a release changes what is checked here, update the check in the same change.
import { chromium } from 'playwright'

const base = process.argv[2] ?? 'https://nittei-app.qoj.workers.dev'
const shots = process.argv[3]
const results = []
const ok = (name, pass, detail = '') => results.push(`${pass ? 'OK  ' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`)

// ---- plain HTTP checks ----
for (const url of ['/', '/en', '/e/ohbcvs2j', '/en/e/ohbcvs2j', '/history', '/updates', '/en/updates', '/terms', '/privacy', '/contact', '/sitemap.xml', '/robots.txt', '/manifest.webmanifest', '/en/manifest.webmanifest', '/favicon.ico']) {
  const status = (await fetch(base + url)).status
  if (status !== 200) ok(`GET ${url}`, false, `HTTP ${status}`)
}
ok('public routes respond', !results.some(r => r.startsWith('FAIL')))
for (const [url, max] of [['/icon.png', 100000], ['/icons/icon-192.png', 20000], ['/apple-touch-icon.png', 20000]]) {
  const response = await fetch(base + url)
  const bytes = (await response.arrayBuffer()).byteLength
  ok(`static image ${url}`, response.status === 200 && response.headers.get('content-type') === 'image/png' && bytes < max, `${response.status} ${response.headers.get('content-type')} ${Math.round(bytes / 1024)}KB`)
}
for (const url of ['/og.png', '/og-en.png']) {
  const status = (await fetch(base + url)).status
  ok(`old preview image ${url} is gone`, status === 404, `HTTP ${status}`)
}
// shared links show text only (the owner removed the large preview image on 2026-10-03)
for (const [locale, path] of [['ja', '/e/ohbcvs2j'], ['en', '/en/e/ohbcvs2j'], ['ja', '/'], ['en', '/en']]) {
  const html = await (await fetch(base + path)).text()
  const meta = (pattern) => html.match(pattern)?.[1] ?? ''
  const card = meta(/<meta name="twitter:card" content="([^"]+)"/)
  const apple = meta(/<link rel="apple-touch-icon" href="([^"]+)"/)
  const title = meta(/<meta property="og:title" content="([^"]+)"/)
  ok(`${locale} ${path} text-only link preview and icons`, !/og:image|twitter:image/.test(html) && card === 'summary' && Boolean(title) && apple.startsWith('/apple-touch-icon.png'), `card=${card} title=${title.slice(0, 30)} apple=${apple}`)
}
for (const url of ['/manifest.webmanifest', '/en/manifest.webmanifest']) {
  const manifest = await (await fetch(base + url)).json()
  ok(`${url} icons`, JSON.stringify(manifest.icons.map(i => [i.src, i.sizes])) === JSON.stringify([['/icons/icon-192.png', '192x192'], ['/icon.png', '512x512']]), JSON.stringify(manifest.icons.map(i => i.sizes)))
}
for (const [path, text] of [['/e/zzzzzzzz', 'ページが見つかりません'], ['/en/e/zzzzzzzz', 'Page not found'], ['/no-such-page', 'ページが見つかりません'], ['/en/no-such-page', 'Page not found']]) {
  const response = await fetch(base + path)
  const html = await response.text()
  ok(`missing ${path}`, response.status === 404 && html.includes(text), `HTTP ${response.status}, has text: ${html.includes(text)}`)
}
// the two contact forms (text without sign-in, images with a Google sign-in); no address is published
const formUrl = 'https://docs.google.com/forms/d/e/1FAIpQLSfs7Y18jKm8-xVUJIrgySDCUD5ux36WAm_FqkYhgewlGAZOMA/viewform'
const imageFormUrl = 'https://docs.google.com/forms/d/e/1FAIpQLSdRslbrQ_9mCwRVBOclGGyvHsnNUvPd22CRFkMSTXY_iTi9ng/viewform'
const linkTo = (html, label) => html.match(new RegExp('<a href="([^"]+)" target="_blank" rel="noopener noreferrer"[^>]*>' + label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))?.[1]
for (const [path, label, imageLabel] of [['/contact', 'お問い合わせフォームを開く ↗', '画像を添付できるフォームを開く ↗'], ['/en/contact', 'Open the contact form ↗', 'Open the form with image upload ↗']]) {
  const html = await (await fetch(base + path)).text()
  ok(`${path} links to the Google Form`, linkTo(html, label) === formUrl, linkTo(html, label) ?? 'link not found')
  ok(`${path} links to the image form`, linkTo(html, imageLabel) === imageFormUrl, linkTo(html, imageLabel) ?? 'link not found')
  ok(`${path} publishes no email address`, !/@gmail\.com/.test(html) && !html.includes('mailto:'))
}
for (const [path, text, date] of [['/privacy', 'お問い合わせの受付に Google フォームと Google ドライブ', '最終改定日: 2026年10月3日'], ['/en/privacy', 'Google Forms and Google Drive for inquiries', 'Last updated: October 3, 2026'], ['/terms', 'お問い合わせの受付', '最終改定日: 2026年10月3日']]) {
  const html = await (await fetch(base + path)).text()
  ok(`${path} mentions the forms and the current date`, html.includes(text) && html.includes(date))
}
const updates = await (await fetch(base + '/updates')).text()
ok('update history lists 2026-09-30 without the copy note', updates.includes('カレンダーを使った一括回答と、見やすさの改善') && !updates.includes('チャットに貼れるテキスト'))
ok('update history lists the contact form', updates.includes('お問い合わせフォームを追加'))
ok('update history lists the image form', updates.includes('スクリーンショットなどの画像を添付して送れるフォームも用意しました'))
ok('update history no longer mentions the preview image', !updates.includes('URLを共有したときに表示される画像') && updates.includes('iPhoneのホーム画面用アイコンを追加しました。'))
ok('update history lists the calendar settings with a made-up example', updates.includes('カレンダーの空き時間で記号を決められるように') && updates.includes('「◎ 1日OK、○ 夜だけOK」'))
ok('update history lists the October 9 changes', updates.includes('時間で入れる機能を使いやすく') && updates.includes('「その時間が空いていたら」と「埋まっていたら」を選べるようにしました。') && updates.includes('「19:00〜23:00 にかぶる日程を ✕ にする」') && updates.includes('何件に入れたかを出すようにしました。'))

// ---- browser checks (page HTML is fetched outside the browser, so a local ad filter such as AdGuard cannot alter it) ----
const bypassLocalFilter = async (page) => page.route(url => !url.pathname.startsWith('/_next/') && url.hostname.endsWith('workers.dev'), async route => {
  if (route.request().resourceType() !== 'document') return route.continue()
  return route.fulfill({ response: await route.fetch() })
})
const contrastOf = (target) => target.evaluate(element => {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1
  const context = canvas.getContext('2d', { willReadFrequently: true })
  const rgba = (value) => { context.clearRect(0, 0, 1, 1); context.fillStyle = value; context.fillRect(0, 0, 1, 1); const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data; return { r, g, b, a: a / 255 } }
  const over = (top, bottom) => ({ r: top.r * top.a + bottom.r * (1 - top.a), g: top.g * top.a + bottom.g * (1 - top.a), b: top.b * top.a + bottom.b * (1 - top.a), a: 1 })
  const luminance = ({ r, g, b }) => { const c = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }; return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b) }
  const layers = []
  for (let node = element; node; node = node.parentElement) { const colour = rgba(getComputedStyle(node).backgroundColor); if (colour.a > 0) layers.push(colour); if (colour.a >= 1) break }
  let background = layers.at(-1)?.a === 1 ? layers.pop() : rgba(document.documentElement.dataset.theme === 'dark' ? '#0a0a0a' : '#f1e9dc')
  while (layers.length) background = over(layers.pop(), background)
  const text = over(rgba(getComputedStyle(element).color), background)
  const [hi, lo] = [luminance(text), luminance(background)].sort((a, b) => b - a)
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100
})
const selected = (page) => page.evaluate(() => {
  const ids = [...new Set([...document.querySelectorAll('[data-answer-candidate-id]')].map(b => b.getAttribute('data-answer-candidate-id')))]
  return ids.map(id => [...document.querySelectorAll(`[data-answer-candidate-id="${id}"]`)].find(b => b.classList.contains('font-bold'))?.getAttribute('data-answer-value') ?? null)
})

const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {})
const context = await browser.newContext({ viewport: { width: 390, height: 1000 } })
const page = await context.newPage()
await bypassLocalFilter(page)
const errors = []
page.on('pageerror', error => errors.push(error.message.slice(0, 100)))

// the event page: candidate dates come from the rendered rows, in order
await page.goto(base + '/e/ohbcvs2j', { waitUntil: 'load', timeout: 90000 })
await page.locator('[data-answer-candidate-id]').first().waitFor({ timeout: 90000 })
await page.waitForTimeout(1200)
const before = await selected(page)
ok('event page loads with candidates', before.length > 0, `${before.length} dates`)

// the totals copy button stays removed, and the page information has its four lines
ok('totals copy button is gone', await page.getByText('集計をテキストでコピー').count() === 0)
let info = ''
try {
  const heading = page.getByText('【このページについての情報】', { exact: true })
  await heading.waitFor({ timeout: 90000 })
  info = (await heading.locator('..').innerText()).replace(/\s+/g, ' ')
} catch (error) { info = 'not found: ' + error.message.split('\n')[0] }
ok('page information has all four lines', info.includes('ページ表示日時') && info.includes('作成日時') && info.includes('最終更新日時') && info.includes('回答人数'), info)

// dark theme: a selected ✕ must be readable
await page.locator('.theme-toggle').click()
await page.waitForTimeout(500)
const firstId = await page.evaluate(() => document.querySelector('[data-answer-candidate-id]').getAttribute('data-answer-candidate-id'))
const cross = page.locator(`[data-answer-candidate-id="${firstId}"][data-answer-value="✕"]`)
await cross.click()
await page.waitForTimeout(500)
const crossContrast = await contrastOf(cross)
ok('dark selected ✕ is readable', crossContrast >= 4.5, `contrast ${crossContrast}:1`)
await cross.click() // unselect again
await page.waitForTimeout(200)

// "範囲で一括回答" uses no calendar; the first date there gets a synthetic all-day event
await page.getByRole('button', { name: '📋 範囲で一括回答', exact: true }).click()
const start = await page.locator('input[type=date]').first().inputValue()
const panelText = await page.getByText('日程範囲と回答を選択して「適用」', { exact: true }).locator('../..').innerText()
ok('range panel uses no calendar', await page.locator('[data-calendar-window], [data-busy-window], [data-free-rules]').count() === 0 && !panelText.includes('カレンダー'), panelText.match(/.{0,10}カレンダー.{0,10}/)?.[0] ?? '')
const ymd = start.replaceAll('-', '')
const nextDay = new Date(`${start}T00:00:00`); nextDay.setDate(nextDay.getDate() + 1)
const next = `${nextDay.getFullYear()}${String(nextDay.getMonth() + 1).padStart(2, '0')}${String(nextDay.getDate()).padStart(2, '0')}`
const calendar = { name: 'check.ics', mimeType: 'text/calendar', buffer: Buffer.from(['BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT', 'UID:check', 'DTSTAMP:20260901T000000Z', `DTSTART;VALUE=DATE:${ymd}`, `DTEND;VALUE=DATE:${next}`, 'SUMMARY:Busy', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n')) }

// the calendar import with a time per symbol (free rules); nothing is submitted
await page.getByRole('button', { name: '設定▼', exact: true }).click()
await page.getByLabel('時間で記号を決める').check()
const rules = page.locator('[data-ics-rules]')
ok('the settings show the made-up example', await rules.getByText(/◎ 1日OK、○ 夜だけOK、△ 遅れて参加/).count() === 1)
const top = await rules.locator('[data-ics-rule]').first().getAttribute('data-ics-rule')
await rules.locator(`[data-ics-rule="${top}"]`).getByLabel('終日').check()
await page.locator('input[type=file]').setInputFiles(calendar)
await page.getByText(/内容を確認してから送信してください。$/).first().waitFor()
const afterRules = await selected(page)
ok('free time per symbol fills every date from the calendar', afterRules.filter(v => v === '✕').length >= 1 && afterRules.filter(v => v === top).length >= 1 && afterRules.every(v => v === '✕' || v === top), `${top}: ${afterRules.filter(v => v === top).length}, ✕: ${afterRules.filter(v => v === '✕').length} of ${afterRules.length} (busy all day on ${start})`)

// busy rules: ✕ for a date with an event during the whole day, ○ for the rest
await rules.getByRole('button', { name: '埋まっていたら', exact: true }).click()
await rules.locator('[data-ics-rule="✕"]').getByLabel('終日').check()
await page.locator('input[type=file]').setInputFiles(calendar)
await page.waitForTimeout(1500)
const afterBusyRules = await selected(page)
ok('busy rules fill the busy date with ✕ and the others with ○', afterBusyRules.filter(v => v === '✕').length === afterRules.filter(v => v === '✕').length && afterBusyRules.filter(v => v === '○').length === afterBusyRules.length - afterBusyRules.filter(v => v === '✕').length, `✕: ${afterBusyRules.filter(v => v === '✕').length}, ○: ${afterBusyRules.filter(v => v === '○').length} of ${afterBusyRules.length}`)

// "適用" in the range panel says what it did: every date is answered and kept, so nothing changes
await page.getByRole('button', { name: '適用', exact: true }).first().click()
const rangeMessage = await page.getByRole('status').filter({ hasText: '入力済みの' }).first().innerText().catch(() => '')
ok('the range "適用" says it kept the answered dates', /^入力済みの\d+件は変えていません。/.test(rangeMessage), rangeMessage)
ok('event page has no horizontal overflow with the panel open', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
if (shots) await page.locator('form').first().screenshot({ path: `${shots}/verify-form.png` })

// create page: weekend dates on the calendar
await page.goto(base + '/', { waitUntil: 'load' })
await page.locator('[data-calendar-date]').first().waitFor()
await page.waitForTimeout(600)
for (const theme of ['dark', 'light']) {
  if (theme === 'light') { await page.locator('.theme-toggle').click(); await page.waitForTimeout(500) }
  const days = await page.locator('[data-calendar-date]').evaluateAll(buttons => buttons.map(b => ({ date: b.getAttribute('data-calendar-date'), weekday: new Date(`${b.getAttribute('data-calendar-date')}T00:00:00`).getDay() })))
  const values = []
  for (const weekday of [0, 6]) values.push(await contrastOf(page.locator(`[data-calendar-date="${days.find(d => d.weekday === weekday).date}"]`)))
  ok(`${theme} weekend dates are readable`, values.every(v => v >= 4.5), `Sunday ${values[0]}:1, Saturday ${values[1]}:1`)
}

// missing event page in the browser
await page.goto(base + '/e/zzzzzzzz', { waitUntil: 'load' })
await page.waitForTimeout(800)
ok('missing event shows the Japanese page with a way forward', await page.getByRole('heading', { name: 'ページが見つかりません' }).isVisible() && await page.getByRole('link', { name: '新しいイベントを作成する' }).getAttribute('href') === '/')
if (shots) await page.screenshot({ path: `${shots}/verify-notfound.png`, clip: { x: 0, y: 0, width: 390, height: 330 } })

ok('no page errors', errors.length === 0, errors.join(' | '))
await browser.close()
console.log(results.join('\n'))
const failed = results.some(r => r.startsWith('FAIL'))
console.log(failed ? 'SOME CHECKS FAILED' : 'ALL CHECKS PASSED')
process.exitCode = failed ? 1 : 0
