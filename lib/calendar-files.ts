import { getI18n, type Locale } from './i18n'

type CalendarText = {
  name: string
  text: string
}

export type CalendarFileReadResult = {
  isZip: boolean
  texts: CalendarText[]
  skippedBirthdayNames: string[]
  totalIcsCount: number
}

function isZipFile(file: File) {
  return file.name.toLowerCase().endsWith('.zip') || file.type === 'application/zip'
}

function isIcsName(name: string) {
  return name.toLowerCase().endsWith('.ics')
}

function isBirthdayCalendarName(name: string) {
  const lowerName = name.toLowerCase()
  return lowerName.includes('birthday') || lowerName.includes('birthdays') || name.includes('誕生日')
}

export async function readCalendarFileTexts(file: File): Promise<CalendarFileReadResult> {
  if (file.size > 10 * 1024 * 1024) throw new Error('CALENDAR_FILE_TOO_LARGE')
  if (!isZipFile(file)) {
    return {
      isZip: false,
      texts: [{ name: file.name, text: await file.text() }],
      skippedBirthdayNames: [],
      totalIcsCount: 1,
    }
  }

  const { strFromU8, unzipSync } = await import('fflate')
  let expandedSize = 0
  let totalIcsCount = 0
  const skippedBirthdayNames: string[] = []
  const entries = unzipSync(new Uint8Array(await file.arrayBuffer()), {
    filter(entry) {
      if (!isIcsName(entry.name)) return false
      if (++totalIcsCount > 100) throw new Error('CALENDAR_FILE_TOO_LARGE')
      if (isBirthdayCalendarName(entry.name)) {
        skippedBirthdayNames.push(entry.name)
        return false
      }
      expandedSize += entry.originalSize
      if (expandedSize > 50 * 1024 * 1024) throw new Error('CALENDAR_FILE_TOO_LARGE')
      return true
    },
  })
  const icsEntries = Object.entries(entries)
    .filter(([name]) => isIcsName(name))
    .sort(([a], [b]) => a.localeCompare(b))

  if (totalIcsCount === 0) {
    throw new Error('NO_ICS_IN_ZIP')
  }

  if (icsEntries.length === 0) {
    throw new Error('ONLY_BIRTHDAY_ICS_IN_ZIP')
  }

  return {
    isZip: true,
    texts: icsEntries.map(([name, data]) => ({
      name,
      text: strFromU8(data),
    })),
    skippedBirthdayNames,
    totalIcsCount,
  }
}

// readCalendarFileTexts が投げる既知のエラーをユーザー向けメッセージに変換する。
// 未知のエラーなら null（呼び出し側が汎用メッセージを出す）。
export function describeCalendarFileError(error: unknown, locale: Locale = 'ja'): string | null {
  const { t } = getI18n(locale)
  if (!(error instanceof Error)) return null
  if (error.message === 'CALENDAR_FILE_TOO_LARGE') {
    return t("ファイルは10MB、zip展開後は50MB・100カレンダーまでです。対象を分けて書き出してください。")
  }
  if (error.message === 'CALENDAR_TOO_COMPLEX') {
    return t("繰り返し予定が多すぎます。対象期間を絞って書き出してください。")
  }

  if (error.message === 'NO_ICS_IN_ZIP') {
    return t("zip内に .ics ファイルが見つかりませんでした。カレンダーをエクスポートしたzipか確認してください。")
  }
  if (error.message === 'ONLY_BIRTHDAY_ICS_IN_ZIP') {
    return t("zip内にあったのは誕生日カレンダーのみでした。予定の入ったカレンダーを書き出してください。")
  }
  return null
}

export function describeCalendarFileRead(result: CalendarFileReadResult, locale: Locale = 'ja') {
  const { t } = getI18n(locale)
  if (!result.isZip) return t(".ics を解析しました。")

  const skipped = result.skippedBirthdayNames.length
  const loaded = result.texts.length

  if (skipped > 0) {
    return t("zip内の{0}件の .ics を解析しました。誕生日カレンダー{1}件は自動で除外しました。", loaded, skipped)
  }

  return t("zip内の{0}件の .ics を解析しました。", loaded)
}
