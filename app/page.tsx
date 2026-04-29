'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import ICAL from 'ical.js'
import { supabase } from '@/lib/supabase'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

type Candidate = {
  id: number
  date: string
  timeLabel: string
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

// ---- ドラッグ可能な候補日行 ----
function SortableCandidate({
  c,
  onUpdate,
  onRemove,
}: {
  c: Candidate
  onUpdate: (id: number, field: 'date' | 'timeLabel', value: string) => void
  onRemove: (id: number) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: c.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 ${isDragging ? 'opacity-60' : ''}`}
    >
      {/* ドラッグハンドル */}
      <span
        {...attributes}
        {...listeners}
        className="shrink-0 cursor-grab touch-none select-none text-base text-stone-300 hover:text-stone-500 active:cursor-grabbing"
        title="ドラッグで並び替え"
      >
        ⠿
      </span>
      <input
        type="date"
        required
        value={c.date}
        onChange={(e) => onUpdate(c.id, 'date', e.target.value)}
        className="flex-1 rounded-lg border border-stone-200 bg-white px-3 py-2 text-stone-800 focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100"
      />
      <input
        type="text"
        value={c.timeLabel}
        onChange={(e) => onUpdate(c.id, 'timeLabel', e.target.value)}
        placeholder="19:00〜"
        className="w-24 rounded-lg border border-stone-200 bg-white px-3 py-2 text-stone-800 placeholder-stone-300 focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100"
      />
      <button
        type="button"
        onClick={() => onRemove(c.id)}
        className="shrink-0 text-stone-300 hover:text-rose-400"
      >
        ✕
      </button>
    </div>
  )
}

// ---- メインコンポーネント ----
export default function Home() {
  const router = useRouter()
  const [eventName, setEventName] = useState('')
  const [description, setDescription] = useState('')
  const [defaultTime, setDefaultTime] = useState('21:00〜')
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [nextId, setNextId] = useState(1)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [icsStatus, setIcsStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [icsMessage, setIcsMessage] = useState('')
  const [icsGuideOpen, setIcsGuideOpen] = useState(false)
  const icsInputRef = useRef<HTMLInputElement>(null)

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

  // dnd-kit センサー設定（マウス・タッチ・キーボードに対応）
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  // ---- ドラッグ終了時の並び替え ----
  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (over && active.id !== over.id) {
      setCandidates((items) => {
        const oldIndex = items.findIndex((i) => i.id === active.id)
        const newIndex = items.findIndex((i) => i.id === over.id)
        return arrayMove(items, oldIndex, newIndex)
      })
    }
  }

  // ---- 日付順に並べ替え ----
  function sortByDate() {
    setCandidates((prev) =>
      [...prev].sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date)
        return a.timeLabel.localeCompare(b.timeLabel)
      })
    )
  }

  // ---- 共通: 日付リストを候補に追加 ----
  function addDatesFromList(dates: string[]) {
    const existingDates = new Set(candidates.filter((c) => c.date).map((c) => c.date))
    const toAdd = dates.filter((d) => !existingDates.has(d)).sort()
    if (toAdd.length === 0) return
    let id = nextId
    const newItems = toAdd.map((d) => ({
      id: id++,
      date: d,
      timeLabel: defaultTime,
    }))
    const kept = candidates.filter((c) => c.date)
    setCandidates([...kept, ...newItems])
    setNextId(id)
  }

  // ---- 時間一括適用 ----
  function applyTimeToAll() {
    setCandidates((prev) => prev.map((c) => ({ ...c, timeLabel: defaultTime })))
  }

  function removeCandidate(id: number) {
    setCandidates((prev) => prev.filter((c) => c.id !== id))
  }

  function updateCandidate(id: number, field: 'date' | 'timeLabel', value: string) {
    setCandidates((prev) =>
      prev.map((c) => (c.id === id ? { ...c, [field]: value } : c))
    )
  }

  // ---- .ics アップロード ----
  function parseCandidateTimeRange(date: string, timeLabel: string) {
    const fallback = {
      start: new Date(date + 'T00:00:00').toISOString(),
      end:   new Date(date + 'T23:59:00').toISOString(),
    }
    const m = timeLabel.match(/(\d{1,2}):(\d{2})[〜~\-](?:(\d{1,2}):(\d{2}))?/)
    if (!m) return fallback
    const startDate = new Date(date + 'T00:00:00')
    startDate.setHours(parseInt(m[1]), parseInt(m[2]), 0, 0)
    let endDate: Date
    if (m[3] !== undefined) {
      endDate = new Date(date + 'T00:00:00')
      endDate.setHours(parseInt(m[3]), parseInt(m[4] ?? '00'), 0, 0)
    } else {
      endDate = new Date(startDate)
      endDate.setHours(endDate.getHours() + 3)
    }
    return { start: startDate.toISOString(), end: endDate.toISOString() }
  }

  async function handleIcsUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    setIcsStatus('loading')
    setIcsMessage('')

    try {
      const datedCandidates = candidates.filter((c) => c.date)
      if (datedCandidates.length === 0) {
        setIcsStatus('error')
        setIcsMessage('先に候補日を追加してください。')
        return
      }

      const sorted = [...datedCandidates].sort((a, b) => a.date.localeCompare(b.date))
      const rangeStart = ICAL.Time.fromDateTimeString(sorted[0].date + 'T00:00:00')
      const rangeEnd = ICAL.Time.fromDateTimeString(sorted[sorted.length - 1].date + 'T23:59:59')

      const busyPeriods: { start: Date; end: Date; isAllDay: boolean }[] = []

      const text = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsText(file, 'utf-8')
      })
      const jcal = ICAL.parse(text)
      const comp = new ICAL.Component(jcal)
      const vevents = comp.getAllSubcomponents('vevent')
      for (const vevent of vevents) {
        const event = new ICAL.Event(vevent)
        if (event.isRecurring()) {
          const expand = new ICAL.RecurExpansion({ component: vevent, dtstart: event.startDate })
          let next: ICAL.Time | null
          let count = 0
          while ((next = expand.next()) && count < 500) {
            count++
            if (next.compare(rangeEnd) > 0) break
            if (next.compare(rangeStart) < 0) continue
            const detail = event.getOccurrenceDetails(next)
            busyPeriods.push({ start: detail.startDate.toJSDate(), end: detail.endDate.toJSDate(), isAllDay: detail.startDate.isDate })
          }
        } else {
          busyPeriods.push({ start: event.startDate.toJSDate(), end: event.endDate.toJSDate(), isAllDay: event.startDate.isDate })
        }
      }

      const busyIds = new Set<number>()
      for (const c of datedCandidates) {
        const { start: cs, end: ce } = parseCandidateTimeRange(c.date, c.timeLabel)
        const csMs = new Date(cs).getTime()
        const ceMs = new Date(ce).getTime()
        const isBusy = busyPeriods.some(({ start, end, isAllDay }) => {
          if (isAllDay) return start.toISOString().slice(0, 10) === c.date
          return start.getTime() < ceMs && end.getTime() > csMs
        })
        if (isBusy) busyIds.add(c.id)
      }

      if (busyIds.size === 0) {
        setIcsStatus('done')
        setIcsMessage('予定と重なる日程はありませんでした。')
        return
      }

      setCandidates((prev) => {
        const remaining = prev.filter((c) => !busyIds.has(c.id))
        return remaining.length > 0 ? remaining : prev
      })
      const removed = busyIds.size
      const kept = datedCandidates.length - removed
      setIcsStatus('done')
      setIcsMessage(`${removed}件を削除しました（残り${kept}件）。確認してから作成してください。`)
    } catch {
      setIcsStatus('error')
      setIcsMessage('読み取りに失敗しました。.ics ファイルか確認してください。')
    }
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
    const validCandidates = candidates.filter((c) => c.date)

    if (validCandidates.length === 0) {
      setError('候補日を追加してください。')
      return
    }

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

      const candidateRows = validCandidates.map((c, i) => ({
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
  const hasDatedCandidates = candidates.some((c) => c.date)

  return (
    <div className="min-h-screen px-4 py-3">
      <div className="mx-auto max-w-xl">
        {/* ヘッダー */}
        <div className="mb-2 text-center">
          <p className="text-sm text-stone-500">
            候補日を入力して、参加者に共有しましょう
          </p>
        </div>

        {/* フォームカード */}
        <form
          onSubmit={handleSubmit}
          className="rounded-2xl bg-white/70 px-6 py-4 shadow-sm backdrop-blur"
        >
          {/* 上部の作成するボタン（候補日が多いとき用） */}
          <div className="mb-3 flex justify-end">
            <button
              type="submit"
              disabled={isSubmitting || !hasDatedCandidates}
              className="rounded-full bg-rose-800 px-6 py-2 text-sm font-medium text-white shadow transition-all hover:bg-rose-900 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? '作成中...' : '作成する'}
            </button>
          </div>

          {/* イベント名 */}
          <div className="mb-4">
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
          <div className="mb-4">
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
                disabled={candidates.length === 0}
                className="rounded-full border border-stone-300 px-3 py-1.5 text-xs text-stone-600 transition-colors hover:border-rose-300 hover:bg-rose-50 hover:text-rose-800 disabled:cursor-not-allowed disabled:opacity-40"
              >
                全部これに揃える
              </button>
            </div>

            {/* 候補日リスト（ドラッグ&ドロップ対応） */}
            {candidates.length > 0 ? (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={candidates.map((c) => c.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="mb-4 space-y-2">
                    {candidates.map((c) => (
                      <SortableCandidate
                        key={c.id}
                        c={c}
                        onUpdate={updateCandidate}
                        onRemove={removeCandidate}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            ) : (
              <p className="mb-4 rounded-xl border border-dashed border-stone-200 bg-white/50 px-4 py-3 text-sm text-stone-400">
                候補日はまだありません
              </p>
            )}

            {/* 追加ボタン群 */}
            <div className="flex flex-wrap gap-2">
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
                className="rounded-full border border-stone-200 px-3 py-1.5 text-sm text-stone-500 transition-colors hover:border-rose-200 hover:text-rose-700"
              >
                🗓 カレンダーから選ぶ
              </button>
              <button
                type="button"
                onClick={sortByDate}
                disabled={candidates.length < 2}
                className="rounded-full border border-stone-200 px-3 py-1.5 text-sm text-stone-500 transition-colors hover:border-rose-200 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                ↕ 日付順に並べ替え
              </button>
              <input ref={icsInputRef} type="file" accept=".ics" className="hidden" onChange={handleIcsUpload} />
              <button
                type="button"
                onClick={() => icsInputRef.current?.click()}
                disabled={icsStatus === 'loading'}
                className="rounded-full border border-stone-200 px-3 py-1.5 text-sm text-stone-500 transition-colors hover:border-rose-200 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {icsStatus === 'loading' ? '解析中...' : '📂 .ics で空き日程を絞り込む'}
              </button>
            </div>
            {icsMessage && (
              <p className={`mt-2 text-xs ${icsStatus === 'error' ? 'text-red-500' : 'text-stone-400'}`}>
                {icsMessage}
              </p>
            )}
            <button
              type="button"
              onClick={() => setIcsGuideOpen((v) => !v)}
              className="mt-1 text-xs text-stone-400 underline hover:text-rose-700"
            >
              書き出し方法を見る {icsGuideOpen ? '▲' : '▼'}
            </button>
            {icsGuideOpen && (
              <div className="mt-2 space-y-3 rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-xs text-stone-600">
                <div>
                  <a href="https://calendar.google.com/calendar/u/0/r/settings/export" target="_blank" rel="noopener noreferrer" className="font-medium text-rose-800 underline">▼ Google カレンダー</a>
                  <ol className="mt-1 list-decimal pl-4 space-y-0.5 text-stone-500">
                    <li>リンクを開く → 「エクスポート」をクリック</li>
                    <li>ZIP がダウンロードされる → 解凍すると .ics</li>
                    <li>その .ics をアップロード</li>
                  </ol>
                </div>
                <div>
                  <a href="https://www.icloud.com/calendar" target="_blank" rel="noopener noreferrer" className="font-medium text-rose-800 underline">▼ Apple カレンダー（iCloud）</a>
                  <ol className="mt-1 list-decimal pl-4 space-y-0.5 text-stone-500">
                    <li>PC ブラウザで iCloud カレンダーを開く</li>
                    <li>カレンダー名の横の共有マークから書き出し</li>
                    <li>その .ics をアップロード</li>
                  </ol>
                </div>
                <div>
                  <a href="https://outlook.live.com/calendar" target="_blank" rel="noopener noreferrer" className="font-medium text-rose-800 underline">▼ Outlook</a>
                  <ol className="mt-1 list-decimal pl-4 space-y-0.5 text-stone-500">
                    <li>設定 → 共有カレンダー → 書き出し</li>
                    <li>その .ics をアップロード</li>
                  </ol>
                </div>
              </div>
            )}

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
                    className="rounded-full bg-rose-800 px-4 py-2 text-sm text-white transition-colors hover:bg-rose-900 disabled:cursor-not-allowed disabled:opacity-40"
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
            disabled={isSubmitting || !hasDatedCandidates}
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
                className="rounded-full p-1.5 text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-700"
              >
                ←
              </button>
              <span className="font-serif text-lg text-stone-700">
                {calYear}年{calMonth + 1}月
              </span>
              <button
                type="button"
                onClick={nextMonth}
                className="rounded-full p-1.5 text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-700"
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
                        ? 'bg-rose-700 font-bold text-white'
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
                className="flex-1 rounded-full bg-rose-800 py-2.5 text-sm font-medium text-white transition-colors hover:bg-rose-900 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {calSelected.size > 0 ? `${calSelected.size}日を追加` : '日付を選んでください'}
              </button>
              <button
                type="button"
                onClick={() => setCalOpen(false)}
                className="rounded-full border border-stone-200 px-4 py-2.5 text-sm text-stone-500 transition-colors hover:border-stone-300 hover:text-stone-700"
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
