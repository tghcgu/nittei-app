import type { Metadata } from 'next'
import Link from 'next/link'
import { LanguageSwitch } from '../LanguageSwitch'
import { getI18n, type Locale } from '@/lib/i18n'
import { contactFormUrl, contactImageFormUrl } from '@/lib/site'

export const metadata: Metadata = {
  title: 'お問い合わせ',
  description: '日程組に関する不具合のご報告・ご要望などの連絡先をご案内します。',
  alternates: {
    canonical: '/contact',
    languages: { ja: '/contact', en: '/en/contact' },
  },
}

export default function ContactPage({ locale = 'ja' }: { locale?: Locale }) {
  const { t, path } = getI18n(locale)
  return (
    <div className="min-h-screen px-4 py-2">
      <div className="mx-auto max-w-xl">
        <div className="mb-1 flex min-h-10 items-center pl-10">
          <Link
            href={path("/")}
            className="text-xs text-stone-400 transition-colors hover:text-rose-700"
          >{t("← 日程組 トップへ")}</Link>
        </div>

        <div className="rounded-2xl bg-white/70 px-6 py-3 shadow-sm backdrop-blur">
          <h1 className="font-serif text-2xl text-rose-800">{t("お問い合わせ")}</h1>
          <p className="mt-1 text-sm leading-relaxed text-stone-600">{t("日程組は個人が運営するサービスです。不具合のご報告・ご要望・ご質問などは、下のフォームからお気軽にお送りください。")}</p>

          <p className="mt-2">
            <a
              href={contactFormUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-white px-4 py-2 text-sm font-medium text-rose-700 underline-offset-2 transition-colors hover:bg-rose-50 hover:underline"
            >{t("お問い合わせフォームを開く ↗")}</a>
          </p>
          <p className="mt-1 text-xs leading-relaxed text-stone-600">{t("Google フォームが別のタブで開きます。ログインは不要です。返信が必要な場合は、フォームの最後にメールアドレスを書いてください。")}</p>

          <h2 className="mt-3 font-serif text-base text-rose-800">{t("不具合のご報告に書き添えていただきたいこと")}</h2>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm leading-relaxed text-stone-600">
            <li>{t("対象のイベントページのURL（あれば）")}</li>
            <li>{t("どの操作をしたときに、何が起きたか")}</li>
            <li>{t("お使いの端末（スマートフォン / PC）とブラウザ")}</li>
          </ul>
          <p className="mt-1 text-sm leading-relaxed text-stone-600">{t("すべてそろっていなくても大丈夫です。わかる範囲でお知らせください。")}</p>

          <h2 className="mt-3 font-serif text-base text-rose-800">{t("画像を送りたいとき")}</h2>
          <p className="mt-1 text-sm leading-relaxed text-stone-600">{t("スクリーンショットなどの画像は、下のフォームで添付できます。Google アカウントでのログインが必要です。送ると、アカウントの名前・メールアドレス・写真が運営者に伝わります。")}</p>
          <p className="mt-2">
            <a
              href={contactImageFormUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full border border-stone-300 bg-white px-4 py-2 text-sm text-stone-700 underline-offset-2 transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 hover:underline"
            >{t("画像を添付できるフォームを開く ↗")}</a>
          </p>
          <p className="mt-1 text-xs leading-relaxed text-stone-600">{t("ログインしたくない場合は、上のフォームに返信先メールアドレスを書いてください。こちらからご連絡します。")}</p>

          <h2 className="mt-3 font-serif text-base text-rose-800">{t("お問い合わせの前に")}</h2>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm leading-relaxed text-stone-600">
            <li>{t("回答（名前・出欠・コメント）は、イベントページの回答一覧からご自身でいつでも編集・削除できます。")}</li>
            <li>{t("最後の更新から1年が経過したイベントは、自動的に削除されます。")}</li>
          </ul>

          <h2 className="mt-3 font-serif text-base text-rose-800">{t("ご注意")}</h2>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm leading-relaxed text-stone-600">
            <li>{t("個人での運営のため、返信までお時間をいただく場合や、返信できない場合があります。")}</li>
            <li>{t("お送りいただいた内容とメールアドレスは、お問い合わせへの対応以外の目的には使用しません。")}</li>
          </ul>

          <p className="mt-3 text-xs text-stone-400">
            <Link
              href={path("/terms")}
              className="underline-offset-2 transition-colors hover:text-rose-700 hover:underline"
            >{t("利用規約")}</Link>
            <span className="mx-2">·</span>
            <Link
              href={path("/privacy")}
              className="underline-offset-2 transition-colors hover:text-rose-700 hover:underline"
            >{t("プライバシーポリシー")}</Link>
            <span className="mx-1">·</span>
            <LanguageSwitch />
          </p>
        </div>
      </div>
    </div>
  )
}
