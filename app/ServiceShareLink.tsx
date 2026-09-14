import { getI18n, type Locale } from '@/lib/i18n'
import { siteUrl } from '@/lib/site'

export function ServiceShareLink({ locale }: { locale: Locale }) {
  const { t, path } = getI18n(locale)
  const query = new URLSearchParams({
    text: t('日程組は、ログイン不要の日程調整・出欠管理ツールです。候補日を作ってURLを共有するだけ。'),
    url: siteUrl + path('/'),
    lang: locale,
  })

  return (
    <a href={`https://x.com/intent/tweet?${query}`} target="_blank" rel="noopener noreferrer"
      title={t('日程組の紹介文をXの投稿画面で開く')}
      className="whitespace-nowrap underline underline-offset-2 transition-colors hover:text-rose-700">
      {t('よければXでシェア')}
    </a>
  )
}
