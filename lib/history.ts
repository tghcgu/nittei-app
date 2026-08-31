// ページ表示履歴。ログインが無いので、見たイベントは端末内にだけ記録する。
// サーバーには一切送らない。
export type HistoryEntry = {
  shareId: string
  name: string
  at: string
}

const HISTORY_KEY = 'nittei-history'

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
  const others = readHistory().filter((entry) => entry.shareId !== shareId)
  let next: HistoryEntry[] = [{ shareId, name, at: new Date().toISOString() }, ...others]

  // 件数の上限は設けない。localStorage が一杯で書けないときだけ、
  // 古いものから減らして書き直す（新しい訪問を捨てないため）
  for (let attempt = 0; attempt < 20; attempt++) {
    try {
      window.localStorage.setItem(HISTORY_KEY, JSON.stringify(next))
      return
    } catch {
      if (next.length <= 1) return
      next = next.slice(0, Math.max(1, Math.floor(next.length * 0.8)))
    }
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
