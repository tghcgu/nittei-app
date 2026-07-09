import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: '利用規約',
  description: '日程組の利用条件・禁止事項・免責事項について定めます。',
  alternates: {
    canonical: '/terms',
  },
}

export default function TermsPage() {
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
          <h1 className="font-serif text-2xl text-rose-800">利用規約</h1>
          <p className="mt-2 text-sm leading-relaxed text-stone-600">
            この規約は、日程組（以下「本サービス」）の利用条件を定めるものです。
            利用者は、本サービスを利用することで本規約に同意したものとみなします。
          </p>

          <h2 className="mt-6 font-serif text-base text-rose-800">第1条（サービス内容）</h2>
          <p className="mt-1 text-sm leading-relaxed text-stone-600">
            本サービスは、ログイン不要で利用できる日程調整・出欠管理サービスです。個人が運営し、無料で現状のまま提供されます。
            機能は事前の告知なく追加・変更されることがあります。
          </p>

          <h2 className="mt-6 font-serif text-base text-rose-800">第2条（禁止事項）</h2>
          <p className="mt-1 text-sm leading-relaxed text-stone-600">
            利用者は、本サービスの利用にあたり、次の行為をしてはなりません。
          </p>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm leading-relaxed text-stone-600">
            <li>法令または公序良俗に違反する行為</li>
            <li>他者への誹謗中傷、嫌がらせ、なりすまし</li>
            <li>本人の同意なく他者の個人情報を書き込む行為</li>
            <li>過剰な自動アクセスなど、本サービスの運営を妨害する行為</li>
            <li>その他、運営者が不適切と判断する行為</li>
          </ul>

          <h2 className="mt-6 font-serif text-base text-rose-800">第3条（イベント・回答の削除）</h2>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm leading-relaxed text-stone-600">
            <li>
              運営者は、禁止事項に該当する内容、またはサービスの運営上必要と判断した場合、イベントや回答を予告なく削除できるものとします。
            </li>
            <li>最後の更新から1年が経過したイベントは、候補日・回答を含め自動的に削除されます。</li>
          </ul>

          <h2 className="mt-6 font-serif text-base text-rose-800">第4条（免責事項）</h2>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm leading-relaxed text-stone-600">
            <li>
              本サービスは無料のサービスとして現状のまま提供され、内容の正確性・完全性・可用性を保証するものではありません。
            </li>
            <li>
              システム障害・データの消失・自動削除・利用者間のトラブルなど、本サービスの利用により生じた損害について、
              運営者の故意または重大な過失による場合を除き、運営者は責任を負いません。
            </li>
          </ul>

          <h2 className="mt-6 font-serif text-base text-rose-800">第5条（サービスの変更・停止・終了）</h2>
          <p className="mt-1 text-sm leading-relaxed text-stone-600">
            運営者は、事前の告知なく、本サービスの全部または一部を変更・停止・終了できるものとします。
          </p>

          <h2 className="mt-6 font-serif text-base text-rose-800">第6条（規約の変更）</h2>
          <p className="mt-1 text-sm leading-relaxed text-stone-600">
            運営者は、必要に応じて本規約を変更できるものとします。重要な変更を行う場合は、本サービス上でお知らせします。
            変更後に本サービスの利用を継続した場合、変更後の規約に同意したものとみなします。
          </p>

          <h2 className="mt-6 font-serif text-base text-rose-800">第7条（個人情報の取り扱い）</h2>
          <p className="mt-1 text-sm leading-relaxed text-stone-600">
            利用者情報の取り扱いについては、
            <Link href="/privacy" className="text-rose-700 underline underline-offset-2 hover:text-rose-900">
              プライバシーポリシー
            </Link>
            をご覧ください。
          </p>

          <h2 className="mt-6 font-serif text-base text-rose-800">第8条（準拠法）</h2>
          <p className="mt-1 text-sm leading-relaxed text-stone-600">本規約は日本法に準拠します。</p>

          <h2 className="mt-6 font-serif text-base text-rose-800">第9条（お問い合わせ）</h2>
          <p className="mt-1 text-sm leading-relaxed text-stone-600">nittei.app5@gmail.com</p>

          <p className="mt-6 text-xs text-stone-400">制定日: 2026年7月9日</p>
        </div>
      </div>
    </div>
  )
}
