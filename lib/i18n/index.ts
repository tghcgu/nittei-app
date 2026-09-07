import en from './en.json'

export type Locale = 'ja' | 'en'
export type MessageKey = keyof typeof en

const englishDateFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', weekday: 'short' })
const englishDateTimeFormat = new Intl.DateTimeFormat('en-US', {
  year: 'numeric', month: 'short', day: 'numeric', weekday: 'short',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
})

export function localizedPath(path: string, locale: Locale): string {
  if (!path.startsWith('/') || path.startsWith('//')) return path
  const stripped = path.replace(/^\/en(?=\/|\?|#|$)/, '')
  const base = !stripped || stripped.startsWith('?') || stripped.startsWith('#') ? `/${stripped}` : stripped
  return locale === 'en' ? `/en${base === '/' ? '' : base}` : base
}

export const weekdays = {
  ja: ['日', '月', '火', '水', '木', '金', '土'],
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
}

export function formatDate(date: string, locale: Locale) {
  const d = new Date(`${date}T00:00:00`)
  if (locale === 'en') {
    return englishDateFormat.format(d)
  }
  return `${d.getMonth() + 1}/${d.getDate()}(${weekdays.ja[d.getDay()]})`
}

export function formatDateTime(value: string | number | Date | null | undefined, locale: Locale) {
  if (value == null || value === '') return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  if (locale === 'en') {
    return englishDateTimeFormat.format(d)
  }
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日(${weekdays.ja[d.getDay()]}) ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function createI18n(locale: Locale) {
  return {
    locale,
    t: (key: MessageKey, ...values: (string | number)[]) =>
      (locale === 'en' ? en[key] : key).replace(/\{(\d+)\}/g, (placeholder, index: string) =>
        values[Number(index)] === undefined ? placeholder : String(values[Number(index)])),
    path: (value: string) => localizedPath(value, locale),
    formatDate: (value: string) => formatDate(value, locale),
    formatDateTime: (value: string | number | Date | null | undefined) => formatDateTime(value, locale),
    weekdays: weekdays[locale],
  }
}

const locales = { ja: createI18n('ja'), en: createI18n('en') }
export function getI18n(locale: Locale) { return locales[locale] }
