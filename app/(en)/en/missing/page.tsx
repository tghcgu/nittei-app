import type { Metadata } from 'next'
import NotFoundPage from '@/app/NotFoundPage'

// 英語の「見つかりません」ページ。scripts/finish-export.mjs が out/en/404.html に移し、/en/ の下で使われる
export const metadata: Metadata = { robots: { index: false } }

export default function Missing() {
  return <NotFoundPage locale="en" />
}
