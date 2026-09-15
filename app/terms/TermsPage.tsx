import type { Metadata } from 'next'
import Link from 'next/link'
import { LanguageSwitch } from '../LanguageSwitch'
import { getI18n, type Locale } from '@/lib/i18n'

export const metadata: Metadata = {
  title: '利用規約',
  description: '日程組の利用条件・禁止事項・免責事項について定めます。',
  alternates: {
    canonical: '/terms',
    languages: { ja: '/terms', en: '/en/terms' },
  },
}

export default function TermsPage({ locale = 'ja' }: { locale?: Locale }) {
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
          <h1 className="font-serif text-2xl text-rose-800">{t("利用規約")}</h1>
          <p className="mt-1 text-sm leading-relaxed text-stone-600">{t("この規約は、日程組（以下「本サービス」）の利用条件を定めるものです。 利用者は、本サービスを利用することで本規約に同意したものとみなします。")}</p>

          <h2 className="mt-3 font-serif text-base text-rose-800">{t("第1条（サービス内容）")}</h2>
          <p className="mt-1 text-sm leading-relaxed text-stone-600">{t("本サービスは、ログイン不要で利用できる日程調整・出欠管理サービスです。個人が運営し、無料で現状のまま提供されます。 機能は事前の告知なく追加・変更されることがあります。")}</p>

          <h2 className="mt-3 font-serif text-base text-rose-800">{t("第2条（ログインがないことによる特性）")}</h2>
          <p className="mt-1 text-sm leading-relaxed text-stone-600">{t("本サービスはアカウント登録を必要としません。そのため、次の点にご了承のうえご利用ください。")}</p>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm leading-relaxed text-stone-600">
            <li>{t("イベントページのURLを知っている人は、誰でもその内容を閲覧できます。URLがそのままアクセス権になります。")}</li>
            <li>{t("URLを知っている人は、イベント名・説明・候補日時の編集、他の人の回答の編集・削除も行えます。 本人確認の仕組みはありません。")}</li>
            <li>{t("回答者名は自由に入力できるため、入力された名前が本人のものであることは保証されません。")}</li>
            <li>{t("以上の理由から、URLの共有範囲は利用者ご自身で管理してください。 また、他人に知られて困る情報は書き込まないでください。")}</li>
          </ul>

          <h2 className="mt-3 font-serif text-base text-rose-800">{t("第3条（投稿内容の責任）")}</h2>
          <p className="mt-1 text-sm leading-relaxed text-stone-600">{t("イベント名・説明・回答者名・メモなど、利用者が入力した内容の責任は、入力した利用者が負うものとします。 運営者は、入力された内容を常時監視する義務を負いません。")}</p>

          <h2 className="mt-3 font-serif text-base text-rose-800">{t("第4条（禁止事項）")}</h2>
          <p className="mt-1 text-sm leading-relaxed text-stone-600">{t("利用者は、本サービスの利用にあたり、次の行為をしてはなりません。")}</p>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm leading-relaxed text-stone-600">
            <li>{t("法令または公序良俗に違反する行為")}</li>
            <li>{t("他者への誹謗中傷、嫌がらせ、なりすまし")}</li>
            <li>{t("本人の同意なく他者の個人情報を書き込む行為")}</li>
            <li>{t("他の利用者のイベントや回答を、正当な理由なく改ざん・削除する行為")}</li>
            <li>{t("過剰な自動アクセスなど、本サービスの運営を妨害する行為")}</li>
            <li>{t("その他、運営者が不適切と判断する行為")}</li>
          </ul>

          <h2 className="mt-3 font-serif text-base text-rose-800">{t("第5条（イベント・回答の削除）")}</h2>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm leading-relaxed text-stone-600">
            <li>{t("運営者は、禁止事項に該当する内容、またはサービスの運営上必要と判断した場合、イベントや回答を予告なく削除できるものとします。")}</li>
            <li>{t("最後の更新から1年が経過したイベントは、候補日・回答を含め自動的に削除されます。")}</li>
            <li>{t("削除されたデータを復元する手段はありません。必要な情報は、利用者ご自身で控えを取ってください。")}</li>
          </ul>

          <h2 className="mt-3 font-serif text-base text-rose-800">{t("第6条（カレンダーファイルと端末内の保存）")}</h2>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm leading-relaxed text-stone-600">
            <li>{t("空き日程の読み込みに使うカレンダーファイル（.ics / zip）は、お使いのブラウザの中だけで処理されます。 ファイルそのものがサーバーへ送信・保存されることはありません。")}</li>
            <li>{t("ページ表示履歴・表示テーマ・表の表示設定などは、お使いのブラウザの中にのみ保存されます。 詳しくは")}<Link href={path("/privacy")} className="text-rose-700 underline underline-offset-2 hover:text-rose-900">{t("プライバシーポリシー")}</Link>{t("をご覧ください。")}</li>
          </ul>

          <h2 className="mt-3 font-serif text-base text-rose-800">{t("第7条（支援について）")}</h2>
          <p className="mt-1 text-sm leading-relaxed text-stone-600">{t("本サービスには、運営者への任意の支援窓口として外部サイトへのリンクを掲載しています。 支援は完全に任意であり、支援の有無によって本サービスの機能や利用条件が変わることはありません。 支援は対価の支払いではなく、返金の対象にもなりません。")}</p>

          <h2 className="mt-3 font-serif text-base text-rose-800">{t("第8条（外部サービス）")}</h2>
          <p className="mt-1 text-sm leading-relaxed text-stone-600">{t("本サービスは、データの保存やサイトの配信のために外部サービスを利用しており、 外部サイトへのリンクも掲載しています。リンク先の内容について、運営者は責任を負いません。")}</p>

          <h2 className="mt-3 font-serif text-base text-rose-800">{t("第9条（免責事項）")}</h2>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm leading-relaxed text-stone-600">
            <li>{t("本サービスは無料のサービスとして現状のまま提供され、内容の正確性・完全性・可用性を保証するものではありません。")}</li>
            <li>{t("システム障害・データの消失・自動削除・第三者による書き換え・利用者間のトラブルなど、 本サービスの利用により生じた損害について、運営者の故意または重大な過失による場合を除き、 運営者は責任を負いません。")}</li>
          </ul>

          <h2 className="mt-3 font-serif text-base text-rose-800">{t("第10条（サービスの変更・停止・終了）")}</h2>
          <p className="mt-1 text-sm leading-relaxed text-stone-600">{t("運営者は、事前の告知なく、本サービスの全部または一部を変更・停止・終了できるものとします。")}</p>

          <h2 className="mt-3 font-serif text-base text-rose-800">{t("第11条（規約の変更）")}</h2>
          <p className="mt-1 text-sm leading-relaxed text-stone-600">{t("運営者は、必要に応じて本規約を変更できるものとします。重要な変更を行う場合は、本サービス上でお知らせします。 変更後に本サービスの利用を継続した場合、変更後の規約に同意したものとみなします。")}</p>

          <h2 className="mt-3 font-serif text-base text-rose-800">{t("第12条（個人情報の取り扱い）")}</h2>
          <p className="mt-1 text-sm leading-relaxed text-stone-600">{t("利用者情報の取り扱いについては、")}<Link href={path("/privacy")} className="text-rose-700 underline underline-offset-2 hover:text-rose-900">{t("プライバシーポリシー")}</Link>{t("をご覧ください。")}</p>

          <h2 className="mt-3 font-serif text-base text-rose-800">{t("第13条（準拠法）")}</h2>
          <p className="mt-1 text-sm leading-relaxed text-stone-600">{t("本規約は日本法に準拠します。")}</p>

          <h2 className="mt-3 font-serif text-base text-rose-800">{t("第14条（お問い合わせ）")}</h2>
          <p className="mt-1 text-sm leading-relaxed text-stone-600">{t("本サービスに関するお問い合わせは、")}<Link
              href={path("/contact")}
              className="underline underline-offset-2 transition-colors hover:text-rose-700"
            >{t("お問い合わせページ")}</Link>{t("からお送りください。")}</p>

          <p className="mt-3 text-xs text-stone-600">{t("制定日: 2026年7月9日")}<span className="mx-2">·</span>{t("最終改定日: 2026年9月3日")}</p>
        </div>
      </div>
    </div>
  )
}
