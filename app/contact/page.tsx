import type { Metadata } from 'next'
import Link from 'next/link'
import { ContactForm } from './ContactForm'

export const metadata: Metadata = {
  title: 'お問い合わせ',
  description: '日程組に関する不具合のご報告・ご要望を送信できるフォームです。',
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
            不具合のご報告・ご要望・ご質問などは、下のフォームからお送りください。
          </p>

          <ContactForm />

          <h2 className="mt-8 font-serif text-base text-rose-800">お問い合わせの前に</h2>
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
