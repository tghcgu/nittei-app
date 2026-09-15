import { getI18n, type Locale } from '@/lib/i18n'
import { siteUrl } from '@/lib/site'

export function ServiceShareLink({ locale }: { locale: Locale }) {
  const { t, path } = getI18n(locale)
  const query = new URLSearchParams({
    text: t('これめっちゃつかいやすい！！'),
    url: siteUrl + path('/'),
    lang: locale,
  })

  return (
    <a href={`https://x.com/intent/tweet?${query}`} target="_blank" rel="noopener noreferrer"
      title={t('Xの投稿画面を開く')}
      className="whitespace-nowrap underline underline-offset-2 transition-colors hover:text-rose-700">
      {t('よければXでシェア')}
    </a>
  )
}
