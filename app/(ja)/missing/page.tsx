import type { Metadata } from 'next'
import NotFoundPage from '@/app/NotFoundPage'

// 「見つかりません」ページ。scripts/finish-export.mjs が out/404.html に移し、
// Cloudflare が、どのファイルにも当たらない URL と、custom-worker.mjs が見つけられなかったイベントに 404 で返す
export const metadata: Metadata = { robots: { index: false } }

export default function Missing() {
  return <NotFoundPage />
}
