// 日程組の Worker。同じコードが2か所で動く（scripts/cloudflare.mjs が配置する）。
//
// 1. サイト本体 https://nitei.pages.dev（Cloudflare Pages の _worker.js）。
//    どのページも、ビルドのときに書き出したファイル（out/）で、Cloudflare は Worker を動かさずに返す
//    （安全のためのヘッダーは public/_headers）。Worker が動くのは out/_routes.json に書いた次の2つだけ:
//    - Google の所有確認ファイル（下の GOOGLE_SITE_VERIFICATION_PATH）
//    - /e/<共有ID> と /en/e/<共有ID>: Supabase からイベントと候補日を読み、共通のページ e/_（en/e/_）に、
//      イベントのタイトル・共有リンクのプレビュー用のタグと、イベントの中身（JSON）を入れて返す。
//      中身は app/e/[shareId]/EventLoader.tsx が読む。見つからないイベントには 404 ページを返す。
// 2. 前の住所 https://nittei-app.qoj.workers.dev（Worker nittei-app。wrangler.jsonc に REDIRECT_TO がある）。
//    どのページも新しい住所の同じ場所へ送る（redirectResponse）。毎日の Cron Trigger で、
//    最後の更新から365日たったイベントを消す（Pages では Cron が動かないため、ここに残している）。
// Supabase の返事を待つ時間は CPU 時間に数えないので、1回の CPU は数ms で、
// Workers Free の上限（1回10ms）に収まる。前の作り（サーバーで Next.js を動かす）は 20〜600ms かかり、打ち切られていた。

// 環境ごとの値（scripts/cloudflare.mjs が .env.local から渡す）
// SUPABASE_URL, SUPABASE_KEY（公開用のキー。ブラウザーにも入っている）
// SUPABASE_SERVICE_ROLE_KEY（秘密。npx wrangler secret put で設定済み。自動削除だけに使う）
// REDIRECT_TO（前の住所の Worker だけ。転送先）

import { englishDescription, englishSiteName, englishTitle, siteDescription, siteName, siteTitle, siteUrl } from './lib/site.ts'

// メンテナンス中は true にして deploy する。全ページで出すには、out/_routes.json の include を ["/*"] にする
const MAINTENANCE = false

// Google Search Console の所有確認ファイル。ファイルにすると Cloudflare が .html を外した URL へ転送してしまうため、ここで返す
const GOOGLE_SITE_VERIFICATION_PATH = '/googlecc8378481687d5f8.html'
const GOOGLE_SITE_VERIFICATION_CONTENT = 'google-site-verification: googlecc8378481687d5f8.html'

const EVENT_COLUMNS = 'id,share_id,name,description,answer_choices,created_at,updated_at'
const CANDIDATE_COLUMNS = 'id,event_id,date,time_label,sort_order'
const SHARE_ID = /^[A-Za-z0-9_-]{1,100}$/
const SUPABASE_TIMEOUT_MS = 8000

// public/_headers と同じ。Worker が作る返事には _headers が付かないので、ここで付ける
const SECURITY_HEADERS = {
  'Content-Security-Policy': "frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), browsing-topics=()',
  'Strict-Transport-Security': 'max-age=31536000',
}

// 前の住所から持っていく保存データ（URL の # の後ろに入れる）の上限。長すぎる URL を開けない端末があるため、
// 表示履歴は新しいものから、ここに収まる分だけ持っていく
const MOVE_LIMIT = 30000

const RETENTION_DAYS = 365
const DELETE_BATCH_SIZE = 200
const MAX_DELETE_BATCHES = 20

