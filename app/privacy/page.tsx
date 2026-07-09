import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'プライバシーポリシー',
  description: '日程組における利用者情報・データの取り扱いについて説明します。',
  alternates: {
    canonical: '/privacy',
  },
}

export default function PrivacyPage() {
  return (
    <div className="min-h-screen px-4 py-8">
      <div className="mx-auto max-w-xl">
        <div className="mb-3">
          <Link
            href="/"
            className="text-xs text-stone-400 transition-colors hover:text-rose-700"
          >
            ← 日程組 トップへ
          </Link>
        </div>

        <div className="rounded-2xl bg-white/70 px-6 py-6 shadow-sm backdrop-blur">
          <h1 className="font-serif text-2xl text-rose-800">プライバシーポリシー</h1>
          <p className="mt-2 text-sm leading-relaxed text-stone-600">
            日程組（以下「本サービス」）は、個人が運営する日程調整・出欠管理サービスです。
            本サービスにおける利用者情報の取り扱いを、以下のとおり定めます。
          </p>

          <h2 className="mt-6 font-serif text-base text-rose-800">1. 収集する情報</h2>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm leading-relaxed text-stone-600">
            <li>
              利用者が入力する情報: イベント名・説明・候補日、回答者の名前、出欠の回答（○△✕−）とコメント
            </li>
            <li>
              自動的に収集する情報: アクセス状況の統計（Vercel Analytics / Speed Insights
              による閲覧ページ・ブラウザ種別など）。個人を特定する情報は含まれず、Cookieも使用していません。
            </li>
          </ul>

          <h2 className="mt-6 font-serif text-base text-rose-800">2. カレンダーファイル（.ics）の扱い</h2>
          <p className="mt-1 text-sm leading-relaxed text-stone-600">
            空き日程の読み込みに使うカレンダーファイル（.ics / zip）は、お使いのブラウザの中だけで処理され、
            サーバーに送信・保存されることはありません。保存されるのは、その結果として入力された出欠（○や✕）のみです。
          </p>

          <h2 className="mt-6 font-serif text-base text-rose-800">3. 利用目的</h2>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm leading-relaxed text-stone-600">
            <li>日程調整機能の提供（回答の保存・集計・表示）</li>
            <li>不具合の調査・対応、サービスの改善</li>
          </ul>
          <p className="mt-1 text-sm leading-relaxed text-stone-600">
            上記以外の目的には使用しません。
          </p>

          <h2 className="mt-6 font-serif text-base text-rose-800">4. 保存期間と削除</h2>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm leading-relaxed text-stone-600">
            <li>最後の更新から1年が経過したイベントは、候補日・回答を含め自動的に削除されます。</li>
            <li>回答（名前・出欠・コメント）は、イベントページの回答一覧からいつでも編集・削除できます。</li>
          </ul>

          <h2 className="mt-6 font-serif text-base text-rose-800">5. 第三者への提供</h2>
          <p className="mt-1 text-sm leading-relaxed text-stone-600">
            法令に基づく場合を除き、収集した情報を第三者に提供しません。広告目的での利用・提供も行っていません。
          </p>

          <h2 className="mt-6 font-serif text-base text-rose-800">6. 外部サービスの利用</h2>
          <p className="mt-1 text-sm leading-relaxed text-stone-600">
            データの保存に Supabase を、サイトの配信とアクセス解析に Vercel
            を利用しています。いずれも本サービスの運営に必要な範囲でのみ利用しています。
          </p>

          <h2 className="mt-6 font-serif text-base text-rose-800">7. イベントページの公開範囲</h2>
          <p className="mt-1 text-sm leading-relaxed text-stone-600">
            イベントページは、URLを知っている人なら誰でも閲覧・回答できます。検索エンジンに登録されない設定にしていますが、
            URLの共有範囲にはご注意ください。本名を知られたくない場合は、ニックネームでの回答をおすすめします。
          </p>

          <h2 className="mt-6 font-serif text-base text-rose-800">8. ポリシーの変更</h2>
          <p className="mt-1 text-sm leading-relaxed text-stone-600">
            必要に応じて本ポリシーを改定することがあります。重要な変更を行う場合は、本サービス上でお知らせします。
          </p>

          <h2 className="mt-6 font-serif text-base text-rose-800">9. お問い合わせ</h2>
          <p className="mt-1 text-sm leading-relaxed text-stone-600">nittei.app5@gmail.com</p>

          <p className="mt-6 text-xs text-stone-400">制定日: 2026年7月9日</p>
        </div>
      </div>
    </div>
  )
}
