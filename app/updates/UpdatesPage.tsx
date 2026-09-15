import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { LanguageSwitch } from '../LanguageSwitch'
import { ServiceShareLink } from '../ServiceShareLink'
import { getI18n, type Locale } from '@/lib/i18n'
import { updates } from '@/lib/updates'

export const metadata: Metadata = {
  title: '更新履歴',
  description: '日程組の新機能・改善・不具合修正の記録です。',
  alternates: {
    canonical: '/updates',
    languages: { ja: '/updates', en: '/en/updates', 'x-default': '/updates' },
  },
}

export default function UpdatesPage({ locale = 'ja' }: { locale?: Locale }) {
  const { t, path } = getI18n(locale)
  const dateFormat = new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'ja-JP', {
    year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
  })

  return (
    <main className="min-h-screen px-4 py-2">
      <div className="mx-auto max-w-xl">
        <div className="mb-1 flex min-h-10 items-center pl-10">
          <Link href={path('/')} className="text-xs text-stone-600 underline-offset-2 hover:text-rose-700 hover:underline">
            {t('← 日程組 トップへ')}
          </Link>
        </div>
        <header className="flex items-center gap-3 pb-1.5">
          <Image src="/icon.png" alt="" width={28} height={28} unoptimized className="h-7 w-7 shrink-0" />
          <h1 className="font-serif text-2xl text-rose-800">{t('更新履歴')}</h1>
        </header>
        <p className="mb-2 text-xs leading-relaxed text-stone-600">
          {t('2026年9月6日以前はGitの変更記録から再構成しています。日付は日本時間の変更日で、実際の公開日とは異なる場合があります。')}
        </p>
        {updates.map(entry => (
          <article key={entry.date} id={`update-${entry.date}`} aria-labelledby={`title-${entry.date}`}
            className="border-t border-stone-300 py-2 [overflow-wrap:anywhere]">
            <time dateTime={entry.date} className="text-xs text-stone-600">
              {dateFormat.format(new Date(`${entry.date}T00:00:00Z`))}
            </time>
            <h2 id={`title-${entry.date}`} className="mt-0.5 text-base font-medium leading-6 text-stone-700">{t(entry.title)}</h2>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm leading-relaxed text-stone-600">
              {entry.changes.map(change => <li key={change}>{t(change)}</li>)}
            </ul>
          </article>
        ))}
        <nav aria-label={t('更新履歴')} className="footer-links mt-1 text-xs text-stone-600">
          <Link href={path('/contact')} className="underline-offset-2 hover:text-rose-700 hover:underline">{t('お問い合わせ')}</Link>
          <span className="mx-1">·</span>
          <LanguageSwitch />
          <span className="mx-1">·</span>
          <ServiceShareLink locale={locale} />
        </nav>
      </div>
    </main>
  )
}
