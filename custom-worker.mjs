// Cloudflare Workers のエントリーポイント。
// Next.js のリクエスト処理 (.open-next/worker.js はビルド時に生成される) に加えて、
// Cron Triggers から呼ばれる scheduled ハンドラーで古いイベントの自動削除を実行する。
import handler from './.open-next/worker.js'

// メンテナンス中は true にして deploy する。解除するときは false に戻して deploy。
// (cron の自動削除は scheduled ハンドラー経由なのでメンテ中も動き続ける)
const MAINTENANCE = false

const GOOGLE_SITE_VERIFICATION_PATH = '/googlecc8378481687d5f8.html'
const GOOGLE_SITE_VERIFICATION_CONTENT =
  'google-site-verification: googlecc8378481687d5f8.html'

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
</div>
</body>
</html>`

const worker = {
  fetch: (request, env, ctx) => {
    if (new URL(request.url).pathname === GOOGLE_SITE_VERIFICATION_PATH) {
      return new Response(GOOGLE_SITE_VERIFICATION_CONTENT, {
        status: 200,
        headers: {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'public, max-age=3600',
        },
      })
    }

    if (MAINTENANCE) {
      return new Response(maintenanceHtml, {
        status: 503,
        headers: {
          'content-type': 'text/html; charset=utf-8',
          'retry-after': '3600',
          'cache-control': 'no-store',
        },
      })
    }
    return handler.fetch(request, env, ctx)
  },

  async scheduled(controller, env, ctx) {
    const request = new Request('https://cron.internal/api/cleanup-old-events', {
      headers: { authorization: `Bearer ${env.CRON_SECRET ?? ''}` },
    })
    const response = await handler.fetch(request, env, ctx)
    const body = await response.text()
    if (!response.ok) {
      console.error('cleanup-old-events failed', response.status, body)
      return
    }
    console.log('cleanup-old-events ok', body)
  },
}

export default worker
