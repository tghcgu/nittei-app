import type { Metadata } from 'next'
import Link from 'next/link'
import { LanguageSwitch } from '../LanguageSwitch'
import { HistoryList } from './HistoryList'
import { getI18n, type Locale } from '@/lib/i18n'

export const metadata: Metadata = {
  title: 'ページ表示履歴',
  description: 'この端末で開いた日程組のイベントページの一覧です。端末内にのみ保存されます。',
  alternates: {
    canonical: '/history',
    languages: { ja: '/history', en: '/en/history' },
  },
  // 端末ごとの内容で、検索結果に出しても意味がない
  robots: { index: false, follow: true },
}

export default function HistoryPage({ locale = 'ja' }: { locale?: Locale }) {
  const { t, path } = getI18n(locale)
  return (
    <div className="min-h-screen px-4 py-2">
      <div className="mx-auto max-w-xl">
        <div className="mb-1 flex min-h-10 items-center justify-between gap-2 pl-10">
          <Link
            href={path("/")}
            className="text-xs text-stone-600 transition-colors hover:text-rose-700"
          >{t("← 日程組 トップへ")}</Link>
          <LanguageSwitch />
        </div>

        <div className="rounded-2xl bg-white/70 px-6 py-3 shadow-sm backdrop-blur">
          <h1 className="font-serif text-2xl text-rose-800">{t("ページ表示履歴")}</h1>
          <p className="mt-1 text-sm leading-relaxed text-stone-600">{t("この端末で開いたイベントページの一覧です。 履歴はお使いのブラウザの中だけに保存され、サーバーには送信されません。 ブラウザのデータを消すと履歴も消えます。 履歴を消しても、イベントそのものやみんなの回答は消えません。")}</p>
          <HistoryList />
        </div>
      </div>
    </div>
  )
}
