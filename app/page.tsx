'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type Candidate = {
  id: number
  date: string
  timeLabel: string
  checked: boolean
}

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']

function generateShareId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  return Array.from({ length: 6 }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join('')
}

function toDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function datesBetween(start: string, end: string): string[] {
  const result: string[] = []
  const cur = new Date(start + 'T00:00:00')
  const last = new Date(end + 'T00:00:00')
  while (cur <= last) {
    result.push(toDateStr(cur))
    cur.setDate(cur.getDate() + 1)
  }
  return result
}

function getCalendarGrid(year: number, month: number): (Date | null)[] {
  const firstDay = new Date(year, month, 1)
  const lastDate = new Date(year, month + 1, 0).getDate()
  const grid: (Date | null)[] = Array(firstDay.getDay()).fill(null)
  for (let d = 1; d <= lastDate; d++) grid.push(new Date(year, month, d))
  return grid
}

export default function Home() {
  const router = useRouter()
  const [eventName, setEventName] = useState('')
  const [description, setDescription] = useState('')
  const [defaultTime, setDefaultTime] = useState('21:00〜')
  const [candidates, setCandidates] = useState<Candidate[]>([
    { id: 1, date: '', timeLabel: '', checked: false },
  ])
  const [nextId, setNextId] = useState(2)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 範囲追加
  const [rangeOpen, setRangeOpen] = useState(false)
  const [rangeStart, setRangeStart] = useState('')
  const [rangeEnd, setRangeEnd] = useState('')

  // カレンダーモーダル
  const now = new Date()
  const [calOpen, setCalOpen] = useState(false)
  const [calYear, setCalYear] = useState(now.getFullYear())
  const [calMonth, setCalMonth] = useState(now.getMonth())
  const [calSelected, setCalSelected] = useState<Set<string>>(new Set())

  // ---- 共通: 日付リストを候補に追加 ----
  function addDatesFromList(dates: string[]) {
    const existingDates = new Set(candidates.filter((c) => c.date).map((c) => c.date))
    const toAdd = dates.filter((d) => !existingDates.has(d)).sort()
    if (toAdd.length === 0) return
    let id = nextId
    const newItems = toAdd.map((d) => ({ id: id++, date: d, timeLabel: defaultTime, checked: false }))
    const kept = candidates.filter((c) => c.date)
    setCandidates([...kept, ...newItems])
    setNextId(id)
  }

  // ---- 1件追加 ----
  function addCandidate() {
    setCandidates((prev) => [...prev, { id: nextId, date: '', timeLabel: defaultTime, checked: false }])
    setNextId((n) => n + 1)
  }

  // ---- 時間一括適用 ----
  function applyTimeToAll() {
    setCandidates((prev) => prev.map((c) => ({ ...c, timeLabel: defaultTime })))
  }

  function applyTimeToSelected() {
    setCandidates((prev) => prev.map((c) => c.checked ? { ...c, timeLabel: defaultTime } : c))
  }

  function toggleCheck(id: number) {
    setCandidates((prev) => prev.map((c) => c.id === id ? { ...c, checked: !c.checked } : c))
  }

  function removeCandidate(id: number) {
    if (candidates.length === 1) return
    setCandidates((prev) => prev.filter((c) => c.id !== id))
  }

  function updateCandidate(id: number, field: 'date' | 'timeLabel', value: string) {
    setCandidates((prev) =>
      prev.map((c) => (c.id === id ? { ...c, [field]: value } : c))
    )
  }

  // ---- 範囲追加 ----
  function handleAddRange() {
    if (!rangeStart || !rangeEnd || rangeStart > rangeEnd) return
    addDatesFromList(datesBetween(rangeStart, rangeEnd))
    setRangeOpen(false)
    setRangeStart('')
    setRangeEnd('')
  }

  // ---- カレンダー ----
  function openCalendar() {
    setCalSelected(new Set())
    setCalOpen(true)
  }

  function prevMonth() {
    if (calMonth === 0) { setCalYear((y) => y - 1); setCalMonth(11) }
    else setCalMonth((m) => m - 1)
  }

  function nextMonth() {
    if (calMonth === 11) { setCalYear((y) => y + 1); setCalMonth(0) }
    else setCalMonth((m) => m + 1)
  }

  function toggleCalDate(dateStr: string) {
    setCalSelected((prev) => {
      const next = new Set(prev)
      if (next.has(dateStr)) next.delete(dateStr)
      else next.add(dateStr)
      return next
    })
  }

  function handleAddFromCalendar() {
    addDatesFromList([...calSelected].sort())
    setCalOpen(false)
  }

  // ---- フォーム送信 ----
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setIsSubmitting(true)
    setError(null)

    try {
      const shareId = generateShareId()

      const { data: event, error: eventError } = await supabase
        .from('events')
        .insert({ share_id: shareId, name: eventName, description: description || null })
        .select()
        .single()

      if (eventError) throw eventError

      const candidateRows = candidates
        .filter((c) => c.date)
        .map((c, i) => ({
          event_id: event.id,
          date: c.date,
          time_label: c.timeLabel || null,
          sort_order: i,
        }))

      const { error: candidatesError } = await supabase
        .from('candidates')
        .insert(candidateRows)

      if (candidatesError) throw candidatesError

      router.push(`/e/${shareId}`)
    } catch (err) {
      console.error(err)
      setError('保存中にエラーが発生しました。もう一度試してください。')
      setIsSubmitting(false)
    }
  }

  const existingDateSet = new Set(candidates.map((c) => c.date).filter(Boolean))
  const calGrid = getCalendarGrid(calYear, calMonth)

  return (
    <div className="min-h-screen px-4 py-12">
      <div className="mx-auto max-w-xl">
        {/* ヘッダー */}
        <div className="mb-10 text-center">
          <h1 className="font-serif text-3xl text-rose-800">日程調整アプリ</h1>
          <p className="mt-2 text-sm text-stone-500">
            候補日を入力して、参加者に共有しましょう
          </p>
        </div>

        {/* フォームカード */}
        <form
          onSubmit={handleSubmit}
          className="rounded-2xl bg-white/70 px-8 py-8 shadow-sm backdrop-blur"
        >
          {/* イベント名 */}
          <div className="mb-6">
            <label className="mb-1 block text-sm font-medium text-stone-700">
              イベント名 <span className="text-rose-700">*</span>
            </label>
            <input
              type="text"
              required
              value={eventName}
              onChange={(e) => setEventName(e.target.value)}
              placeholder="例：4月の飲み会"
              className="w-full rounded-lg border border-stone-200 bg-white px-4 py-2.5 text-stone-800 placeholder-stone-300 focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100"
            />
          </div>

          {/* 説明 */}
          <div className="mb-6">
            <label className="mb-1 block text-sm font-medium text-stone-700">
              説明（任意）
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="場所や詳細など"
              rows={3}
              className="w-full resize-none rounded-lg border border-stone-200 bg-white px-4 py-2.5 text-stone-800 placeholder-stone-300 focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100"
            />
          </div>

          {/* 候補日時 */}
          <div className="mb-8">
            <label className="mb-2 block text-sm font-medium text-stone-700">
              候補日時 <span className="text-rose-700">*</span>
            </label>

            {/* 時間帯バー */}
            <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-4 py-3">
              <span className="shrink-0 text-sm text-stone-500">時間帯：</span>
              <input
                type="text"
                value={defaultTime}
                onChange={(e) => setDefaultTime(e.target.value)}
                placeholder="19:00〜"
                className="w-24 rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-sm text-stone-800 placeholder-stone-300 focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100"
              />
              <button
                type="button"
                onClick={applyTimeToAll}
                className="rounded-full border border-stone-300 px-3 py-1.5 text-xs text-stone-600 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-800 transition-colors"
              >
                全部これに揃える
              </button>
              <button
                type="button"
                onClick={applyTimeToSelected}
                disabled={candidates.every((c) => !c.checked)}
                className="rounded-full border border-stone-300 px-3 py-1.5 text-xs text-stone-600 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-800 transition-colors disabled:cursor-not-allowed disabled:opacity-40"
              >
                選択した日に適用
              </button>
            </div>

            {/* 候補日リスト */}
            <div className="mb-4 space-y-2">
              {candidates.map((c, idx) => (
                <div key={c.id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={c.checked}
                    onChange={() => toggleCheck(c.id)}
                    className="h-4 w-4 shrink-0 cursor-pointer accent-rose-700"
                  />
                  <span className="w-4 shrink-0 text-center text-sm text-stone-400">
                    {idx + 1}
                  </span>
                  <input
                    type="date"
                    required
                    value={c.date}
                    onChange={(e) => updateCandidate(c.id, 'date', e.target.value)}
                    className="flex-1 rounded-lg border border-stone-200 bg-white px-3 py-2 text-stone-800 focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100"
                  />
                  <input
                    type="text"
                    value={c.timeLabel}
                    onChange={(e) => updateCandidate(c.id, 'timeLabel', e.target.value)}
                    placeholder="19:00〜"
                    className="w-24 rounded-lg border border-stone-200 bg-white px-3 py-2 text-stone-800 placeholder-stone-300 focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100"
                  />
                  <button
                    type="button"
                    onClick={() => removeCandidate(c.id)}
                    disabled={candidates.length === 1}
                    className="shrink-0 text-stone-300 hover:text-rose-400 disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>

            {/* 追加ボタン群 */}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={addCandidate}
                className="rounded-full border border-rose-200 px-3 py-1.5 text-sm text-rose-700 hover:bg-rose-50 transition-colors"
              >
                ＋ 1日ずつ追加
              </button>
              <button
                type="button"
                onClick={() => { setRangeOpen((v) => !v); setCalOpen(false) }}
                className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                  rangeOpen
                    ? 'border-rose-400 bg-rose-50 text-rose-800'
                    : 'border-stone-200 text-stone-500 hover:border-rose-200 hover:text-rose-700'
                }`}
              >
                📅 範囲で追加
              </button>
              <button
                type="button"
                onClick={() => { openCalendar(); setRangeOpen(false) }}
                className="rounded-full border border-stone-200 px-3 py-1.5 text-sm text-stone-500 hover:border-rose-200 hover:text-rose-700 transition-colors"
              >
                🗓 カレンダーから選ぶ
              </button>
            </div>

            {/* 範囲ミニフォーム */}
            {rangeOpen && (
              <div className="mt-3 rounded-xl border border-stone-200 bg-stone-50 px-4 py-4">
                <p className="mb-3 text-xs font-medium text-stone-500">開始日〜終了日を選択</p>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="date"
                    value={rangeStart}
                    onChange={(e) => setRangeStart(e.target.value)}
                    className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-800 focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100"
                  />
                  <span className="text-stone-400">〜</span>
                  <input
                    type="date"
                    value={rangeEnd}
                    min={rangeStart}
                    onChange={(e) => setRangeEnd(e.target.value)}
                    className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-800 focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100"
                  />
                  <button
                    type="button"
                    onClick={handleAddRange}
                    disabled={!rangeStart || !rangeEnd || rangeStart > rangeEnd}
                    className="rounded-full bg-rose-800 px-4 py-2 text-sm text-white hover:bg-rose-900 disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
                  >
                    追加
                  </button>
                  <button
                    type="button"
                    onClick={() => setRangeOpen(false)}
                    className="text-sm text-stone-400 hover:text-stone-600"
                  >
                    キャンセル
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* エラーメッセージ */}
          {error && (
            <p className="mb-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">
              {error}
            </p>
          )}

          {/* 送信ボタン */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-full bg-rose-800 py-3 text-base font-medium text-white shadow transition-all hover:bg-rose-900 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? '作成中...' : '作成する'}
          </button>
        </form>
      </div>

      {/* カレンダーモーダル */}
      {calOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setCalOpen(false) }}
        >
          <div className="mx-4 w-full max-w-sm rounded-2xl bg-white px-6 py-6 shadow-2xl">
            {/* 月ナビ */}
            <div className="mb-5 flex items-center justify-between">
              <button
                type="button"
                onClick={prevMonth}
                className="rounded-full p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700 transition-colors"
              >
                ←
              </button>
              <span className="font-serif text-lg text-stone-700">
                {calYear}年{calMonth + 1}月
              </span>
              <button
                type="button"
                onClick={nextMonth}
                className="rounded-full p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700 transition-colors"
              >
                →
              </button>
            </div>

            {/* 曜日ヘッダー */}
            <div className="mb-2 grid grid-cols-7 text-center text-xs text-stone-400">
              {WEEKDAYS.map((w, i) => (
                <div
                  key={w}
                  className={i === 0 ? 'text-rose-400' : i === 6 ? 'text-blue-400' : ''}
                >
                  {w}
                </div>
              ))}
            </div>

            {/* 日付グリッド */}
            <div className="grid grid-cols-7 gap-y-1">
              {calGrid.map((d, i) => {
                if (!d) return <div key={i} />
                const dateStr = toDateStr(d)
                const isExisting = existingDateSet.has(dateStr)
                const isSelected = calSelected.has(dateStr)
                const dow = d.getDay()
                return (
                  <button
                    key={dateStr}
                    type="button"
                    disabled={isExisting}
                    onClick={() => toggleCalDate(dateStr)}
                    className={`mx-auto flex h-9 w-9 items-center justify-center rounded-full text-sm transition-colors ${
                      isExisting
                        ? 'cursor-not-allowed text-stone-300'
                        : isSelected
                        ? 'bg-rose-700 text-white font-bold'
                        : dow === 0
                        ? 'text-rose-400 hover:bg-rose-50'
                        : dow === 6
                        ? 'text-blue-400 hover:bg-blue-50'
                        : 'text-stone-700 hover:bg-stone-100'
                    }`}
                  >
                    {d.getDate()}
                  </button>
                )
              })}
            </div>

            {/* フッター */}
            <div className="mt-5 flex items-center gap-3">
              <button
                type="button"
                onClick={handleAddFromCalendar}
                disabled={calSelected.size === 0}
                className="flex-1 rounded-full bg-rose-800 py-2.5 text-sm font-medium text-white hover:bg-rose-900 disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
              >
                {calSelected.size > 0 ? `${calSelected.size}日を追加` : '日付を選んでください'}
              </button>
              <button
                type="button"
                onClick={() => setCalOpen(false)}
                className="rounded-full border border-stone-200 px-4 py-2.5 text-sm text-stone-500 hover:border-stone-300 hover:text-stone-700 transition-colors"
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
