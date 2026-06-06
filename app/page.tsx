'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
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
import { describeCalendarFileRead, readCalendarFileTexts } from '@/lib/calendar-files'

type Candidate = {
  id: string
  dbId?: string
  date: string
  timeLabel: string
}

const MAX_CANDIDATE_HISTORY = 50

function cloneCandidates(items: Candidate[]) {
  return items.map((item) => ({ ...item }))
}

function areCandidatesEqual(a: Candidate[], b: Candidate[]) {
  if (a.length !== b.length) return false
  return a.every((item, index) => {
    const other = b[index]
    return (
      item.id === other.id &&
      item.dbId === other.dbId &&
      item.date === other.date &&
      item.timeLabel === other.timeLabel
    )
  })
}

type CalendarComponent = {
  getFirstPropertyValue: (name: string) => unknown
}

type BusyPeriod = {
  start: Date
  end: Date
  isAllDay: boolean
}

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']
const MAX_RECURRING_OCCURRENCES = 10000
const DEFAULT_CLOCK_TIME = '21:00'

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

function parseTimeLabel(timeLabel: string): { start: string; end: string } {
  const match = timeLabel.match(/(\d{1,2}):(\d{2})(?:[〜~\-](\d{1,2}):(\d{2}))?/)
  if (!match) return { start: '', end: '' }

  return {
    start: `${match[1].padStart(2, '0')}:${match[2]}`,
    end: match[3] ? `${match[3].padStart(2, '0')}:${match[4]}` : '',
  }
}

function toStartClockValue(timeLabel: string): string {
  return parseTimeLabel(timeLabel).start
}

function toEndClockValue(timeLabel: string): string {
  return parseTimeLabel(timeLabel).end
}

function toTimeLabel(startClockValue: string, endClockValue = ''): string {
  if (!startClockValue) return ''
  return endClockValue ? `${startClockValue}〜${endClockValue}` : `${startClockValue}〜`
}

function getMonthDatesFromToday(year: number, month: number): string[] {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const first = new Date(year, month, 1)
  const last = new Date(year, month + 1, 0)
  const start = first < today ? today : first
  if (start > last) return []

  const result: string[] = []
  const cur = new Date(start)
  while (cur <= last) {
    result.push(toDateStr(cur))
    cur.setDate(cur.getDate() + 1)
  }
  return result
}

function isDateInAllDayRange(dateStr: string, start: Date, end: Date): boolean {
  const startDate = toDateStr(start)
  const endDate = toDateStr(end)
  if (startDate === endDate) return dateStr === startDate
  return dateStr >= startDate && dateStr < endDate
}

function isBlockingCalendarEvent(vevent: CalendarComponent): boolean {
  const status = String(vevent.getFirstPropertyValue('status') ?? '').toUpperCase()

  return status !== 'CANCELLED'
}