const maintenanceHtml = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>メンテナンス中 - 日程組</title>
<style>
  body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
         background: linear-gradient(160deg, #f5efe4, #efe6d4); color: #44403c;
         font-family: "Noto Sans JP", "Hiragino Sans", "Yu Gothic", sans-serif; }
  .card { max-width: 26rem; margin: 1rem; padding: 2.5rem 2rem; text-align: center;
          background: rgba(255,255,255,.7); border-radius: 1rem; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
  h1 { font-family: "Noto Serif JP", serif; font-size: 1.5rem; color: #9f1239; margin: 0 0 1rem; }
  p { font-size: .9rem; line-height: 1.8; margin: .5rem 0; }
  .small { font-size: .75rem; color: #a8a29e; margin-top: 1.5rem; }
</style>
</head>
<body>
<div class="card">
  <h1>ただいまメンテナンス中です</h1>
  <p>日程組は現在、緊急メンテナンスのため一時的にご利用いただけません。</p>
  <p>データは保持されています。しばらく時間をおいて、再度アクセスしてください。</p>
  <p class="small"><a href="https://docs.google.com/forms/d/e/1FAIpQLSfs7Y18jKm8-xVUJIrgySDCUD5ux36WAm_FqkYhgewlGAZOMA/viewform">お問い合わせフォーム</a></p>
</div>
</body>
</html>`

function withHeaders(response, status, extra = {}) {
  const headers = new Headers(response.headers)
  // 中身を書き換えたページに、元のファイルの長さや版（ETag）を残さない
  for (const name of ['content-length', 'etag', 'last-modified']) headers.delete(name)
  for (const [name, value] of Object.entries({ ...SECURITY_HEADERS, ...extra })) headers.set(name, value)
  return new Response(response.body, { status, headers })
}

function supabaseHeaders(key, shareId) {
  // supabase-js と同じ。共有IDは、main の DB（secure-scheduling.sql）がどのイベントを読めるかの判断に使う
  return { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json', 'x-nittei-share-id': shareId }
}

async function readRows(url, headers) {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(SUPABASE_TIMEOUT_MS) })
  if (!response.ok) throw new Error(`Supabase ${response.status}: ${(await response.text()).slice(0, 200)}`)
  return response.json()
}

// 見つからなければ null。DB が答えないときは例外
async function readEvent(env, shareId) {
  const base = `${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1`
  const headers = supabaseHeaders(env.SUPABASE_KEY, shareId)
  const [event] = await readRows(`${base}/events?select=${EVENT_COLUMNS}&share_id=eq.${encodeURIComponent(shareId)}`, headers)
  if (!event) return null
  const candidates = await readRows(`${base}/candidates?select=${CANDIDATE_COLUMNS}&event_id=eq.${encodeURIComponent(event.id)}&order=sort_order.asc`, headers)
  return { event, candidates }
}

// <script> の中に置いても途中で閉じられないようにした JSON
function scriptSafeJson(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')
}

function escapeHtml(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

// 共通ページに、イベントのタイトル・説明・URL・共有リンクのプレビュー用のタグと、イベントの中身を入れる。
// 値は、前にサーバーで作っていたもの（generateEventMetadata）と同じ。共通ページにはこれらのタグが入っていない
function fillEventPage(page, data, english) {
  const { event } = data
  const title = `${event.name}-${english ? englishTitle : siteTitle}`
  const description = (event.description ?? '').replace(/\s+/g, ' ').trim() || (english ? englishDescription : siteDescription)
  const eventPath = (locale) => `${locale === 'en' ? '/en' : ''}/e/${encodeURIComponent(event.share_id)}`
  const url = siteUrl + eventPath(english ? 'en' : 'ja')
  const tags = [
    `<title>${escapeHtml(title)}</title>`,
    `<meta name="description" content="${escapeHtml(description)}"/>`,
    `<link rel="canonical" href="${escapeHtml(url)}"/>`,
    `<link rel="alternate" hreflang="ja" href="${escapeHtml(siteUrl + eventPath('ja'))}"/>`,
    `<link rel="alternate" hreflang="en" href="${escapeHtml(siteUrl + eventPath('en'))}"/>`,
    // 共有リンクのプレビューは文字だけ（大きな画像は 2026-10-03 にやめた）
    `<meta property="og:title" content="${escapeHtml(title)}"/>`,
    `<meta property="og:description" content="${escapeHtml(description)}"/>`,
    `<meta property="og:url" content="${escapeHtml(url)}"/>`,
    `<meta property="og:site_name" content="${escapeHtml(english ? englishSiteName : siteName)}"/>`,
    `<meta property="og:locale" content="${english ? 'en_US' : 'ja_JP'}"/>`,
    '<meta property="og:type" content="website"/>',
    '<meta name="twitter:card" content="summary"/>',
    `<meta name="twitter:title" content="${escapeHtml(title)}"/>`,
    `<meta name="twitter:description" content="${escapeHtml(description)}"/>`,
  ].join('')
  return new HTMLRewriter()
    .on('head', {
      element(head) {
        head.prepend(`<script id="nittei-event" type="application/json">${scriptSafeJson(data)}</script>`, { html: true })
        head.append(tags, { html: true })
      },
    })
    .transform(page)
}

// ブラウザーのヘッダー（If-None-Match など）は渡さない。渡すと「変わっていない（304）」が返り、中身が空になる
async function assetPage(env, request, path) {
  return env.ASSETS.fetch(new Request(new URL(path, request.url)))
}

async function eventResponse(request, env) {
  const url = new URL(request.url)
  const match = url.pathname.match(/^(\/en)?\/e\/([^/]+)\/?$/)
  const english = url.pathname.startsWith('/en/')
  const notFound = async () => withHeaders(await assetPage(env, request, english ? '/en/404' : '/404'), 404)

  // Next.js が画面を切り替えずに読みに来る部分データ（.txt や RSC）は無い。404 にすると、普通にページを開き直す
  const partial = request.headers.get('RSC') || url.searchParams.has('_rsc') || url.pathname.endsWith('.txt')
  if (!match || partial || !['GET', 'HEAD'].includes(request.method)) return notFound()
  let shareId
  try {
    shareId = decodeURIComponent(match[2])
  } catch {
    return notFound()
  }
  if (!SHARE_ID.test(shareId)) return notFound()

  const shell = await assetPage(env, request, english ? '/en/e/_' : '/e/_')
  let data
  try {
    data = await readEvent(env, shareId)
  } catch (error) {
    // DB が答えないときは、中身なしの共通ページを返す。ブラウザーが自分で読み直し、だめなら案内を出す
    console.error('reading the event failed', shareId, error)
    return withHeaders(shell, 200, { 'Cache-Control': 'no-store' })
  }
  if (!data) return notFound()
  // 回答や編集ですぐ変わるので、どこにも保存させない
  return withHeaders(fillEventPage(shell, data, english), 200, { 'Cache-Control': 'no-store' })
}

// 前の住所で動くとき: どのページも新しい住所の同じ場所へ送る。検索エンジンやリンクのプレビューには 301。
// ブラウザーで開いたときは、前の住所に保存されていたもの（ページ表示履歴・設定など nittei- で始まるもの）を
// 新しい住所へ持っていく小さなページを返す。受け取る側は app/SiteLayout.tsx の moveFromPreviousSiteScript
function redirectResponse(request, target) {
  const url = new URL(request.url)
  const to = target.replace(/\/$/, '') + url.pathname + url.search
  const browser = request.method === 'GET' && request.headers.get('Sec-Fetch-Mode') === 'navigate'
  if (!browser) return new Response(null, { status: 301, headers: { ...SECURITY_HEADERS, Location: to } })
  return new Response(movePage(to), {
    headers: { ...SECURITY_HEADERS, 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}

function movePage(to) {
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="robots" content="noindex">
<title>日程組</title>
<script>
(() => {
  let hash = location.hash.replace(/(^#|&)nittei-move=[^&]*/, '').replace(/^&/, '#')
  try {
    if (!localStorage.getItem('nittei-moved')) {
      const data = {}
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key && key.startsWith('nittei-') && key !== 'nittei-history') data[key] = localStorage.getItem(key)
      }
      let history = []
      try { history = JSON.parse(localStorage.getItem('nittei-history') || '[]') } catch {}
      if (Array.isArray(history)) {
        const kept = []
        for (const entry of history) {
          const next = { ...data, 'nittei-history': JSON.stringify([...kept, entry]) }
          if (encodeURIComponent(JSON.stringify(next)).length > ${MOVE_LIMIT}) break
          kept.push(entry)
        }
        if (kept.length) data['nittei-history'] = JSON.stringify(kept)
      }
      const moved = encodeURIComponent(JSON.stringify(data))
      if (Object.keys(data).length && moved.length <= ${MOVE_LIMIT}) {
        hash = (hash && hash !== '#' ? hash + '&' : '#') + 'nittei-move=' + moved
        localStorage.setItem('nittei-moved', new Date().toISOString())
      }
    }
  } catch {}
  location.replace(${scriptSafeJson(to)} + (hash === '#' ? '' : hash))
})()
</script>
</head>
<body><p><a href="${escapeHtml(to)}">日程組は ${escapeHtml(new URL(to).host)} に移りました / Nitteigumi has moved</a></p></body>
</html>`
}

function cutoffIso(days) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
}

// 最後の更新から365日たったイベントを消す（回答・候補日は DB の on delete cascade で一緒に消える）
async function deleteOldEvents(env) {
  if (!env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured')
  const base = `${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/events`
  const key = env.SUPABASE_SERVICE_ROLE_KEY
  const headers = { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' }
  const cutoff = cutoffIso(RETENTION_DAYS)
  let deletedCount = 0
  let batches = 0
  for (; batches < MAX_DELETE_BATCHES; batches++) {
    const oldEvents = await readRows(`${base}?select=id&updated_at=lt.${encodeURIComponent(cutoff)}&order=updated_at.asc&limit=${DELETE_BATCH_SIZE}`, headers)
    if (oldEvents.length === 0) break
    const ids = oldEvents.map((event) => event.id).join(',')
    const response = await fetch(`${base}?id=in.(${ids})&updated_at=lt.${encodeURIComponent(cutoff)}`, {
      method: 'DELETE',
      headers: { ...headers, Prefer: 'count=exact,return=minimal' },
      signal: AbortSignal.timeout(SUPABASE_TIMEOUT_MS),
    })
    if (!response.ok) throw new Error(`Supabase delete ${response.status}: ${(await response.text()).slice(0, 200)}`)
    deletedCount += Number(response.headers.get('content-range')?.split('/')[1] ?? 0) || 0
    if (oldEvents.length < DELETE_BATCH_SIZE) break
  }
  return { cutoff, deletedCount, reachedBatchLimit: batches >= MAX_DELETE_BATCHES, retentionDays: RETENTION_DAYS }
}

const worker = {
  async fetch(request, env) {
    if (MAINTENANCE) {
      return new Response(maintenanceHtml, {
        status: 503,
        headers: { ...SECURITY_HEADERS, 'content-type': 'text/html; charset=utf-8', 'retry-after': '3600', 'cache-control': 'no-store' },
      })
    }
    // 前の住所の所有確認も Search Console に残しておくため、転送より先に返す
    if (new URL(request.url).pathname === GOOGLE_SITE_VERIFICATION_PATH) {
      return new Response(GOOGLE_SITE_VERIFICATION_CONTENT, {
        headers: { ...SECURITY_HEADERS, 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=3600' },
      })
    }
    if (env.REDIRECT_TO) return redirectResponse(request, env.REDIRECT_TO)
    return eventResponse(request, env)
  },

  async scheduled(controller, env) {
    try {
      console.log('cleanup-old-events ok', JSON.stringify(await deleteOldEvents(env)))
    } catch (error) {
      console.error('cleanup-old-events failed', error instanceof Error ? error.message : error)
      throw error
    }
  },
}

export default worker
