'use client'

import { useEffect, useState, useRef, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { siteShortName } from '@/lib/site'
import { ANSWER_CHOICE_SETS, DEFAULT_ANSWER_CHOICES } from '@/lib/answer-choices'
import type { AnswerChoiceSet } from '@/lib/database.types'
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
import { describeCalendarFileError, describeCalendarFileRead, readCalendarFileTexts } from '@/lib/calendar-files'

type Candidate = {
  id: string
  dbId?: string
  date: string
  timeLabel: string
}

const MAX_CANDIDATE_HISTORY = 50

// 戻す/進むの1コマ。候補日リスト・カレンダーの選択・時間帯をセットで記録する
type CandidateHistoryEntry = {
  candidates: Candidate[]
  calSelected: Set<string>
  defaultStartTime: string
  defaultEndTime: string
}

function cloneCandidates(items: Candidate[]) {
  return items.map((item) => ({ ...item }))
}

function areDateSetsEqual(a: Set<string>, b: Set<string>) {
  if (a.size !== b.size) return false
  for (const value of a) {
    if (!b.has(value)) return false
  }
  return true
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

type CalendarPaintMode = 'add' | 'remove'

type CalendarPaintSession = {
  pointerId: number
  mode: CalendarPaintMode
  startDate: string
  startX: number
  startY: number
  didPaint: boolean
  initialSelected: Set<string>
}

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']
const emptySubscribe = () => () => {}
const MAX_RECURRING_OCCURRENCES = 10000
const DEFAULT_CLOCK_TIME = '21:00'
const CALENDAR_PAINT_MOVE_THRESHOLD = 8
const SHARE_ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789'
const SHARE_ID_LENGTH = 8
const SHARE_ID_MAX_ATTEMPTS = 5
const SHARE_ID_RANDOM_LIMIT = 256 - (256 % SHARE_ID_ALPHABET.length)

function generateShareId(): string {
  const result: string[] = []
  const randomValues = new Uint8Array(SHARE_ID_LENGTH)

  while (result.length < SHARE_ID_LENGTH) {
    crypto.getRandomValues(randomValues)
    for (const value of randomValues) {
      if (value >= SHARE_ID_RANDOM_LIMIT) continue
      result.push(SHARE_ID_ALPHABET[value % SHARE_ID_ALPHABET.length])
      if (result.length === SHARE_ID_LENGTH) break
    }
  }

  return result.join('')
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

function datesBetweenAnyOrder(a: string, b: string): string[] {
  return a <= b ? datesBetween(a, b) : datesBetween(b, a)
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
        className="shrink-0 cursor-grab touch-none select-none text-sm text-stone-500 hover:text-stone-600 active:cursor-grabbing sm:text-base"
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
        className="w-[7.2rem] min-w-0 max-w-[7.2rem] rounded-lg border border-stone-300 bg-white px-1.5 py-2 text-sm text-stone-800 focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100 sm:min-w-36 sm:max-w-none sm:flex-1 sm:px-3 sm:text-base"
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
          className="w-[4.45rem] rounded-lg border border-stone-300 bg-white px-1 py-2 text-[13px] text-stone-800 focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100 sm:w-28 sm:px-3 sm:text-base"
        />
        <span className="text-sm text-stone-600">〜</span>
        <input
          type="time"
          step={900}
          value={toEndClockValue(c.timeLabel)}
          onChange={(e) => onUpdate(c.id, 'timeLabel', toTimeLabel(toStartClockValue(c.timeLabel), e.target.value))}
          disabled={!toStartClockValue(c.timeLabel)}
          aria-label="終了時間(任意)"
          className="w-[4.45rem] rounded-lg border border-stone-300 bg-white px-1 py-2 text-[13px] text-stone-800 focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100 disabled:cursor-not-allowed disabled:bg-stone-50 disabled:text-stone-500 sm:w-28 sm:px-3 sm:text-base"
        />
      </div>
      <button
        type="button"
        onClick={() => onRemove(c.id)}
        className="shrink-0 text-sm text-stone-500 hover:text-rose-400 sm:text-base"
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
  // 回答の選択肢（伝助と同じ3種類。既定は「○△✕」）
  const [answerChoices, setAnswerChoices] = useState<AnswerChoiceSet>(DEFAULT_ANSWER_CHOICES)
  const [defaultStartTime, setDefaultStartTime] = useState(DEFAULT_CLOCK_TIME)
  const [defaultEndTime, setDefaultEndTime] = useState('')
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [candidatePast, setCandidatePast] = useState<CandidateHistoryEntry[]>([])
  const [candidateFuture, setCandidateFuture] = useState<CandidateHistoryEntry[]>([])
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<Set<string>>(new Set())
  const [nextId, setNextId] = useState(1)
  const [editShareId, setEditShareId] = useState<string | null>(null)
  const [editEventId, setEditEventId] = useState<string | null>(null)
  const [originalCandidateIds, setOriginalCandidateIds] = useState<Set<string>>(new Set())
  // 編集ロード時点の各候補日の日付（dbId → date）。日付変更の確認に使う
  const [originalCandidateDates, setOriginalCandidateDates] = useState<Record<string, string>>({})
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

  // カレンダー（常時表示。日付を選んで「追加」ボタンで候補日にする）
  const now = new Date()
  const [calYear, setCalYear] = useState(now.getFullYear())
  const [calMonth, setCalMonth] = useState(now.getMonth())
  const [calSelected, setCalSelected] = useState<Set<string>>(new Set())
  // 履歴記録用に最新の選択状態を参照する ref（candidatesRef と同じ役割）
  const calSelectedRef = useRef(calSelected)
  const candidatesRef = useRef(candidates)
  const candidatePastRef = useRef(candidatePast)
  const candidateFutureRef = useRef(candidateFuture)
  const defaultTimeRef = useRef({ start: defaultStartTime, end: defaultEndTime })
  // 時刻入力は1文字ごとに変化するため、フォーカス中の1回の編集をまとめて履歴1コマにする
  const timeEditBaselineRef = useRef<CandidateHistoryEntry | null>(null)

  function replaceCalSelected(nextSelected: Set<string>) {
    const selection = new Set(nextSelected)
    calSelectedRef.current = selection
    setCalSelected(selection)
  }

  function replaceDefaultTime(start: string, end: string) {
    defaultTimeRef.current = { start, end }
    setDefaultStartTime(start)
    setDefaultEndTime(end)
  }

  function replaceCandidatePast(nextPast: CandidateHistoryEntry[]) {
    candidatePastRef.current = nextPast
    setCandidatePast(nextPast)
  }

  function replaceCandidateFuture(nextFuture: CandidateHistoryEntry[]) {
    candidateFutureRef.current = nextFuture
    setCandidateFuture(nextFuture)
  }

  function pushCandidatePast(entry: CandidateHistoryEntry) {
    replaceCandidatePast([
      ...candidatePastRef.current.slice(-(MAX_CANDIDATE_HISTORY - 1)),
      entry,
    ])
  }
  // 「今日」に依存する表示はビルド時のHTMLとズレるため、マウント後に描画する
  const calendarMounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  )
  const calendarPaintRef = useRef<CalendarPaintSession | null>(null)
  const suppressNextCalendarClickRef = useRef(false)

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
        setAnswerChoices(event.answer_choices ?? DEFAULT_ANSWER_CHOICES)
        candidatesRef.current = drafts
        setCandidates(drafts)
        replaceCandidatePast([])
        replaceCandidateFuture([])
        setOriginalCandidateIds(new Set(drafts.map((candidate) => candidate.dbId!)))
        setOriginalCandidateDates(
          Object.fromEntries(drafts.map((candidate) => [candidate.dbId!, candidate.date]))
        )
        setSelectedCandidateIds(new Set())
        const draftTime = parseTimeLabel(drafts.find((candidate) => candidate.timeLabel)?.timeLabel ?? '')
        replaceDefaultTime(draftTime.start || DEFAULT_CLOCK_TIME, draftTime.end)
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

  function restoreCandidateSnapshot(snapshot: CandidateHistoryEntry) {
    const nextCandidates = cloneCandidates(snapshot.candidates)
    candidatesRef.current = nextCandidates
    setCandidates(nextCandidates)
    syncSelectedCandidates(nextCandidates)
    replaceCalSelected(snapshot.calSelected)
    // 復元中は編集中の時刻入力の控えを捨てる（古い値で履歴を積まないため）
    timeEditBaselineRef.current = null
    replaceDefaultTime(snapshot.defaultStartTime, snapshot.defaultEndTime)
  }

  // 現時点の状態を履歴1コマ分として写し取る
  function currentHistoryEntry(): CandidateHistoryEntry {
    return {
      candidates: cloneCandidates(candidatesRef.current),
      calSelected: new Set(calSelectedRef.current),
      defaultStartTime: defaultTimeRef.current.start,
      defaultEndTime: defaultTimeRef.current.end,
    }
  }

  // ---- 時間帯（時刻入力・時刻なし）の履歴 ----
  function beginTimeEdit() {
    if (!timeEditBaselineRef.current) timeEditBaselineRef.current = currentHistoryEntry()
  }

  function endTimeEdit() {
    const baseline = timeEditBaselineRef.current
    timeEditBaselineRef.current = null
    if (!baseline) return
    if (
      baseline.defaultStartTime === defaultTimeRef.current.start &&
      baseline.defaultEndTime === defaultTimeRef.current.end
    ) {
      return
    }

    pushCandidatePast(baseline)
    replaceCandidateFuture([])
  }

  function clearDefaultTime() {
    // 入力にフォーカスしたまま押された場合、控えは blur 側が処理するので捨てる
    timeEditBaselineRef.current = null
    if (!defaultTimeRef.current.start && !defaultTimeRef.current.end) return

    pushCandidatePast(currentHistoryEntry())
    replaceCandidateFuture([])
    replaceDefaultTime('', '')
  }

  function commitCandidateChange(nextOrUpdater: Candidate[] | ((items: Candidate[]) => Candidate[])) {
    const currentCandidates = candidatesRef.current
    const nextCandidates =
      typeof nextOrUpdater === 'function' ? nextOrUpdater(currentCandidates) : nextOrUpdater

    if (areCandidatesEqual(currentCandidates, nextCandidates)) return

    pushCandidatePast(currentHistoryEntry())
    replaceCandidateFuture([])
    const candidatesSnapshot = cloneCandidates(nextCandidates)
    candidatesRef.current = candidatesSnapshot
    setCandidates(candidatesSnapshot)
  }

  // カレンダーの選択変更も同じ履歴に積む（戻す/進むで選択もやり直せる）
  function commitCalSelectedChange(nextSelected: Set<string>) {
    if (areDateSetsEqual(calSelectedRef.current, nextSelected)) return

    pushCandidatePast(currentHistoryEntry())
    replaceCandidateFuture([])
    replaceCalSelected(nextSelected)
  }

  function undoCandidateChange() {
    const past = candidatePastRef.current
    if (past.length === 0) return

    const previous = past[past.length - 1]
    replaceCandidatePast(past.slice(0, -1))
    replaceCandidateFuture([
      currentHistoryEntry(),
      ...candidateFutureRef.current.slice(0, MAX_CANDIDATE_HISTORY - 1),
    ])
    restoreCandidateSnapshot(previous)
  }

  function redoCandidateChange() {
    const future = candidateFutureRef.current
    if (future.length === 0) return

    const next = future[0]
    pushCandidatePast(currentHistoryEntry())
    replaceCandidateFuture(future.slice(1))
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
  function sortCandidatesByDate(items: Candidate[]) {
    return [...items].sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date)
      return a.timeLabel.localeCompare(b.timeLabel)
    })
  }

  function sortByDate() {
    commitCandidateChange((prev) => sortCandidatesByDate(prev))
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
    commitCandidateChange(sortCandidatesByDate([...kept, ...newItems]))
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
      // 行の時間をクリアしたときに、時間帯デフォルトまで空にしない
      if (nextTime.start) {
        replaceDefaultTime(nextTime.start, nextTime.end)
      }
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
      // 範囲境界はタイムゾーン情報なしの時刻として比較され（UTC扱い）、実際の境界と
      // 最大±14時間ずれるため、前後1日広げて定期予定の取りこぼしを防ぐ。
      // 厳密な重なり判定は後段の busyPeriods チェックが行う。
      const rangeStartDay = new Date(sorted[0].date + 'T00:00:00')
      rangeStartDay.setDate(rangeStartDay.getDate() - 1)
      const rangeEndDay = new Date(sorted[sorted.length - 1].date + 'T00:00:00')
      rangeEndDay.setDate(rangeEndDay.getDate() + 1)
      const rangeStart = ICAL.Time.fromDateTimeString(toDateStr(rangeStartDay) + 'T00:00:00')
      const rangeEnd = ICAL.Time.fromDateTimeString(toDateStr(rangeEndDay) + 'T23:59:59')

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
            for (let next = expand.next(); next && count < MAX_RECURRING_OCCURRENCES; next = expand.next()) {
              count++
              const detail = event.getOccurrenceDetails(next)
              if (detail.startDate.compare(rangeEnd) > 0) break
              if (detail.endDate.compare(rangeStart) <= 0) continue
              busyPeriods.push({ start: detail.startDate.toJSDate(), end: detail.endDate.toJSDate(), isAllDay: detail.startDate.isDate })
            }
          } else {
            busyPeriods.push({ start: event.startDate.toJSDate(), end: event.endDate.toJSDate(), isAllDay: event.startDate.isDate })
          }
        }
      }

      removeBusyCandidates(busyPeriods, datedCandidates, describeCalendarFileRead(calendarFiles))
    } catch (err) {
      setIcsStatus('error')
      setIcsMessage(
        describeCalendarFileError(err) ??
          '読み取りに失敗しました。.ics または .zip ファイルか確認してください。'
      )
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
  function prevMonth() {
    if (calMonth === 0) { setCalYear((y) => y - 1); setCalMonth(11) }
    else setCalMonth((m) => m - 1)
  }

  function nextMonth() {
    if (calMonth === 11) { setCalYear((y) => y + 1); setCalMonth(0) }
    else setCalMonth((m) => m + 1)
  }

  function toggleCalDate(dateStr: string) {
    const next = new Set(calSelectedRef.current)
    if (next.has(dateStr)) next.delete(dateStr)
    else next.add(dateStr)
    commitCalSelectedChange(next)
  }

  function toggleCalendarDates(dateStrs: string[]) {
    if (dateStrs.length === 0) return

    const next = new Set(calSelectedRef.current)
    const shouldRemove = dateStrs.every((dateStr) => next.has(dateStr))
    for (const dateStr of dateStrs) {
      if (shouldRemove) next.delete(dateStr)
      else next.add(dateStr)
    }
    commitCalSelectedChange(next)
  }

  function getCalendarDateAtPoint(clientX: number, clientY: number) {
    const element = document.elementFromPoint(clientX, clientY) as HTMLElement | null
    return element?.closest<HTMLElement>('[data-calendar-date]')?.dataset.calendarDate ?? null
  }

  function applyCalendarPaintRange(dateStr: string) {
    const session = calendarPaintRef.current
    if (!session) return

    // 別の日までドラッグしたあと開始日に引き返した場合は、
    // 開始日だけを残さずドラッグ開始前の状態へ完全に戻す。
    if (dateStr === session.startDate) {
      if (session.didPaint) replaceCalSelected(session.initialSelected)
      return
    }

    session.didPaint = true
    const next = new Set(session.initialSelected)
    for (const rangeDate of datesBetweenAnyOrder(session.startDate, dateStr)) {
      if (session.mode === 'add') next.add(rangeDate)
      else next.delete(rangeDate)
    }
    replaceCalSelected(next)
  }

  function handleCalendarPaintStart(e: React.PointerEvent<HTMLButtonElement>, dateStr: string) {
    if (e.button !== 0) return

    calendarPaintRef.current = {
      pointerId: e.pointerId,
      mode: calSelectedRef.current.has(dateStr) ? 'remove' : 'add',
      startDate: dateStr,
      startX: e.clientX,
      startY: e.clientY,
      didPaint: false,
      initialSelected: new Set(calSelectedRef.current),
    }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function handleCalendarPaintMove(e: React.PointerEvent<HTMLButtonElement>) {
    const session = calendarPaintRef.current
    if (!session || session.pointerId !== e.pointerId) return

    const distance = Math.hypot(e.clientX - session.startX, e.clientY - session.startY)
    if (!session.didPaint && distance < CALENDAR_PAINT_MOVE_THRESHOLD) return

    const dateStr = getCalendarDateAtPoint(e.clientX, e.clientY)
    if (!dateStr) return

    e.preventDefault()
    applyCalendarPaintRange(dateStr)
  }

  function handleCalendarPaintEnd(e: React.PointerEvent<HTMLButtonElement>) {
    const session = calendarPaintRef.current
    if (!session || session.pointerId !== e.pointerId) return

    calendarPaintRef.current = null
    if (!session.didPaint) return

    // ドラッグ中は直接描画していたので、1ドラッグ分をまとめて履歴1コマにする
    // （「前の状態」= ドラッグ開始時に控えた initialSelected）
    if (!areDateSetsEqual(session.initialSelected, calSelectedRef.current)) {
      pushCandidatePast({
        ...currentHistoryEntry(),
        calSelected: new Set(session.initialSelected),
      })
      replaceCandidateFuture([])
    }

    suppressNextCalendarClickRef.current = true
    window.setTimeout(() => {
      suppressNextCalendarClickRef.current = false
    }, 160)
  }

  function handleAddFromCalendar() {
    addDatesFromList([...calSelectedRef.current].sort())
    replaceCalSelected(new Set())
  }

  function handleSelectCurrentMonthFromToday() {
    if (addableMonthDates.length === 0) return
    toggleCalendarDates(addableMonthDates)
  }

  function handleToggleWeekday(weekdayIndex: number) {
    const dates = calendarMonthDates.filter((dateStr) => {
      const date = new Date(dateStr + 'T00:00:00')
      return date.getDay() === weekdayIndex
    })
    if (dates.length === 0) return

    const next = new Set(calSelectedRef.current)
    const hasSelectedDate = dates.some((dateStr) => next.has(dateStr))
    for (const dateStr of dates) {
      if (hasSelectedDate) next.delete(dateStr)
      else next.add(dateStr)
    }
    commitCalSelectedChange(next)
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
        const existingCandidates = validCandidates.filter(
          (candidate): candidate is Candidate & { dbId: string } => Boolean(candidate.dbId)
        )
        const newCandidates = validCandidates.filter((candidate) => !candidate.dbId)
        const keptCandidateIds = new Set(existingCandidates.map((candidate) => candidate.dbId))
        const removedCandidateIds = [...originalCandidateIds].filter(
          (candidateId) => !keptCandidateIds.has(candidateId)
        )

        // 候補日を削除すると、その日に紐づく回答も cascade で一緒に消える。
        // 書き込みを始める前に、消える回答があるか確認する（キャンセル時は何も変更しない）。
        if (removedCandidateIds.length > 0) {
          const { count: removedAnswerCount, error: answerCountError } = await supabase
            .from('answers')
            .select('id', { count: 'exact', head: true })
            .in('candidate_id', removedCandidateIds)

          if (answerCountError) throw answerCountError

          if (removedAnswerCount && removedAnswerCount > 0) {
            const ok = window.confirm(
              `削除しようとしている候補日には、${removedAnswerCount}件の回答が含まれています。\n` +
                'この候補日を削除すると、その日に対する回答もすべて削除されます。続けますか？'
            )
            if (!ok) {
              setIsSubmitting(false)
              return
            }
          }
        }

        // 日付を変更した候補日に付いている回答は、そのまま新しい日付の回答として
        // 表示され続ける。誤操作で集計が変わらないよう、書き込み前に確認する。
        const dateChangedCandidateIds = existingCandidates
          .filter((candidate) => {
            const originalDate = originalCandidateDates[candidate.dbId]
            return originalDate !== undefined && originalDate !== candidate.date
          })
          .map((candidate) => candidate.dbId)

        if (dateChangedCandidateIds.length > 0) {
          const { count: movedAnswerCount, error: movedCountError } = await supabase
            .from('answers')
            .select('id', { count: 'exact', head: true })
            .in('candidate_id', dateChangedCandidateIds)

          if (movedCountError) throw movedCountError

          if (movedAnswerCount && movedAnswerCount > 0) {
            const ok = window.confirm(
              `日付を変更した候補日には、${movedAnswerCount}件の回答が付いています。\n` +
                '日付を変更すると、これらの回答は新しい日付への回答として引き継がれます。続けますか？'
            )
            if (!ok) {
              setIsSubmitting(false)
              return
            }
          }
        }

        const { error: eventError } = await supabase
          .from('events')
          .update({ name: eventName, description: description || null, answer_choices: answerChoices })
          .eq('id', editEventId)

        if (eventError) throw eventError

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

      let shareId = ''
      let event: { id: string } | null = null

      for (let attempt = 0; attempt < SHARE_ID_MAX_ATTEMPTS; attempt += 1) {
        shareId = generateShareId()

        const { data, error: eventError } = await supabase
          .from('events')
          .insert({ share_id: shareId, name: eventName, description: description || null, answer_choices: answerChoices })
          .select('id')
          .single()

        if (!eventError) {
          event = data
          break
        }

        if (eventError.code !== '23505') throw eventError
      }

      if (!event) {
        throw new Error('共有URLの生成に失敗しました。')
      }

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
  const calendarMonthDates = calGrid.filter((d): d is Date => Boolean(d)).map(toDateStr)
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
          <h1 className="inline-flex items-baseline gap-1.5 font-serif text-3xl text-rose-800">
            <span>日程組</span>
            <span className="font-sans text-xs font-normal text-stone-600">略して {siteShortName}</span>
          </h1>
          <p className="text-sm text-stone-600">
            {isLoadingEdit
              ? '日程を読み込んでいます...'
              : isEditMode
              ? '日程を編集して、共有ページに戻りましょう'
              : '候補日を入力して、参加者に共有しましょう'}
          </p>
          <button
            type="button"
            onClick={scrollToPageBottom}
            className="mt-1 rounded-full border border-stone-300 px-3 py-1 text-xs text-stone-600 transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
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
              placeholder="例：みんなでご飯"
              className="w-full rounded-lg border border-stone-300 bg-white px-4 py-2.5 text-stone-800 placeholder-stone-500 focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100"
            />
          </div>

          {/* 説明 */}
          <div className="mb-0">
            <label className="mb-1 block text-sm font-medium text-stone-700">
              説明(任意)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="場所や詳細など"
              rows={3}
              className="block w-full resize rounded-lg border border-stone-300 bg-white px-4 py-2.5 text-stone-800 placeholder-stone-500 focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100"
            />
          </div>

          {/* 回答の選択肢 */}
          <div className="mt-3">
            <label className="mb-1 block text-sm font-medium text-stone-700">
              回答の選択肢
            </label>
            <div className="flex flex-wrap gap-2">
              {ANSWER_CHOICE_SETS.map((set) => (
                <button
                  key={set.value}
                  type="button"
                  onClick={() => setAnswerChoices(set.value)}
                  aria-pressed={answerChoices === set.value}
                  className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                    answerChoices === set.value
                      ? 'border-rose-400 bg-rose-50 text-rose-800'
                      : 'border-stone-300 text-stone-700 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-800'
                  }`}
                >
                  {set.label}
                </button>
              ))}
            </div>
          </div>

          {/* 候補日時 */}
          <div className="mb-8">
            <label className="mb-1 block text-sm font-medium text-stone-700">
              候補日時 <span className="text-rose-700">*</span>
            </label>

            {/* 時間帯バー */}
            <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-stone-300 bg-stone-50 px-4 py-3">
              <span className="shrink-0 text-sm text-stone-600">時間帯：</span>
              <div className="flex items-center gap-1">
                <input
                  type="time"
                  step={900}
                  value={defaultStartTime}
                  onFocus={beginTimeEdit}
                  onBlur={endTimeEdit}
                  onChange={(e) => {
                    const start = e.target.value
                    beginTimeEdit()
                    replaceDefaultTime(start, start ? defaultTimeRef.current.end : '')
                  }}
                  aria-label="開始時間"
                  className="w-28 rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm text-stone-800 focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100"
                />
                <span className="text-sm text-stone-600">〜</span>
                <input
                  type="time"
                  step={900}
                  value={defaultEndTime}
                  onFocus={beginTimeEdit}
                  onBlur={endTimeEdit}
                  onChange={(e) => {
                    beginTimeEdit()
                    replaceDefaultTime(defaultTimeRef.current.start, e.target.value)
                  }}
                  disabled={!defaultStartTime}
                  aria-label="終了時間(任意)"
                  className="w-28 rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm text-stone-800 focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100 disabled:cursor-not-allowed disabled:bg-stone-50 disabled:text-stone-500"
                />
              </div>
              <button
                type="button"
                onClick={clearDefaultTime}
                disabled={!defaultStartTime && !defaultEndTime}
                title="開始・終了時刻を空にする"
                className="rounded-full border border-stone-300 px-3 py-1.5 text-xs text-stone-700 transition-colors hover:border-rose-300 hover:bg-rose-50 hover:text-rose-800 disabled:cursor-not-allowed disabled:opacity-70"
              >
                時刻なし
              </button>
              <button
                type="button"
                onClick={applyTimeToAll}
                disabled={candidates.length === 0}
                className="rounded-full border border-stone-300 px-3 py-1.5 text-xs text-stone-700 transition-colors hover:border-rose-300 hover:bg-rose-50 hover:text-rose-800 disabled:cursor-not-allowed disabled:opacity-70"
              >
                全部これに揃える
              </button>
              <button
                type="button"
                onClick={applyTimeToSelected}
                disabled={selectedCandidateIds.size === 0}
                className="rounded-full border border-stone-300 px-3 py-1.5 text-xs text-stone-700 transition-colors hover:border-rose-300 hover:bg-rose-50 hover:text-rose-800 disabled:cursor-not-allowed disabled:opacity-70"
              >
                選択した日程に適用
              </button>
              {selectedCandidateIds.size > 0 && (
                <span className="text-xs text-stone-600">
                  {selectedCandidateIds.size}件選択中
                </span>
              )}
              <div className="ml-auto flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={undoCandidateChange}
                  disabled={!canUndoCandidates}
                  className="rounded-full border border-stone-300 px-3 py-1.5 text-xs text-stone-700 transition-colors hover:border-rose-300 hover:bg-rose-50 hover:text-rose-800 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  ↶ 戻す
                </button>
                <button
                  type="button"
                  onClick={redoCandidateChange}
                  disabled={!canRedoCandidates}
                  className="rounded-full border border-stone-300 px-3 py-1.5 text-xs text-stone-700 transition-colors hover:border-rose-300 hover:bg-rose-50 hover:text-rose-800 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  ↷ 進む
                </button>
              </div>
            </div>

            {/* カレンダー（日付を選択してから候補日に追加） */}
            <div className="mb-3 rounded-xl border border-stone-300 bg-stone-50 px-4 py-2.5">
              {!calendarMounted && <div className="h-80" aria-hidden="true" />}
              {calendarMounted && (
              <div className="mx-auto max-w-sm">
                {/* 月ナビ */}
                <div className="mb-1 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={prevMonth}
                    className="rounded-full p-1.5 text-stone-600 transition-colors hover:bg-stone-100 hover:text-stone-700"
                  >
                    ←
                  </button>
                  <span className="font-serif text-lg text-stone-700">
                    {calYear}年{calMonth + 1}月
                  </span>
                  <button
                    type="button"
                    onClick={nextMonth}
                    className="rounded-full p-1.5 text-stone-600 transition-colors hover:bg-stone-100 hover:text-stone-700"
                  >
                    →
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleSelectCurrentMonthFromToday}
                  disabled={addableMonthDates.length === 0}
                  className="mb-1.5 w-full rounded-full border border-rose-300 bg-rose-50 px-4 py-1.5 text-sm font-semibold text-rose-800 shadow-sm ring-1 ring-rose-100 transition-all hover:border-rose-400 hover:bg-rose-100 hover:shadow disabled:cursor-not-allowed disabled:border-stone-300 disabled:bg-white disabled:text-stone-500 disabled:shadow-none disabled:ring-0 disabled:hover:bg-white"
                >
                  {addableMonthDates.length > 0
                    ? `この月の今日以降を選択（${addableMonthDates.length}日）`
                    : 'この月は追加できる日がありません'}
                </button>

                <p className="mb-1 text-center text-xs text-stone-600">
                  日付を選んで、下の「追加」ボタンで確定（ドラッグや曜日ボタンでまとめて選択）
                </p>

                {/* 曜日ヘッダー */}
                <div className="mb-0.5 grid grid-cols-7 text-center text-xs text-stone-600">
                  {WEEKDAYS.map((w, i) => {
                    const weekdayDates = calendarMonthDates.filter((dateStr) => {
                      const date = new Date(dateStr + 'T00:00:00')
                      return date.getDay() === i
                    })
                    const isWeekdaySelected = weekdayDates.some((dateStr) => calSelected.has(dateStr))

                    return (
                      <button
                        key={w}
                        type="button"
                        onClick={() => handleToggleWeekday(i)}
                        disabled={weekdayDates.length === 0}
                        className={`mx-auto flex h-7 w-7 items-center justify-center rounded-full text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${
                          isWeekdaySelected
                            ? 'bg-rose-700 font-bold text-white'
                            : i === 0
                            ? 'text-rose-400 hover:bg-rose-50'
                            : i === 6
                            ? 'text-blue-400 hover:bg-blue-50'
                            : 'text-stone-600 hover:bg-stone-100'
                        }`}
                      >
                        {w}
                      </button>
                    )
                  })}
                </div>

                {/* 日付グリッド */}
                <div className="grid grid-cols-7">
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
                        data-calendar-date={dateStr}
                        onPointerDown={(e) => handleCalendarPaintStart(e, dateStr)}
                        onPointerMove={handleCalendarPaintMove}
                        onPointerUp={handleCalendarPaintEnd}
                        onPointerCancel={handleCalendarPaintEnd}
                        onClick={() => {
                          if (suppressNextCalendarClickRef.current) {
                            suppressNextCalendarClickRef.current = false
                            return
                          }
                          toggleCalDate(dateStr)
                        }}
                        className={`relative mx-auto flex h-9 w-9 touch-none select-none items-center justify-center rounded-full text-sm transition-colors ${
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

                {/* 追加ボタン */}
                <button
                  type="button"
                  onClick={handleAddFromCalendar}
                  disabled={calSelected.size === 0}
                  className="mt-2 w-full rounded-full bg-rose-800 py-2 text-sm font-medium text-white transition-colors hover:bg-rose-900 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {calSelected.size > 0 ? `${calSelected.size}日を追加` : '日付を選んでください'}
                </button>
              </div>
              )}
            </div>

            {/* 追加ボタン群 */}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setRangeOpen(true)}
                className="rounded-full border border-stone-300 px-3 py-1.5 text-sm text-stone-600 transition-colors hover:border-rose-200 hover:text-rose-700"
              >
                📅 範囲で追加
              </button>
              <button
                type="button"
                onClick={sortByDate}
                disabled={candidates.length < 2}
                className="rounded-full border border-stone-300 px-3 py-1.5 text-sm text-stone-600 transition-colors hover:border-rose-200 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                ↕ 日付順に並べ替え
              </button>
              <input ref={icsInputRef} type="file" accept=".ics,.zip" className="hidden" onChange={handleIcsUpload} />
              <button
                type="button"
                onClick={() => icsInputRef.current?.click()}
                disabled={icsStatus === 'loading'}
                className="rounded-full border border-stone-300 px-3 py-1.5 text-sm text-stone-600 transition-colors hover:border-rose-200 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {icsStatus === 'loading' ? '解析中...' : '📂 .ics / zip で空き日程を絞り込む'}
              </button>
            </div>
            {icsMessage && (
              <p className={`mt-2 text-xs ${icsStatus === 'error' ? 'text-red-500' : 'text-stone-600'}`}>
                {icsMessage}
              </p>
            )}
            <button
              type="button"
              onClick={() => setIcsGuideOpen((v) => !v)}
              className="mt-1 text-xs text-stone-600 underline hover:text-rose-700"
            >
              書き出し方法を見る {icsGuideOpen ? '▲' : '▼'}
            </button>
            {icsGuideOpen && (
              <div className="mt-2 space-y-3 rounded-xl border border-stone-300 bg-stone-50 px-4 py-3 text-xs text-stone-700">
                <div>
                  <a href="https://calendar.google.com/calendar/u/0/r/settings/export" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-white px-2.5 py-1 font-medium text-rose-700 underline-offset-2 transition-colors hover:bg-rose-50 hover:underline">
                    Google カレンダーを開く <span aria-hidden="true">↗</span>
                  </a>
                  <ol className="mt-1 list-decimal pl-4 space-y-0.5 text-stone-600">
                    <li>開いたページで「エクスポート」をクリック</li>
                    <li>ZIP がダウンロードされる</li>
                    <li>その ZIP をそのままアップロード（誕生日カレンダーは自動で除外）</li>
                  </ol>
                </div>
                <div>
                  <a href="https://www.icloud.com/calendar" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-white px-2.5 py-1 font-medium text-rose-700 underline-offset-2 transition-colors hover:bg-rose-50 hover:underline">
                    Apple カレンダー（iCloud）を開く <span aria-hidden="true">↗</span>
                  </a>
                  <ol className="mt-1 list-decimal pl-4 space-y-0.5 text-stone-600">
                    <li>PC ブラウザで開く</li>
                    <li>カレンダー名の横の共有マークから書き出し</li>
                    <li>その .ics をアップロード</li>
                  </ol>
                </div>
                <div>
                  <a href="https://outlook.live.com/calendar/options/calendar/SharedCalendars" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-white px-2.5 py-1 font-medium text-rose-700 underline-offset-2 transition-colors hover:bg-rose-50 hover:underline">
                    Outlook カレンダーを開く <span aria-hidden="true">↗</span>
                  </a>
                  <ol className="mt-1 list-decimal pl-4 space-y-0.5 text-stone-600">
                    <li>Outlook の URL 先で .ics ファイルをダウンロード</li>
                    <li>その .ics をアップロード</li>
                  </ol>
                </div>
              </div>
            )}

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
                  <div className="mt-3 space-y-2">
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
              <p className="mt-3 rounded-xl border border-dashed border-stone-300 bg-white/50 px-4 py-3 text-sm text-stone-600">
                候補日はまだありません
              </p>
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

        <div className="mt-1 text-center">
          <button
            type="button"
            onClick={scrollToPageTop}
            className="rounded-full border border-stone-300 px-3 py-1 text-xs text-stone-600 transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
          >
            ↑ 最上部へ
          </button>
        </div>
        <p className="mt-2 text-center text-[11px] text-stone-600">
          ※ 最後の更新から1年が経過したイベントは自動的に削除されます
        </p>
        <p className="mt-1 text-center text-xs text-stone-600">
          不具合・ご要望はこちら:{' '}
          <Link href="/contact" className="underline underline-offset-2 transition-colors hover:text-rose-700">
            お問い合わせ
          </Link>
        </p>
        <p className="mt-1 text-center text-[11px] text-stone-600">
          <Link href="/terms" className="underline-offset-2 transition-colors hover:text-rose-700 hover:underline">
            利用規約
          </Link>
          <span className="mx-2">·</span>
          <Link href="/privacy" className="underline-offset-2 transition-colors hover:text-rose-700 hover:underline">
            プライバシーポリシー
          </Link>
          <span className="mx-2">·</span>
          <Link href="/history" className="underline-offset-2 transition-colors hover:text-rose-700 hover:underline">
            ページ表示履歴
          </Link>
          <span className="mx-2">·</span>
          <a
            href="https://www.amazon.jp/hz/wishlist/ls/5B63O13XSOQ4?ref_=wl_share"
            target="_blank"
            rel="noopener noreferrer"
            title="Amazon のほしい物リストが開きます"
            className="underline-offset-2 transition-colors hover:text-rose-700 hover:underline"
          >
            支援 <span aria-hidden="true">↗</span>
          </a>
        </p>
      </div>

      {/* 範囲追加モーダル */}
      {rangeOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setRangeOpen(false) }}
        >
          <div className="mx-4 w-full max-w-sm rounded-2xl bg-white px-6 py-6 shadow-2xl">
            <p className="mb-1 text-center font-serif text-lg text-stone-700">範囲で追加</p>
            <p className="mb-5 text-center text-xs text-stone-600">
              開始日〜終了日を選ぶと、その間の日程をまとめて追加できます
            </p>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={rangeStart}
                onChange={(e) => setRangeStart(e.target.value)}
                className="min-w-0 flex-1 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800 focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100"
              />
              <span className="text-stone-600">〜</span>
              <input
                type="date"
                value={rangeEnd}
                min={rangeStart}
                onChange={(e) => setRangeEnd(e.target.value)}
                className="min-w-0 flex-1 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800 focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100"
              />
            </div>
            <div className="mt-5 flex items-center gap-3">
              <button
                type="button"
                onClick={handleAddRange}
                disabled={!rangeStart || !rangeEnd || rangeStart > rangeEnd}
                className="flex-1 rounded-full bg-rose-800 py-2.5 text-sm font-medium text-white transition-colors hover:bg-rose-900 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {rangeStart && rangeEnd && rangeStart <= rangeEnd
                  ? `${datesBetween(rangeStart, rangeEnd).length}日を追加`
                  : '日付を選んでください'}
              </button>
              <button
                type="button"
                onClick={() => setRangeOpen(false)}
                className="rounded-full border border-stone-300 px-4 py-2.5 text-sm text-stone-600 transition-colors hover:border-stone-300 hover:text-stone-700"
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
