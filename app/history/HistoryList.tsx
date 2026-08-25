'use client'

import { useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { clearHistory, readHistory, removeHistory, type HistoryEntry } from '@/lib/history'

const DAYS = ['日', '月', '火', '水', '木', '金', '土']
const emptySubscribe = () => () => {}

function formatDateTime(value: string) {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日(${DAYS[d.getDay()]}) ${hh}:${mm}`
}

export function HistoryList() {
  // localStorage はサーバーでは読めないので、マウント後に描画する
  const mounted = useSyncExternalStore(emptySubscribe, () => true, () => false)
  const [edited, setEdited] = useState<HistoryEntry[] | null>(null)
  const entries = edited ?? (mounted ? readHistory() : [])

  if (!mounted) {
    return <p className="mt-4 text-sm text-stone-600">読み込み中...</p>
  }

  if (entries.length === 0) {
    return (
      <p className="mt-4 text-sm text-stone-600">
        この端末で開いたイベントはまだありません。イベントのページを開くとここに残ります。
      </p>
    )
  }

  return (
    <>
      <ul className="mt-4 divide-y divide-stone-300">
        {entries.map((entry) => (
          <li key={entry.shareId} className="flex items-center gap-3 py-2">
            <div className="min-w-0 flex-1">
              <Link
                href={`/e/${entry.shareId}`}
                className="block truncate font-serif text-stone-800 underline-offset-2 transition-colors hover:text-rose-700 hover:underline"
              >
                {entry.name || `/e/${entry.shareId}`}
              </Link>
              <p className="text-[11px] text-stone-600">最後に開いた日時：{formatDateTime(entry.at)}</p>
            </div>
            <button
              type="button"
              onClick={() => setEdited(removeHistory(entry.shareId))}
              className="shrink-0 rounded-full border border-stone-300 px-2.5 py-1 text-xs text-stone-600 transition-colors hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700"
            >
              消す
            </button>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={() => {
          if (!window.confirm('この端末の表示履歴をすべて消します。')) return
          clearHistory()
          setEdited([])
        }}
        className="mt-4 rounded-full border border-stone-300 px-3 py-1.5 text-xs text-stone-600 transition-colors hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700"
      >
        すべて消す
      </button>
    </>
  )
}
