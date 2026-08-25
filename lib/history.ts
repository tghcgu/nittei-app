// ページ表示履歴。ログインが無いので、見たイベントは端末内にだけ記録する。
// サーバーには一切送らない。
export type HistoryEntry = {
  shareId: string
  name: string
  at: string
}

const HISTORY_KEY = 'nittei-history'
const HISTORY_MAX = 50

export function readHistory(): HistoryEntry[] {
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (entry): entry is HistoryEntry =>
        typeof entry === 'object' &&
        entry !== null &&
        typeof (entry as HistoryEntry).shareId === 'string' &&
        typeof (entry as HistoryEntry).at === 'string'
    )
  } catch {
    // プライベートモードなどで localStorage が使えないときは履歴なし扱い
    return []
  }
}

export function recordHistory(shareId: string, name: string) {
  try {
    const others = readHistory().filter((entry) => entry.shareId !== shareId)
    const next = [{ shareId, name, at: new Date().toISOString() }, ...others].slice(0, HISTORY_MAX)
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(next))
  } catch {
    // 保存できなくても閲覧には影響しない
  }
}

export function removeHistory(shareId: string): HistoryEntry[] {
  const next = readHistory().filter((entry) => entry.shareId !== shareId)
  try {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(next))
  } catch {
    // 何もしない
  }
  return next
}

export function clearHistory() {
  try {
    window.localStorage.removeItem(HISTORY_KEY)
  } catch {
    // 何もしない
  }
}
