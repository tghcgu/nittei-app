import Link from 'next/link'
import { getI18n, type Locale } from '@/lib/i18n'

// 存在しないイベントや打ち間違えたURLで表示する。削除済みイベントのリンクからも来るので、次にできることを示す
export default function NotFoundPage({ locale = 'ja' }: { locale?: Locale }) {
  const { t, path } = getI18n(locale)
  return (
    <div className="min-h-screen px-4 py-2">
      <div className="mx-auto max-w-xl">
        <div className="mb-1 flex min-h-10 items-center pl-10">
          <Link
            href={path("/")}
            className="text-xs text-stone-600 transition-colors hover:text-rose-700"
          >{t("← 日程組 トップへ")}</Link>
        </div>

        <div className="rounded-2xl bg-white/70 px-6 py-3 shadow-sm backdrop-blur">
          <h1 className="font-serif text-2xl text-rose-800">{t("ページが見つかりません")}</h1>
          <p className="mt-1 text-sm leading-relaxed text-stone-600">{t("URLが正しいかご確認ください。最後の更新から1年が経過したイベントは、自動的に削除されます。")}</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Link
              href={path("/")}
              className="rounded-full bg-rose-800 px-4 py-1.5 text-sm text-white transition-colors hover:bg-rose-900"
            >{t("新しいイベントを作成する")}</Link>
            <Link
              href={path("/history")}
              className="text-sm text-stone-600 underline hover:text-rose-700"
            >{t("ページ表示履歴")}</Link>
          </div>
        </div>
      </div>
    </div>
  )
}