// ---- ドラッグ可能な候補日行 ----
function SortableCandidate({
  c,
  selected,
  onToggleSelected,
  onUpdate,
  onRemove,
}: {
  c: Candidate
  selected: boolean
  onToggleSelected: (id: string) => void
  onUpdate: (id: string, field: 'date' | 'timeLabel', value: string) => void
  onRemove: (id: string) => void
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
      className={`grid grid-cols-[auto_auto_7.2rem_minmax(0,1fr)_auto] items-center gap-x-0.5 gap-y-1 sm:flex sm:flex-wrap sm:gap-2 ${isDragging ? 'opacity-60' : ''}`}
    >
      {/* ドラッグハンドル */}
      <span
        {...attributes}
        {...listeners}
        className="shrink-0 cursor-grab touch-none select-none text-sm text-stone-300 hover:text-stone-500 active:cursor-grabbing sm:text-base"
        title="ドラッグで並び替え"
      >
        ⠿
      </span>
      <input
        type="checkbox"
        checked={selected}
        onChange={() => onToggleSelected(c.id)}
        aria-label="候補を選択"
        className="h-4 w-4 shrink-0 rounded border-stone-300 text-rose-700 focus:ring-rose-200"
      />
      <input
        type="date"
        required
        value={c.date}
        onChange={(e) => onUpdate(c.id, 'date', e.target.value)}
        className="w-[7.2rem] min-w-0 max-w-[7.2rem] rounded-lg border border-stone-200 bg-white px-1.5 py-2 text-sm text-stone-800 focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100 sm:min-w-36 sm:max-w-none sm:flex-1 sm:px-3 sm:text-base"
      />
      <div className="flex shrink-0 justify-self-end items-center gap-0.5 sm:gap-1">
        <input
          type="time"
          step={900}
          value={toStartClockValue(c.timeLabel)}
          onChange={(e) => {
            const start = e.target.value
            onUpdate(c.id, 'timeLabel', toTimeLabel(start, start ? toEndClockValue(c.timeLabel) : ''))
          }}
          aria-label="開始時間"
          className="w-[4.45rem] rounded-lg border border-stone-200 bg-white px-1 py-2 text-[13px] text-stone-800 focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100 sm:w-28 sm:px-3 sm:text-base"
        />
        <span className="text-sm text-stone-400">〜</span>
        <input
          type="time"
          step={900}
          value={toEndClockValue(c.timeLabel)}
          onChange={(e) => onUpdate(c.id, 'timeLabel', toTimeLabel(toStartClockValue(c.timeLabel), e.target.value))}
          disabled={!toStartClockValue(c.timeLabel)}
          aria-label="終了時間（任意）"
          className="w-[4.45rem] rounded-lg border border-stone-200 bg-white px-1 py-2 text-[13px] text-stone-800 focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100 disabled:cursor-not-allowed disabled:bg-stone-50 disabled:text-stone-300 sm:w-28 sm:px-3 sm:text-base"
        />
      </div>
      <button
        type="button"
        onClick={() => onRemove(c.id)}
        className="shrink-0 text-sm text-stone-300 hover:text-rose-400 sm:text-base"
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
  const [defaultStartTime, setDefaultStartTime] = useState(DEFAULT_CLOCK_TIME)
  const [defaultEndTime, setDefaultEndTime] = useState('')
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [candidatePast, setCandidatePast] = useState<Candidate[][]>([])
  const [candidateFuture, setCandidateFuture] = useState<Candidate[][]>([])
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<Set<string>>(new Set())
  const [nextId, setNextId] = useState(1)
  const [editShareId, setEditShareId] = useState<string | null>(null)
  const [editEventId, setEditEventId] = useState<string | null>(null)
  const [originalCandidateIds, setOriginalCandidateIds] = useState<Set<string>>(new Set())
  const [isLoadingEdit, setIsLoadingEdit] = useState(false)
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

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const shareId = params.get('edit')
    if (!shareId) return
    const editingShareId = shareId

    let cancelled = false

    async function loadEventForEdit() {
      setIsLoadingEdit(true)
      setError(null)

      try {
        const { data: event, error: eventError } = await supabase
          .from('events')
          .select('*')
          .eq('share_id', editingShareId)
          .single()

        if (eventError || !event) throw eventError ?? new Error('Event not found')

        const { data: loadedCandidates, error: candidatesError } = await supabase
          .from('candidates')
          .select('*')
          .eq('event_id', event.id)
          .order('sort_order')

        if (candidatesError) throw candidatesError
        if (cancelled) return

        const drafts = (loadedCandidates ?? []).map((candidate) => ({
          id: candidate.id,
          dbId: candidate.id,
          date: candidate.date,
          timeLabel: candidate.time_label ?? '',
        }))

        setEditShareId(editingShareId)
        setEditEventId(event.id)
        setEventName(event.name)
        setDescription(event.description ?? '')
        setCandidates(drafts)
        setCandidatePast([])
        setCandidateFuture([])
        setOriginalCandidateIds(new Set(drafts.map((candidate) => candidate.dbId!)))
        setSelectedCandidateIds(new Set())
        const draftTime = parseTimeLabel(drafts.find((candidate) => candidate.timeLabel)?.timeLabel ?? '')
        setDefaultStartTime(draftTime.start || DEFAULT_CLOCK_TIME)
        setDefaultEndTime(draftTime.end)
      } catch (err) {
        console.error(err)
        if (!cancelled) setError('編集する日程を読み込めませんでした。')
      } finally {
        if (!cancelled) setIsLoadingEdit(false)
      }
    }

    loadEventForEdit()

    return () => {
      cancelled = true
    }
  }, [])

  function syncSelectedCandidates(nextCandidates: Candidate[]) {
    const ids = new Set(nextCandidates.map((candidate) => candidate.id))
    setSelectedCandidateIds((prev) => {
      const next = new Set([...prev].filter((id) => ids.has(id)))
      return next.size === prev.size ? prev : next
    })
  }

  function restoreCandidateSnapshot(snapshot: Candidate[]) {
    const nextCandidates = cloneCandidates(snapshot)
    setCandidates(nextCandidates)
    syncSelectedCandidates(nextCandidates)

    const nextTime = parseTimeLabel(
      nextCandidates.find((candidate) => candidate.timeLabel)?.timeLabel ?? ''
    )
    setDefaultStartTime(nextTime.start || DEFAULT_CLOCK_TIME)
    setDefaultEndTime(nextTime.end)
  }

  function commitCandidateChange(nextOrUpdater: Candidate[] | ((items: Candidate[]) => Candidate[])) {
    const nextCandidates =
      typeof nextOrUpdater === 'function' ? nextOrUpdater(candidates) : nextOrUpdater

    if (areCandidatesEqual(candidates, nextCandidates)) return

    setCandidatePast((past) => [
      ...past.slice(-(MAX_CANDIDATE_HISTORY - 1)),
      cloneCandidates(candidates),
    ])
    setCandidateFuture([])
    setCandidates(cloneCandidates(nextCandidates))
  }

  function undoCandidateChange() {
    if (candidatePast.length === 0) return

    const previous = candidatePast[candidatePast.length - 1]
    setCandidatePast((past) => past.slice(0, -1))
    setCandidateFuture((future) => [
      cloneCandidates(candidates),
      ...future.slice(0, MAX_CANDIDATE_HISTORY - 1),
    ])
    restoreCandidateSnapshot(previous)
  }

  function redoCandidateChange() {
    if (candidateFuture.length === 0) return

    const next = candidateFuture[0]
    setCandidatePast((past) => [
      ...past.slice(-(MAX_CANDIDATE_HISTORY - 1)),
      cloneCandidates(candidates),
    ])
    setCandidateFuture((future) => future.slice(1))
    restoreCandidateSnapshot(next)
  }

  // ---- ドラッグ終了時の並び替え ----
  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (over && active.id !== over.id) {
      commitCandidateChange((items) => {
        const oldIndex = items.findIndex((i) => i.id === active.id)
        const newIndex = items.findIndex((i) => i.id === over.id)
        return arrayMove(items, oldIndex, newIndex)
      })
    }
  }

  // ---- 日付順に並べ替え ----
  function sortByDate() {
    commitCandidateChange((prev) =>
      [...prev].sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date)
        return a.timeLabel.localeCompare(b.timeLabel)
      })
    )
  }

  // ---- 共通: 日付リストを候補に追加 ----
  function addDatesFromList(dates: string[]) {
    const toAdd = dates.filter(Boolean).sort()
    if (toAdd.length === 0) return
    const newCandidateTime = toTimeLabel(defaultStartTime, defaultEndTime)
    let id = nextId
    const newItems = toAdd.map((d) => ({
      id: `new-${id++}`,
      date: d,
      timeLabel: newCandidateTime,
    }))
    const kept = candidates.filter((c) => c.date)
    commitCandidateChange([...kept, ...newItems])
    setNextId(id)
  }

  // ---- 時間一括適用 ----
  function applyTimeToAll() {
    const timeLabel = toTimeLabel(defaultStartTime, defaultEndTime)
    commitCandidateChange((prev) => prev.map((c) => ({ ...c, timeLabel })))
  }

  function applyTimeToSelected() {
    if (selectedCandidateIds.size === 0) return
    const timeLabel = toTimeLabel(defaultStartTime, defaultEndTime)
    commitCandidateChange((prev) =>
      prev.map((c) =>
        selectedCandidateIds.has(c.id) ? { ...c, timeLabel } : c
      )
    )
  }

  function toggleCandidateSelection(id: string) {
    setSelectedCandidateIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function removeCandidate(id: string) {
    commitCandidateChange((prev) => prev.filter((c) => c.id !== id))
    setSelectedCandidateIds((prev) => {
      if (!prev.has(id)) return prev
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }

  function updateCandidate(id: string, field: 'date' | 'timeLabel', value: string) {
    if (field === 'timeLabel') {
      const nextTime = parseTimeLabel(value)
      setDefaultStartTime(nextTime.start)
      setDefaultEndTime(nextTime.end)
    }

    commitCandidateChange((prev) =>
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

  function removeBusyCandidates(
    busyPeriods: BusyPeriod[],
    datedCandidates: Candidate[],
    readSummary = '.ics を解析しました。'
  ) {
    const busyIds = new Set<string>()
    for (const c of datedCandidates) {
      const { start: cs, end: ce } = parseCandidateTimeRange(c.date, c.timeLabel)
      const csMs = new Date(cs).getTime()
      const ceMs = new Date(ce).getTime()
      const isBusy = busyPeriods.some(({ start, end, isAllDay }) => {
        if (isAllDay) return isDateInAllDayRange(c.date, start, end)
        return start.getTime() < ceMs && end.getTime() > csMs
      })
      if (isBusy) busyIds.add(c.id)
    }

    if (busyIds.size === 0) {
      setIcsStatus('done')
      setIcsMessage(`${readSummary} 予定と重なる日程はありませんでした。`)
      return
    }

    commitCandidateChange((prev) => prev.filter((c) => !busyIds.has(c.id)))
    setSelectedCandidateIds((prev) => {
      const next = new Set(prev)
      for (const id of busyIds) next.delete(id)
      return next
    })
    const removed = busyIds.size
    const kept = datedCandidates.length - removed
    setIcsStatus('done')
    setIcsMessage(
      kept > 0
        ? `${readSummary} ${removed}件を削除しました（残り${kept}件）。確認してから作成してください。`
        : `${readSummary} ${removed}件すべて予定と重なったため削除しました。候補日を追加し直してください。`
    )
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

      const ICAL = (await import('ical.js')).default
      const sorted = [...datedCandidates].sort((a, b) => a.date.localeCompare(b.date))
      const rangeStart = ICAL.Time.fromDateTimeString(sorted[0].date + 'T00:00:00')
      const rangeEnd = ICAL.Time.fromDateTimeString(sorted[sorted.length - 1].date + 'T23:59:59')

      const busyPeriods: { start: Date; end: Date; isAllDay: boolean }[] = []

      const calendarFiles = await readCalendarFileTexts(file)
      for (const { text } of calendarFiles.texts) {
        const jcal = ICAL.parse(text)
        const comp = new ICAL.Component(jcal)
        const vevents = comp.getAllSubcomponents('vevent')
        for (const vevent of vevents) {
          const event = new ICAL.Event(vevent)
          if (!isBlockingCalendarEvent(vevent)) continue
          if (event.isRecurring()) {
            const expand = new ICAL.RecurExpansion({ component: vevent, dtstart: event.startDate })
            let count = 0
            let next = expand.next()
            while (next && count < MAX_RECURRING_OCCURRENCES) {
              count++
              const detail = event.getOccurrenceDetails(next)
              if (detail.startDate.compare(rangeEnd) > 0) break
              if (detail.endDate.compare(rangeStart) <= 0) continue
              busyPeriods.push({ start: detail.startDate.toJSDate(), end: detail.endDate.toJSDate(), isAllDay: detail.startDate.isDate })
              next = expand.next()
            }
          } else {
            busyPeriods.push({ start: event.startDate.toJSDate(), end: event.endDate.toJSDate(), isAllDay: event.startDate.isDate })
          }
        }
      }

      removeBusyCandidates(busyPeriods, datedCandidates, describeCalendarFileRead(calendarFiles))
    } catch {
      setIcsStatus('error')
      setIcsMessage('読み取りに失敗しました。.ics または .zip ファイルか確認してください。')
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

  function handleAddCurrentMonthFromToday() {
    if (addableMonthDates.length === 0) return
    addDatesFromList(addableMonthDates)
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
      if (editEventId && editShareId) {
        const { error: eventError } = await supabase
          .from('events')
          .update({ name: eventName, description: description || null })
          .eq('id', editEventId)

        if (eventError) throw eventError

        const existingCandidates = validCandidates.filter(
          (candidate): candidate is Candidate & { dbId: string } => Boolean(candidate.dbId)
        )
        const newCandidates = validCandidates.filter((candidate) => !candidate.dbId)
        const keptCandidateIds = new Set(existingCandidates.map((candidate) => candidate.dbId))
        const removedCandidateIds = [...originalCandidateIds].filter(
          (candidateId) => !keptCandidateIds.has(candidateId)
        )

        const updateResults = await Promise.all(
          existingCandidates.map((candidate) =>
            supabase
              .from('candidates')
              .update({
                date: candidate.date,
                time_label: candidate.timeLabel || null,
                sort_order: validCandidates.indexOf(candidate),
              })
              .eq('id', candidate.dbId)
          )
        )
        const candidateUpdateError = updateResults.find((result) => result.error)?.error
        if (candidateUpdateError) throw candidateUpdateError

        if (newCandidates.length > 0) {
          const { error: insertError } = await supabase
            .from('candidates')
            .insert(
              newCandidates.map((candidate) => ({
                event_id: editEventId,
                date: candidate.date,
                time_label: candidate.timeLabel || null,
                sort_order: validCandidates.indexOf(candidate),
              }))
            )

          if (insertError) throw insertError
        }

        if (removedCandidateIds.length > 0) {
          const { error: deleteError } = await supabase
            .from('candidates')
            .delete()
            .in('id', removedCandidateIds)

          if (deleteError) throw deleteError
        }

        router.push(`/e/${editShareId}`)
        return
      }

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

  const calGrid = getCalendarGrid(calYear, calMonth)
  const addableMonthDates = getMonthDatesFromToday(calYear, calMonth)
  const candidateCountByDate = candidates.reduce<Record<string, number>>((acc, candidate) => {
    if (!candidate.date) return acc
    acc[candidate.date] = (acc[candidate.date] ?? 0) + 1
    return acc
  }, {})
  const hasDatedCandidates = candidates.some((c) => c.date)
  const canUndoCandidates = candidatePast.length > 0
  const canRedoCandidates = candidateFuture.length > 0
  const isEditMode = Boolean(editEventId && editShareId)
  const submitLabel = isEditMode ? '更新する' : '作成する'
  const submittingLabel = isEditMode ? '更新中...' : '作成中...'

  function scrollToPageBottom() {
    window.scrollTo({
      top: document.documentElement.scrollHeight,
      behavior: 'auto',
    })
  }

  function scrollToPageTop() {
    window.scrollTo({
      top: 0,
      behavior: 'auto',
    })
  }

  return (
    <div className="min-h-screen px-4 py-3">
      <div className="mx-auto max-w-xl">
        {/* ヘッダー */}
        <div className="mb-2 text-center">
          <h1 className="font-serif text-3xl text-rose-800">日程組</h1>
          <p className="text-sm text-stone-500">
            {isLoadingEdit
              ? '日程を読み込んでいます...'
              : isEditMode
              ? '日程を編集して、共有ページに戻りましょう'
              : '候補日を入力して、参加者に共有しましょう'}
          </p>
          <button
            type="button"
            onClick={scrollToPageBottom}
            className="mt-1 rounded-full border border-stone-200 px-3 py-1 text-xs text-stone-400 transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
          >
            ↓ 最下部へ
          </button>
        </div>

        {/* フォームカード */}
        <form
          onSubmit={handleSubmit}
          className="rounded-2xl bg-white/70 px-6 pb-3 pt-4 shadow-sm backdrop-blur"
        >
          {/* イベント名 */}
          <div className="mb-2">
            <div className="mb-1 flex items-center justify-between gap-3">
              <label className="block text-sm font-medium text-stone-700">
                イベント名 <span className="text-rose-700">*</span>
              </label>
              <button
                type="submit"
                disabled={isSubmitting || isLoadingEdit || !hasDatedCandidates}
                className="shrink-0 rounded-full bg-rose-800 px-5 py-1.5 text-sm font-medium text-white shadow transition-all hover:bg-rose-900 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSubmitting ? submittingLabel : submitLabel}
              </button>
            </div>
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
          <div className="mb-0">
            <label className="mb-1 block text-sm font-medium text-stone-700">
              説明（任意）
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="場所や詳細など"
              rows={3}
              className="block w-full resize-none rounded-lg border border-stone-200 bg-white px-4 py-2.5 text-stone-800 placeholder-stone-300 focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100"
            />
          </div>

          {/* 候補日時 */}
          <div className="mb-8">
            <label className="mb-1 block text-sm font-medium text-stone-700">
              候補日時 <span className="text-rose-700">*</span>
            </label>

            {/* 時間帯バー */}
            <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-4 py-3">
              <span className="shrink-0 text-sm text-stone-500">時間帯：</span>
              <div className="flex items-center gap-1">
                <input
                  type="time"
                  step={900}
                  value={defaultStartTime}
                  onChange={(e) => {
                    const start = e.target.value
                    setDefaultStartTime(start)
                    if (!start) setDefaultEndTime('')
                  }}
                  aria-label="開始時間"
                  className="w-28 rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-sm text-stone-800 focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100"
                />
                <span className="text-sm text-stone-400">〜</span>
                <input
                  type="time"
                  step={900}
                  value={defaultEndTime}
                  onChange={(e) => setDefaultEndTime(e.target.value)}
                  disabled={!defaultStartTime}
                  aria-label="終了時間（任意）"
                  className="w-28 rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-sm text-stone-800 focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100 disabled:cursor-not-allowed disabled:bg-stone-50 disabled:text-stone-300"
                />
              </div>
              <button
                type="button"
                onClick={applyTimeToAll}
                disabled={candidates.length === 0}
                className="rounded-full border border-stone-300 px-3 py-1.5 text-xs text-stone-600 transition-colors hover:border-rose-300 hover:bg-rose-50 hover:text-rose-800 disabled:cursor-not-allowed disabled:opacity-40"
              >
                全部これに揃える
              </button>
              <button
                type="button"
                onClick={applyTimeToSelected}
                disabled={selectedCandidateIds.size === 0}
                className="rounded-full border border-stone-300 px-3 py-1.5 text-xs text-stone-600 transition-colors hover:border-rose-300 hover:bg-rose-50 hover:text-rose-800 disabled:cursor-not-allowed disabled:opacity-40"
              >
                選択した日程に適用
              </button>
              {selectedCandidateIds.size > 0 && (
                <span className="text-xs text-stone-400">
                  {selectedCandidateIds.size}件選択中
                </span>
              )}
              <div className="ml-auto flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={undoCandidateChange}
                  disabled={!canUndoCandidates}
                  className="rounded-full border border-stone-300 px-3 py-1.5 text-xs text-stone-600 transition-colors hover:border-rose-300 hover:bg-rose-50 hover:text-rose-800 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  ↶ 戻す
                </button>
                <button
                  type="button"
                  onClick={redoCandidateChange}
                  disabled={!canRedoCandidates}
                  className="rounded-full border border-stone-300 px-3 py-1.5 text-xs text-stone-600 transition-colors hover:border-rose-300 hover:bg-rose-50 hover:text-rose-800 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  ↷ 進む
                </button>
              </div>
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
                        selected={selectedCandidateIds.has(c.id)}
                        onToggleSelected={toggleCandidateSelection}
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
              <input ref={icsInputRef} type="file" accept=".ics,.zip" className="hidden" onChange={handleIcsUpload} />
              <button
                type="button"
                onClick={() => icsInputRef.current?.click()}
                disabled={icsStatus === 'loading'}
                className="rounded-full border border-stone-200 px-3 py-1.5 text-sm text-stone-500 transition-colors hover:border-rose-200 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {icsStatus === 'loading' ? '解析中...' : '📂 .ics / zip で空き日程を絞り込む'}
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
                    <li>ZIP がダウンロードされる</li>
                    <li>その ZIP をそのままアップロード（誕生日カレンダーは除外）</li>
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
            disabled={isSubmitting || isLoadingEdit || !hasDatedCandidates}
            className="w-full rounded-full bg-rose-800 py-3 text-base font-medium text-white shadow transition-all hover:bg-rose-900 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? submittingLabel : submitLabel}
          </button>
        </form>

        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={scrollToPageTop}
            className="rounded-full border border-stone-200 px-3 py-1 text-xs text-stone-400 transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
          >
            ↑ 最上部へ
          </button>
        </div>
        <p className="mt-2 text-center text-xs text-stone-400">
          不具合・ご要望はこちら:{' '}
          <span>nittei.app5@gmail.com</span>
        </p>
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

            <button
              type="button"
              onClick={handleAddCurrentMonthFromToday}
              disabled={addableMonthDates.length === 0}
              className="mb-4 w-full rounded-full border border-rose-300 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-800 shadow-sm ring-1 ring-rose-100 transition-all hover:border-rose-400 hover:bg-rose-100 hover:shadow disabled:cursor-not-allowed disabled:border-stone-200 disabled:bg-white disabled:text-stone-300 disabled:shadow-none disabled:ring-0 disabled:hover:bg-white"
            >
              {addableMonthDates.length > 0
                ? `＋ この月の今日以降を追加（${addableMonthDates.length}日）`
                : 'この月は追加できる日がありません'}
            </button>

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
                const addedCount = candidateCountByDate[dateStr] ?? 0
                const isSelected = calSelected.has(dateStr)
                const dow = d.getDay()
                return (
                  <button
                    key={dateStr}
                    type="button"
                    onClick={() => toggleCalDate(dateStr)}
                    className={`relative mx-auto flex h-9 w-9 items-center justify-center rounded-full text-sm transition-colors ${
                      isSelected
                        ? 'bg-rose-700 font-bold text-white'
                        : dow === 0
                        ? 'text-rose-400 hover:bg-rose-50'
                        : dow === 6
                        ? 'text-blue-400 hover:bg-blue-50'
                        : 'text-stone-700 hover:bg-stone-100'
                    }`}
                  >
                    {d.getDate()}
                    {addedCount > 0 && (
                      <span className={`absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] leading-none ${
                        isSelected ? 'bg-white text-rose-700' : 'bg-rose-100 text-rose-700'
                      }`}>
                        {addedCount}
                      </span>
                    )}
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
