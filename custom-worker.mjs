// Cloudflare Workers のエントリーポイント。
// Next.js のリクエスト処理 (.open-next/worker.js はビルド時に生成される) に加えて、
// Cron Triggers から呼ばれる scheduled ハンドラーで古いイベントの自動削除を実行する。
import handler from './.open-next/worker.js'

const worker = {
  fetch: handler.fetch,

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
