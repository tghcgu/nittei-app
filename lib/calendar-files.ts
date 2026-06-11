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
  if (!isZipFile(file)) {
    return {
      isZip: false,
      texts: [{ name: file.name, text: await file.text() }],
      skippedBirthdayNames: [],
      totalIcsCount: 1,
    }
  }

  const { strFromU8, unzipSync } = await import('fflate')
  const entries = unzipSync(new Uint8Array(await file.arrayBuffer()))
  const icsEntries = Object.entries(entries)
    .filter(([name]) => isIcsName(name))
    .sort(([a], [b]) => a.localeCompare(b))

  if (icsEntries.length === 0) {
    throw new Error('NO_ICS_IN_ZIP')
  }

  const usableEntries = icsEntries.filter(([name]) => !isBirthdayCalendarName(name))
  const skippedBirthdayNames = icsEntries
    .filter(([name]) => isBirthdayCalendarName(name))
    .map(([name]) => name)

  if (usableEntries.length === 0) {
    throw new Error('ONLY_BIRTHDAY_ICS_IN_ZIP')
  }

  return {
    isZip: true,
    texts: usableEntries.map(([name, data]) => ({
      name,
      text: strFromU8(data),
    })),
    skippedBirthdayNames,
    totalIcsCount: icsEntries.length,
  }
}

// readCalendarFileTexts が投げる既知のエラーをユーザー向けメッセージに変換する。
// 未知のエラーなら null（呼び出し側が汎用メッセージを出す）。
export function describeCalendarFileError(error: unknown): string | null {
  if (!(error instanceof Error)) return null

  if (error.message === 'NO_ICS_IN_ZIP') {
    return 'zip内に .ics ファイルが見つかりませんでした。カレンダーをエクスポートしたzipか確認してください。'
  }
  if (error.message === 'ONLY_BIRTHDAY_ICS_IN_ZIP') {
    return 'zip内にあったのは誕生日カレンダーのみでした。予定の入ったカレンダーを書き出してください。'
  }
  return null
}

export function describeCalendarFileRead(result: CalendarFileReadResult) {
  if (!result.isZip) return '.ics を解析しました。'

  const skipped = result.skippedBirthdayNames.length
  const loaded = result.texts.length

  if (skipped > 0) {
    return `zip内の${loaded}件の .ics を解析しました。誕生日カレンダー${skipped}件は自動で除外しました。`
  }

  return `zip内の${loaded}件の .ics を解析しました。`
}
