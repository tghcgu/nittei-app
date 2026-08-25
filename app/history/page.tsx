import type { Metadata } from 'next'
import Link from 'next/link'
import { HistoryList } from './HistoryList'

export const metadata: Metadata = {
  title: 'ページ表示履歴',
  description: 'この端末で開いた日程組のイベントページの一覧です。端末内にのみ保存されます。',
  alternates: {
    canonical: '/history',
  },
  // 端末ごとの内容で、検索結果に出しても意味がない
  robots: { index: false, follow: true },
}

export default function HistoryPage() {
  return (
    <div className="min-h-screen px-4 py-8">
      <div className="mx-auto max-w-xl">
        <div className="mb-3">
          <Link
            href="/"
            className="text-xs text-stone-600 transition-colors hover:text-rose-700"
          >
            ← 日程組 トップへ
          </Link>
        </div>

        <div className="rounded-2xl bg-white/70 px-6 py-6 shadow-sm backdrop-blur">
          <h1 className="font-serif text-2xl text-rose-800">ページ表示履歴</h1>
          <p className="mt-2 text-sm leading-relaxed text-stone-600">
            この端末で開いたイベントページの一覧です。
            履歴はお使いのブラウザの中だけに保存され、サーバーには送信されません。
            ブラウザのデータを消すと履歴も消えます。
          </p>
          <HistoryList />
        </div>
      </div>
    </div>
  )
}
