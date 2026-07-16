import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'お問い合わせ',
  description: '日程組に関する不具合のご報告・ご要望などの連絡先をご案内します。',
  alternates: {
    canonical: '/contact',
  },
}

export default function ContactPage() {
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
          <h1 className="font-serif text-2xl text-rose-800">お問い合わせ</h1>
          <p className="mt-2 text-sm leading-relaxed text-stone-600">
            日程組は個人が運営するサービスです。不具合のご報告・ご要望・ご質問などは、
            下記のメールアドレスまでお気軽にお送りください。
          </p>

          <h2 className="mt-6 font-serif text-base text-rose-800">連絡先</h2>
          <p className="mt-2">
            <a
              href="mailto:knihud@gmail.com"
              className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-white px-4 py-2 text-sm font-medium text-rose-700 underline-offset-2 transition-colors hover:bg-rose-50 hover:underline"
            >
              ✉ knihud@gmail.com
            </a>
          </p>
          <p className="mt-2 text-xs leading-relaxed text-stone-400">
            押すとメールアプリが開きます。開かない場合は、上記アドレスを宛先にコピーしてお送りください。
          </p>

          <h2 className="mt-6 font-serif text-base text-rose-800">
            不具合のご報告に書き添えていただきたいこと
          </h2>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm leading-relaxed text-stone-600">
            <li>対象のイベントページのURL（あれば）</li>
            <li>どの操作をしたときに、何が起きたか</li>
            <li>お使いの端末（スマートフォン / PC）とブラウザ</li>
            <li>画面のスクリーンショット（あれば）</li>
          </ul>
          <p className="mt-1 text-sm leading-relaxed text-stone-600">
            すべてそろっていなくても大丈夫です。わかる範囲でお知らせください。
          </p>

          <h2 className="mt-6 font-serif text-base text-rose-800">お問い合わせの前に</h2>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm leading-relaxed text-stone-600">
            <li>
              回答（名前・出欠・コメント）は、イベントページの回答一覧からご自身でいつでも編集・削除できます。
            </li>
            <li>最後の更新から1年が経過したイベントは、自動的に削除されます。</li>
          </ul>

          <h2 className="mt-6 font-serif text-base text-rose-800">ご注意</h2>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm leading-relaxed text-stone-600">
            <li>個人での運営のため、返信までお時間をいただく場合や、返信できない場合があります。</li>
            <li>
              お送りいただいた内容とメールアドレスは、お問い合わせへの対応以外の目的には使用しません。
            </li>
          </ul>

          <p className="mt-6 text-xs text-stone-400">
            <Link
              href="/terms"
              className="underline-offset-2 transition-colors hover:text-rose-700 hover:underline"
            >
              利用規約
            </Link>
            <span className="mx-2">·</span>
            <Link
              href="/privacy"
              className="underline-offset-2 transition-colors hover:text-rose-700 hover:underline"
            >
              プライバシーポリシー
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
