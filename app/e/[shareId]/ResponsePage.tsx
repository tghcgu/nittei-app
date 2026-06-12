'use client'

import { useCallback, useEffect, useMemo, useState, useRef } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { describeCalendarFileError, describeCalendarFileRead, readCalendarFileTexts } from '@/lib/calendar-files'
import type { Event, Candidate, Answer, AnswerValue } from '@/lib/database.types'

// ---- 型定義 ----
type ResponseWithAnswers = {
  id: string
  event_id: string
  name: string
  note: string | null
  created_at: string
  answers: Answer[]
}

type Props = {
  shareId: string
  event: Event
  candidates: Candidate[]
  responses: ResponseWithAnswers[]
}

const ANSWER_OPTIONS = [
  {
    value: '○' as AnswerValue,
    idle: 'border-stone-200 text-stone-300 hover:border-emerald-300 hover:text-emerald-400',
    active: 'border-emerald-500 bg-emerald-50 text-emerald-700 font-bold',
  },
  {
    value: '△' as AnswerValue,
    idle: 'border-stone-200 text-stone-300 hover:border-amber-300 hover:text-amber-500',
    active: 'border-amber-400 bg-amber-50 text-amber-700 font-bold',
  },
  {
    value: '✕' as AnswerValue,
    idle: 'border-stone-200 text-stone-300 hover:border-stone-400 hover:text-stone-500',
    active: 'border-stone-400 bg-stone-100 text-stone-600 font-bold',
  },
  {
    value: '-' as AnswerValue,
    idle: 'border-stone-200 text-stone-300 hover:border-blue-300 hover:text-blue-400',
    active: 'border-blue-300 bg-blue-50 text-blue-600 font-bold',
  },
]

const DAYS = ['日', '月', '火', '水', '木', '金', '土']
const MAX_RECURRING_OCCURRENCES = 10000

type CalendarComponent = {
  getFirstPropertyValue: (name: string) => unknown
}

type BusyPeriod = {
  start: Date
  end: Date
  isAllDay: boolean
}

type ClockRange = {
  start: number
  end: number | null
}

type LastSetAllAnswers = {
  value: AnswerValue
  candidateIds: string[]
}

type AnswerHistorySnapshot = {
  answers: Record<string, AnswerValue>
  detailNotes: Record<string, string>
  lastSetAllAnswers: LastSetAllAnswers | null
}

type AnswerPaintSession = {
  pointerId: number
  pointerType: string
  startCandidateId: string
  value: AnswerValue
  startX: number
  startY: number
  isReady: boolean
  didPaint: boolean
  activationTimer: number | null
  paintedValuesByCandidate: Map<string, AnswerValue>
  originalSnapshot: AnswerHistorySnapshot
  workingSnapshot: AnswerHistorySnapshot
}

const MAX_ANSWER_HISTORY = 50
const ANSWER_PAINT_LONG_PRESS_MS = 220
const ANSWER_PAINT_MOVE_THRESHOLD = 8
// ペイント中に指が画面の上下端からこの距離内に入ったら自動スクロールする
const ANSWER_PAINT_EDGE_SCROLL_ZONE = 72
const ANSWER_PAINT_EDGE_SCROLL_MIN_SPEED = 3
const ANSWER_PAINT_EDGE_SCROLL_MAX_SPEED = 14

function toDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00')
  return `${d.getMonth() + 1}/${d.getDate()}（${DAYS[d.getDay()]}）`
}

function answerColor(v: AnswerValue | undefined) {
  if (v === '○') return 'text-emerald-600 font-bold'
  if (v === '△') return 'text-amber-600'
  if (v === '✕') return 'text-stone-400'
  if (v === '-') return 'text-blue-500'
  return 'text-stone-300'
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

function cloneLastSetAllAnswers(value: LastSetAllAnswers | null): LastSetAllAnswers | null {
  if (!value) return null
  return { value: value.value, candidateIds: [...value.candidateIds] }
}

function cloneAnswerSnapshot(snapshot: AnswerHistorySnapshot): AnswerHistorySnapshot {
  return {
    answers: { ...snapshot.answers },
    detailNotes: { ...snapshot.detailNotes },
    lastSetAllAnswers: cloneLastSetAllAnswers(snapshot.lastSetAllAnswers),
  }
}

function areRecordsEqual<T>(a: Record<string, T>, b: Record<string, T>) {
  const aKeys = Object.keys(a)
  const bKeys = Object.keys(b)
  if (aKeys.length !== bKeys.length) return false

  return aKeys.every((key) => Object.is(a[key], b[key]))
}

function areLastSetAllAnswersEqual(a: LastSetAllAnswers | null, b: LastSetAllAnswers | null) {
  if (!a || !b) return a === b
  if (a.value !== b.value || a.candidateIds.length !== b.candidateIds.length) return false

  return a.candidateIds.every((id, index) => id === b.candidateIds[index])
}

function areAnswerSnapshotsEqual(a: AnswerHistorySnapshot, b: AnswerHistorySnapshot) {
  return (
    areRecordsEqual(a.answers, b.answers) &&
    areRecordsEqual(a.detailNotes, b.detailNotes) &&
    areLastSetAllAnswersEqual(a.lastSetAllAnswers, b.lastSetAllAnswers)
  )
}

function clockToMinutes(value: string): number | null {
  const match = value.match(/^(\d{1,2}):(\d{2})$/)
  if (!match) return null

  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null

  return hours * 60 + minutes
}

function parseCandidateClockRange(timeLabel: string | null): ClockRange | null {
  if (!timeLabel) return null

  const times = timeLabel.match(/\d{1,2}:\d{2}/g) ?? []
  const start = times[0] ? clockToMinutes(times[0]) : null
  if (start === null) return null

  const end = times[1] ? clockToMinutes(times[1]) : null
  return { start, end }
}

function adjustedRangeEnd(start: number, end: number) {
  return end <= start ? end + 24 * 60 : end
}

function isClockMinuteInRange(minute: number, rangeStart: number, rangeEnd: number) {
  if (rangeStart === rangeEnd) return false
  const adjustedEnd = adjustedRangeEnd(rangeStart, rangeEnd)

  return [0, 24 * 60].some((offset) => {
    const shiftedMinute = minute + offset
    // 終端は含めない：範囲の終わりちょうどに始まる候補は「重なりなし」
    return shiftedMinute >= rangeStart && shiftedMinute < adjustedEnd
  })
}

function clockRangesOverlap(candidate: ClockRange, rangeStart: number, rangeEnd: number) {
  if (rangeStart === rangeEnd) return false
  if (candidate.end === null) {
    return isClockMinuteInRange(candidate.start, rangeStart, rangeEnd)
  }

  const adjustedRange = { start: rangeStart, end: adjustedRangeEnd(rangeStart, rangeEnd) }
  const adjustedCandidate = {
    start: candidate.start,
    end: adjustedRangeEnd(candidate.start, candidate.end),
  }

  return [-24 * 60, 0, 24 * 60].some((offset) => {
    const candidateStart = adjustedCandidate.start + offset
    const candidateEnd = adjustedCandidate.end + offset
    // 端点で接しているだけ（共有時間0分）は重なりとみなさない
    return candidateStart < adjustedRange.end && candidateEnd > adjustedRange.start
  })
}

function getFirstCandidateMonthRange(candidates: Candidate[]) {
  const firstDate = candidates.find((c) => c.date)?.date
  if (!firstDate) return null

  const firstMonth = firstDate.slice(0, 7)
  const datesInFirstMonth = candidates
    .map((c) => c.date)
    .filter((date) => date.startsWith(firstMonth))
    .sort((a, b) => a.localeCompare(b))

  if (datesInFirstMonth.length === 0) return null

  return {
    start: datesInFirstMonth[0],
    end: datesInFirstMonth[datesInFirstMonth.length - 1],
  }
}

// ---- メインコンポーネント ----
export function ResponsePage({ shareId, event, candidates, responses }: Props) {
  const [responseRows, setResponseRows] = useState<ResponseWithAnswers[]>(responses)
  const [isLoadingResponses, setIsLoadingResponses] = useState(false)
  const [responsesError, setResponsesError] = useState<string | null>(null)
  const hasLoadedResponsesRef = useRef(false)
  const [name, setName] = useState('')
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({})
  // 個別メモ：「-」選択時のみ、候補日ごと（answers.note に保存）
  const [detailNotes, setDetailNotes] = useState<Record<string, string>>({})
  // 共通メモ：常時表示、回答全体で1つ（responses.note に保存）
  const [sharedNote, setSharedNote] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitSuccess, setSubmitSuccess] = useState<'created' | 'updated' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tableLayout, setTableLayout] = useState<'h' | 'v'>('v')
  const [editingResponseId, setEditingResponseId] = useState<string | null>(null)
  const [editingAnswerIds, setEditingAnswerIds] = useState<Record<string, string>>({})
  const [deletingResponseId, setDeletingResponseId] = useState<string | null>(null)

  // 範囲で一括回答
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkStart, setBulkStart] = useState('')
  const [bulkEnd, setBulkEnd] = useState('')
  const [bulkValue, setBulkValue] = useState<AnswerValue>('○')
  const [bulkTimeStart, setBulkTimeStart] = useState('')
  const [bulkTimeEnd, setBulkTimeEnd] = useState('')
  const [bulkTimeValue, setBulkTimeValue] = useState<AnswerValue>(ANSWER_OPTIONS[2].value)
  // 一括回答パネル共通の曜日フィルター（空＝全曜日が対象）
  const [bulkWeekdays, setBulkWeekdays] = useState<Set<number>>(new Set())
  const [keepExistingAnswers, setKeepExistingAnswers] = useState(true)
  const [lastSetAllAnswers, setLastSetAllAnswers] = useState<LastSetAllAnswers | null>(null)
  const [answerPast, setAnswerPast] = useState<AnswerHistorySnapshot[]>([])
  const [answerFuture, setAnswerFuture] = useState<AnswerHistorySnapshot[]>([])
  const answerPaintRef = useRef<AnswerPaintSession | null>(null)
  const answerPaintAutoScrollRef = useRef<{ rafId: number | null; x: number; y: number }>({
    rafId: null,
    x: 0,
    y: 0,
  })
  const suppressNextAnswerClickRef = useRef(false)

  // 共有URLコピー
  const [copied, setCopied] = useState(false)

  async function handleCopyUrl() {
    const url = `${window.location.origin}/e/${shareId}`
    try {
      if (!navigator.clipboard) throw new Error('clipboard unavailable')
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // 非HTTPSやWebViewなどクリップボードが使えない環境では手動コピー用に提示する
      window.prompt('このURLをコピーしてください', url)
    }
  }

  function jumpToElement(id: string, topPadding = 32) {
    const element = document.getElementById(id)
    if (!element) return

    window.scrollTo({
      top: Math.max(0, element.getBoundingClientRect().top + window.scrollY - topPadding),
      behavior: 'auto',
    })
  }

  function scrollToResponses() {
    jumpToElement('answer-submit-area', 16)
  }

  function scrollToAnswerForm() {
    window.scrollTo({ top: 0, behavior: 'auto' })
  }

  // 最新ステートを参照するための ref。.ics 解析のように await を挟んだ後に
  // スナップショットを取る処理が、await 前の古いクロージャ値で
  // 解析中の手入力を上書きしないようにする。
  const answersRef = useRef(answers)
  const detailNotesRef = useRef(detailNotes)
  const lastSetAllAnswersRef = useRef(lastSetAllAnswers)
  useEffect(() => {
    answersRef.current = answers
    detailNotesRef.current = detailNotes
    lastSetAllAnswersRef.current = lastSetAllAnswers
  }, [answers, detailNotes, lastSetAllAnswers])

  function getAnswerSnapshot(): AnswerHistorySnapshot {
    return {
      answers: { ...answersRef.current },
      detailNotes: { ...detailNotesRef.current },
      lastSetAllAnswers: cloneLastSetAllAnswers(lastSetAllAnswersRef.current),
    }
  }

  function restoreAnswerSnapshot(snapshot: AnswerHistorySnapshot) {
    const next = cloneAnswerSnapshot(snapshot)
    setAnswers(next.answers)
    setDetailNotes(next.detailNotes)
    setLastSetAllAnswers(next.lastSetAllAnswers)
  }

  function resetAnswerHistory() {
    setAnswerPast([])
    setAnswerFuture([])
  }

  function commitAnswerChange(
    updater: (current: AnswerHistorySnapshot) => AnswerHistorySnapshot
  ) {
    const current = getAnswerSnapshot()
    const next = cloneAnswerSnapshot(updater(cloneAnswerSnapshot(current)))
    if (areAnswerSnapshotsEqual(current, next)) return

    setAnswerPast((past) => [
      ...past.slice(-(MAX_ANSWER_HISTORY - 1)),
      cloneAnswerSnapshot(current),
    ])
    setAnswerFuture([])
    restoreAnswerSnapshot(next)
  }

  function undoAnswerChange() {
    if (answerPast.length === 0) return

    const previous = answerPast[answerPast.length - 1]
    setAnswerPast((past) => past.slice(0, -1))
    setAnswerFuture((future) => [
      getAnswerSnapshot(),
      ...future.slice(0, MAX_ANSWER_HISTORY - 1),
    ])
    restoreAnswerSnapshot(previous)
  }

  function redoAnswerChange() {
    if (answerFuture.length === 0) return

    const next = answerFuture[0]
    setAnswerPast((past) => [
      ...past.slice(-(MAX_ANSWER_HISTORY - 1)),
      getAnswerSnapshot(),
    ])
    setAnswerFuture((future) => future.slice(1))
    restoreAnswerSnapshot(next)
  }

  function toggleBulkOpen() {
    if (bulkOpen) {
      setBulkOpen(false)
      return
    }

    if (!bulkStart || !bulkEnd) {
      const firstMonthRange = getFirstCandidateMonthRange(candidates)
      if (firstMonthRange) {
        setBulkStart(firstMonthRange.start)
        setBulkEnd(firstMonthRange.end)
      }
    }

    setBulkOpen(true)
  }

  // .ics 自動入力ステータス
  const [icsStatus, setIcsStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [icsMessage, setIcsMessage] = useState('')
  const [icsOptionsOpen, setIcsOptionsOpen] = useState(false)
  const [icsGuideOpen, setIcsGuideOpen] = useState(false)
  const [icsBusyValue, setIcsBusyValue] = useState<AnswerValue | null>('✕')
  const [icsFreeValue, setIcsFreeValue] = useState<AnswerValue | null>('○')
  const loadResponses = useCallback(async () => {
    setIsLoadingResponses(true)
    setResponsesError(null)

    try {
      const { data, error } = await supabase
        .from('responses')
        .select('id, event_id, name, note, created_at, answers(id, response_id, candidate_id, value, note)')
        .eq('event_id', event.id)
        .order('created_at')

      if (error) throw error

      setResponseRows((data ?? []) as ResponseWithAnswers[])
    } catch (err) {
      console.error(err)
      setResponsesError('回答一覧の読み込みに失敗しました。再読み込みしてください。')
    } finally {
      setIsLoadingResponses(false)
    }
  }, [event.id])

  useEffect(() => {
    if (hasLoadedResponsesRef.current) return
    hasLoadedResponsesRef.current = true
    void loadResponses()
  }, [loadResponses])

  const answerByResponseAndCandidate = useMemo(() => {
    const map = new Map<string, Answer>()
    for (const response of responseRows) {
      for (const answer of response.answers) {
        map.set(`${response.id}:${answer.candidate_id}`, answer)
      }
    }
    return map
  }, [responseRows])
  const editingResponse = editingResponseId
    ? responseRows.find((response) => response.id === editingResponseId) ?? null
    : null
  const hasResponses = responseRows.length > 0

  function handleEdit(r: ResponseWithAnswers) {
    setName(r.name)
    const newAnswers: Record<string, AnswerValue> = {}
    const newDetailNotes: Record<string, string> = {}
    const newAnswerIds: Record<string, string> = {}
    for (const a of r.answers) {
      newAnswers[a.candidate_id] = a.value
      newAnswerIds[a.candidate_id] = a.id
      if (a.note) newDetailNotes[a.candidate_id] = a.note
    }
    setAnswers(newAnswers)
    setDetailNotes(newDetailNotes)
    setEditingAnswerIds(newAnswerIds)
    setSharedNote(r.note ?? '')
    setEditingResponseId(r.id)
    setLastSetAllAnswers(null)
    resetAnswerHistory()
    setSubmitSuccess(null)
    setError(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function handleCancelEdit() {
    setName('')
    setAnswers({})
    setDetailNotes({})
    setEditingAnswerIds({})
    setSharedNote('')
    setEditingResponseId(null)
    setLastSetAllAnswers(null)
    resetAnswerHistory()
    setError(null)
  }

  async function handleDeleteResponse(r: ResponseWithAnswers) {
    const ok = window.confirm(`${r.name} さんの回答を削除します。`)
    if (!ok) return

    setDeletingResponseId(r.id)
    setError(null)

    try {
      const { error: answersError } = await supabase
        .from('answers')
        .delete()
        .eq('response_id', r.id)

      if (answersError) throw answersError

      const { error: responseError } = await supabase
        .from('responses')
        .delete()
        .eq('id', r.id)

      if (responseError) throw responseError

      if (editingResponseId === r.id) {
        handleCancelEdit()
      }

      setResponseRows((prev) => prev.filter((response) => response.id !== r.id))
    } catch (err) {
      console.error(err)
      setError('回答の削除に失敗しました。もう一度試してください。')
    } finally {
      setDeletingResponseId(null)
    }
  }

  // time_label（例: "19:00〜22:00" や "21:00〜"）をパースしてISO文字列のstart/endを返す
  function parseCandidateTimeRange(date: string, timeLabel: string | null) {
    const fallback = {
      start: new Date(date + 'T00:00:00').toISOString(),
      end:   new Date(date + 'T23:59:00').toISOString(),
    }
    if (!timeLabel) return fallback

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

  // ---- .ics ファイルから日程を読み取り ----
  const icsInputRef = useRef<HTMLInputElement>(null)

  function applyBusyPeriodsToAnswers(busyPeriods: BusyPeriod[], doneMessage: string) {
    const newAnswers: Record<string, AnswerValue | null> = {}
    for (const c of candidates) {
      const { start: cs, end: ce } = parseCandidateTimeRange(c.date, c.time_label)
      const csMs = new Date(cs).getTime()
      const ceMs = new Date(ce).getTime()
      const datePrefix = c.date

      const isBusy = busyPeriods.some(({ start, end, isAllDay }) => {
        if (isAllDay) return isDateInAllDayRange(datePrefix, start, end)
        return start.getTime() < ceMs && end.getTime() > csMs
      })

      newAnswers[c.id] = isBusy ? icsBusyValue : icsFreeValue
    }

    // 複数の .ics を読むとき、先に「予定あり」になった候補は次の読み込みで戻さない
    commitAnswerChange((current) => {
      const merged: Record<string, AnswerValue> = { ...current.answers }
      for (const [id, val] of Object.entries(newAnswers)) {
        if (val === null) continue
        if (current.answers[id] === icsBusyValue && val === icsFreeValue) continue
        merged[id] = val
      }
      return {
        ...current,
        answers: merged,
        lastSetAllAnswers: null,
      }
    })
    setIcsStatus('done')
    setIcsMessage(doneMessage)
  }

  async function handleIcsUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    if (candidates.length === 0) {
      setIcsStatus('error')
      setIcsMessage('候補日がないため自動入力できません。')
      return
    }

    setIcsStatus('loading')
    setIcsMessage('')

    try {
      const ICAL = (await import('ical.js')).default
      const sortedDates = [...candidates].sort((a, b) => a.date.localeCompare(b.date))
      // 範囲境界はタイムゾーン情報なしの時刻として比較され（UTC扱い）、実際の境界と
      // 最大±14時間ずれるため、前後1日広げて定期予定の取りこぼしを防ぐ。
      // 厳密な重なり判定は後段の busyPeriods チェックが行う。
      const rangeStartDay = new Date(sortedDates[0].date + 'T00:00:00')
      rangeStartDay.setDate(rangeStartDay.getDate() - 1)
      const rangeEndDay = new Date(sortedDates[sortedDates.length - 1].date + 'T00:00:00')
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

      applyBusyPeriodsToAnswers(
        busyPeriods,
        `${describeCalendarFileRead(calendarFiles)} 内容を確認してから送信してください。`
      )
    } catch (err) {
      setIcsStatus('error')
      setIcsMessage(
        describeCalendarFileError(err) ??
          '読み取りに失敗しました。.ics または .zip ファイルか確認して、手動で入力してください。'
      )
    }
  }

  function toggleBulkWeekday(weekdayIndex: number) {
    setBulkWeekdays((prev) => {
      const next = new Set(prev)
      if (next.has(weekdayIndex)) next.delete(weekdayIndex)
      else next.add(weekdayIndex)
      return next
    })
  }

  function matchesBulkWeekdays(date: string) {
    if (bulkWeekdays.size === 0) return true
    return bulkWeekdays.has(new Date(date + 'T00:00:00').getDay())
  }

  function applyBulkAnswer() {
    if (!bulkStart || !bulkEnd || bulkStart > bulkEnd) return
    const updates: Record<string, AnswerValue> = {}
    for (const c of candidates) {
      if (c.date >= bulkStart && c.date <= bulkEnd && matchesBulkWeekdays(c.date)) {
        updates[c.id] = bulkValue
      }
    }
    commitAnswerChange((current) => {
      const nextDetailNotes = { ...current.detailNotes }
      // 「-」以外なら個別メモをクリア
      if (bulkValue !== '-') {
        for (const id of Object.keys(updates)) delete nextDetailNotes[id]
      }

      return {
        answers: { ...current.answers, ...updates },
        detailNotes: nextDetailNotes,
        lastSetAllAnswers: null,
      }
    })
    setBulkOpen(false)
  }

  function applyBulkTimeAnswer() {
    const rangeStart = clockToMinutes(bulkTimeStart)
    const rangeEnd = clockToMinutes(bulkTimeEnd)
    if (
      !bulkStart ||
      !bulkEnd ||
      bulkStart > bulkEnd ||
      rangeStart === null ||
      rangeEnd === null ||
      rangeStart === rangeEnd
    ) {
      return
    }

    const updates: Record<string, AnswerValue> = {}
    for (const c of candidates) {
      if (c.date < bulkStart || c.date > bulkEnd) continue
      if (!matchesBulkWeekdays(c.date)) continue

      const candidateRange = parseCandidateClockRange(c.time_label)
      if (candidateRange && clockRangesOverlap(candidateRange, rangeStart, rangeEnd)) {
        updates[c.id] = bulkTimeValue
      }
    }

    const updatedIds = Object.keys(updates)
    if (updatedIds.length === 0) return

    commitAnswerChange((current) => {
      const nextDetailNotes = { ...current.detailNotes }
      if (bulkTimeValue !== '-') {
        for (const id of updatedIds) delete nextDetailNotes[id]
      }

      return {
        answers: { ...current.answers, ...updates },
        detailNotes: nextDetailNotes,
        lastSetAllAnswers: null,
      }
    })
    setBulkOpen(false)
  }

  function handleSetAllAnswers(value: AnswerValue) {
    if (keepExistingAnswers) {
      if (lastSetAllAnswers?.value === value) {
        const idsToClear = lastSetAllAnswers.candidateIds
        commitAnswerChange((current) => {
          const nextAnswers = { ...current.answers }
          const nextDetailNotes = { ...current.detailNotes }
          for (const id of idsToClear) {
            if (nextAnswers[id] === value) delete nextAnswers[id]
            delete nextDetailNotes[id]
          }

          return {
            answers: nextAnswers,
            detailNotes: nextDetailNotes,
            lastSetAllAnswers: null,
          }
        })
        return
      }

      commitAnswerChange((current) => {
        const candidateIds = candidates
          .filter((c) => current.answers[c.id] === undefined)
          .map((c) => c.id)
        const updates: Record<string, AnswerValue> = Object.fromEntries(
          candidateIds.map((id) => [id, value])
        )

        return {
          answers: { ...current.answers, ...updates },
          detailNotes: current.detailNotes,
          lastSetAllAnswers: candidateIds.length > 0 ? { value, candidateIds } : null,
        }
      })
      return
    }

    commitAnswerChange((current) => {
      const isAlreadyAllSelected =
        candidates.length > 0 && candidates.every((c) => current.answers[c.id] === value)

      if (isAlreadyAllSelected) {
        return {
          answers: {},
          detailNotes: {},
          lastSetAllAnswers: null,
        }
      }

      return {
        answers: Object.fromEntries(candidates.map((c) => [c.id, value])),
        detailNotes: value === '-' ? current.detailNotes : {},
        lastSetAllAnswers: null,
      }
    })
  }

  function clearAnswerPaintTimer(session: AnswerPaintSession) {
    if (session.activationTimer === null) return
    window.clearTimeout(session.activationTimer)
    session.activationTimer = null
  }

  function getAnswerValue(value: string | undefined) {
    return ANSWER_OPTIONS.find((opt) => opt.value === value)?.value ?? null
  }

  function getAnswerPaintTargetAtPoint(clientX: number, clientY: number) {
    const element = document.elementFromPoint(clientX, clientY) as HTMLElement | null
    const target = element?.closest<HTMLElement>(
      '[data-answer-candidate-id], [data-answer-row-id]'
    )
    const candidateId = target?.dataset.answerCandidateId ?? target?.dataset.answerRowId ?? null
    if (!candidateId) return null

    return {
      candidateId,
      value: getAnswerValue(target?.dataset.answerValue),
    }
  }

  function applyAnswerPaintToSnapshot(
    snapshot: AnswerHistorySnapshot,
    originalSnapshot: AnswerHistorySnapshot,
    candidateId: string,
    value: AnswerValue
  ) {
    if (originalSnapshot.answers[candidateId] === value) {
      delete snapshot.answers[candidateId]
    } else {
      snapshot.answers[candidateId] = value
    }

    if (value !== '-') delete snapshot.detailNotes[candidateId]
    snapshot.lastSetAllAnswers = null
  }

  function paintAnswerCandidate(candidateId: string, value: AnswerValue) {
    const session = answerPaintRef.current
    if (!session || session.paintedValuesByCandidate.get(candidateId) === value) return

    session.value = value
    session.paintedValuesByCandidate.set(candidateId, value)
    session.didPaint = true
    applyAnswerPaintToSnapshot(
      session.workingSnapshot,
      session.originalSnapshot,
      candidateId,
      value
    )
    restoreAnswerSnapshot(session.workingSnapshot)
  }

  function startAnswerPaintSession(
    pointerId: number,
    pointerType: string,
    candidateId: string,
    value: AnswerValue,
    startX: number,
    startY: number
  ) {
    const originalSnapshot = getAnswerSnapshot()
    const session: AnswerPaintSession = {
      pointerId,
      pointerType,
      startCandidateId: candidateId,
      value,
      startX,
      startY,
      // マウスは即ペイント開始。タッチは長押し(ANSWER_PAINT_LONG_PRESS_MS)が経過するまで
      // 作動させず、スクロール目的のスワイプでペイントが誤発火しないようにする
      isReady: pointerType === 'mouse',
      didPaint: false,
      activationTimer: null,
      paintedValuesByCandidate: new Map(),
      originalSnapshot,
      workingSnapshot: cloneAnswerSnapshot(originalSnapshot),
    }

    if (!session.isReady) {
      session.activationTimer = window.setTimeout(() => {
        const current = answerPaintRef.current
        if (!current || current.pointerId !== session.pointerId) return
        current.isReady = true
        current.activationTimer = null
        // 長押し成立を指を動かす前に視覚で伝えるため、起点のマークを即ペイントする
        // （タップと同じトグル挙動なので、そのまま離してもタップと結果が変わらない）
        paintAnswerCandidate(current.startCandidateId, current.value)
      }, ANSWER_PAINT_LONG_PRESS_MS)
    }

    answerPaintRef.current = session
  }

  function handleAnswerPaintStart(
    e: React.PointerEvent<HTMLButtonElement>,
    candidateId: string,
    value: AnswerValue
  ) {
    if (e.pointerType !== 'mouse' || e.button !== 0) return

    startAnswerPaintSession(e.pointerId, e.pointerType, candidateId, value, e.clientX, e.clientY)
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  // 画面の上下端からの距離に応じた自動スクロール速度（端に深く入るほど速い）。0なら対象外
  function answerPaintEdgeScrollVelocity(clientY: number) {
    const zone = ANSWER_PAINT_EDGE_SCROLL_ZONE
    const range = ANSWER_PAINT_EDGE_SCROLL_MAX_SPEED - ANSWER_PAINT_EDGE_SCROLL_MIN_SPEED

    const bottomDepth = clientY - (window.innerHeight - zone)
    if (bottomDepth > 0) {
      return ANSWER_PAINT_EDGE_SCROLL_MIN_SPEED + range * Math.min(1, bottomDepth / zone)
    }

    const topDepth = zone - clientY
    if (topDepth > 0) {
      return -(ANSWER_PAINT_EDGE_SCROLL_MIN_SPEED + range * Math.min(1, topDepth / zone))
    }

    return 0
  }

  function stopAnswerPaintAutoScroll() {
    const state = answerPaintAutoScrollRef.current
    if (state.rafId === null) return

    window.cancelAnimationFrame(state.rafId)
    state.rafId = null
  }

  // ペイント中、指が画面の上下端に近づいたらページを自動スクロールする。
  // スクロールで指の下に流れ込んできた行は touchmove が発生しなくても塗る必要が
  // あるため、rAF ループ内で毎フレーム指の位置の行を塗り直す。
  function updateAnswerPaintAutoScroll(clientX: number, clientY: number) {
    const state = answerPaintAutoScrollRef.current
    state.x = clientX
    state.y = clientY

    if (answerPaintEdgeScrollVelocity(clientY) === 0) {
      stopAnswerPaintAutoScroll()
      return
    }
    if (state.rafId !== null) return

    const step = () => {
      const session = answerPaintRef.current
      const velocity = session?.isReady ? answerPaintEdgeScrollVelocity(state.y) : 0
      if (velocity === 0) {
        state.rafId = null
        return
      }

      window.scrollBy(0, velocity)
      const target = getAnswerPaintTargetAtPoint(state.x, state.y)
      if (target && session) paintAnswerCandidate(target.candidateId, target.value ?? session.value)
      state.rafId = window.requestAnimationFrame(step)
    }

    state.rafId = window.requestAnimationFrame(step)
  }

  function cancelAnswerPaint(pointerId: number) {
    const session = answerPaintRef.current
    if (!session || session.pointerId !== pointerId) return

    clearAnswerPaintTimer(session)
    stopAnswerPaintAutoScroll()
    answerPaintRef.current = null
  }

  function handleAnswerPaintMove(e: React.PointerEvent<HTMLButtonElement>) {
    const session = answerPaintRef.current
    if (!session || session.pointerId !== e.pointerId) return

    const distance = Math.hypot(e.clientX - session.startX, e.clientY - session.startY)
    if (!session.isReady) {
      if (distance > ANSWER_PAINT_MOVE_THRESHOLD) cancelAnswerPaint(e.pointerId)
      return
    }

    const target = getAnswerPaintTargetAtPoint(e.clientX, e.clientY)
    if (!target) return
    if (!session.didPaint && distance < ANSWER_PAINT_MOVE_THRESHOLD) return

    e.preventDefault()
    if (!session.didPaint) paintAnswerCandidate(session.startCandidateId, session.value)
    paintAnswerCandidate(target.candidateId, target.value ?? session.value)
  }

  function finishAnswerPaint(pointerId: number) {
    const session = answerPaintRef.current
    if (!session || session.pointerId !== pointerId) return

    clearAnswerPaintTimer(session)
    stopAnswerPaintAutoScroll()
    answerPaintRef.current = null

    if (!session.didPaint) return

    suppressNextAnswerClickRef.current = true
    window.setTimeout(() => {
      suppressNextAnswerClickRef.current = false
    }, 160)

    if (areAnswerSnapshotsEqual(session.originalSnapshot, session.workingSnapshot)) return

    setAnswerPast((past) => [
      ...past.slice(-(MAX_ANSWER_HISTORY - 1)),
      cloneAnswerSnapshot(session.originalSnapshot),
    ])
    setAnswerFuture([])
    restoreAnswerSnapshot(session.workingSnapshot)
  }

  function handleAnswerPaintEnd(e: React.PointerEvent<HTMLButtonElement>) {
    finishAnswerPaint(e.pointerId)
  }

  function getTouchById(touches: React.TouchList, identifier: number) {
    for (let i = 0; i < touches.length; i += 1) {
      const touch = touches.item(i)
      if (touch?.identifier === identifier) return touch
    }

    return null
  }

  function handleAnswerTouchStart(
    e: React.TouchEvent<HTMLButtonElement>,
    candidateId: string,
    value: AnswerValue
  ) {
    if (e.touches.length !== 1) return

    const touch = e.touches.item(0)
    if (!touch) return

    startAnswerPaintSession(
      touch.identifier,
      'touch',
      candidateId,
      value,
      touch.clientX,
      touch.clientY
    )
  }

  // タッチのドラッグペイントは touchmove で preventDefault してスクロールを止める必要があるが、
  // React の onTouchMove は passive なので preventDefault が効かない。そのため touchmove を
  // 非 passive で直接登録する。長押しが成立するまで（isReady=false）は preventDefault せず、
  // ブラウザのスクロールに任せる（マークの上を起点にしたスワイプでもスクロールできる）。
  useEffect(() => {
    function handleTouchMove(e: TouchEvent) {
      const session = answerPaintRef.current
      if (!session || session.pointerType !== 'touch') return

      let touch: Touch | null = null
      for (let i = 0; i < e.touches.length; i += 1) {
        const candidate = e.touches.item(i)
        if (candidate?.identifier === session.pointerId) {
          touch = candidate
          break
        }
      }
      if (!touch) return

      const distance = Math.hypot(touch.clientX - session.startX, touch.clientY - session.startY)
      if (!session.isReady) {
        // 長押し前に動いたらスクロール操作とみなしてペイントを中止し、スクロールはブラウザに任せる
        if (distance > ANSWER_PAINT_MOVE_THRESHOLD) cancelAnswerPaint(session.pointerId)
        return
      }

      // 長押し成立後はこのジェスチャーをペイント専用にするため、毎回 preventDefault する。
      // 最初の touchmove を素通しするとブラウザがジェスチャーを「スクロール」として確定し、
      // 以降の preventDefault が無効（cancelable=false）になり指の移動でページが流れてしまう。
      e.preventDefault()
      updateAnswerPaintAutoScroll(touch.clientX, touch.clientY)

      const target = getAnswerPaintTargetAtPoint(touch.clientX, touch.clientY)
      if (!target) return

      if (!session.didPaint) paintAnswerCandidate(session.startCandidateId, session.value)
      paintAnswerCandidate(target.candidateId, target.value ?? session.value)
    }

    document.addEventListener('touchmove', handleTouchMove, { passive: false })
    return () => {
      document.removeEventListener('touchmove', handleTouchMove)
      stopAnswerPaintAutoScroll()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleAnswerTouchEnd(e: React.TouchEvent<HTMLButtonElement>) {
    const session = answerPaintRef.current
    if (!session || session.pointerType !== 'touch') return
    if (!getTouchById(e.changedTouches, session.pointerId)) return

    finishAnswerPaint(session.pointerId)
  }

  function handleAnswerChange(candidateId: string, value: AnswerValue) {
    commitAnswerChange((current) => {
      const nextAnswers = { ...current.answers }
      const nextDetailNotes = { ...current.detailNotes }

      if (nextAnswers[candidateId] === value) {
        delete nextAnswers[candidateId]
      } else {
        nextAnswers[candidateId] = value
      }

      if (value !== '-') {
        delete nextDetailNotes[candidateId]
      }

      return {
        answers: nextAnswers,
        detailNotes: nextDetailNotes,
        lastSetAllAnswers: null,
      }
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (deletingResponseId) return

    setIsSubmitting(true)
    setError(null)

    try {
      const answerRows = candidates.map((c) => ({
        candidate_id: c.id,
        value: (answers[c.id] ?? '-') as AnswerValue,
        // 個別メモは「-」のときのみ保存、それ以外はnull
        note: answers[c.id] === '-' ? (detailNotes[c.id] || null) : null,
      }))

      if (editingResponseId) {
        // 共通メモを更新
        const { error: updateErr } = await supabase
          .from('responses')
          .update({ note: sharedNote || null })
          .eq('id', editingResponseId)

        if (updateErr) throw updateErr

        const rowsToUpdate = answerRows.filter((a) => editingAnswerIds[a.candidate_id])
        const rowsToInsert = answerRows.filter((a) => !editingAnswerIds[a.candidate_id])

        const updateResults = await Promise.all(
          rowsToUpdate.map((a) =>
            supabase
              .from('answers')
              .update({ value: a.value, note: a.note })
              .eq('id', editingAnswerIds[a.candidate_id])
          )
        )
        const answerUpdateError = updateResults.find((result) => result.error)?.error
        if (answerUpdateError) throw answerUpdateError

        if (rowsToInsert.length > 0) {
          const { error: insError } = await supabase
            .from('answers')
            .insert(rowsToInsert.map((a) => ({ ...a, response_id: editingResponseId })))

          if (insError) throw insError
        }
      } else {
        const { data: response, error: responseError } = await supabase
          .from('responses')
          .insert({ event_id: event.id, name, note: sharedNote || null })
          .select()
          .single()

        if (responseError) throw responseError

        const { error: answersError } = await supabase
          .from('answers')
          .insert(answerRows.map((a) => ({ ...a, response_id: response.id })))

        if (answersError) throw answersError
      }

      setName('')
      setAnswers({})
      setDetailNotes({})
      setEditingAnswerIds({})
      setSharedNote('')
      // editingResponseId はこの後クリアするので、新規か更新かを先に確定させる
      setSubmitSuccess(editingResponseId ? 'updated' : 'created')
      setEditingResponseId(null)
      setLastSetAllAnswers(null)
      resetAnswerHistory()

      await loadResponses()
      setTimeout(() => setSubmitSuccess(null), 3000)
    } catch (err) {
      console.error(err)
      setError('送信中にエラーが発生しました。もう一度試してください。')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen px-4 py-4">
      <div className="mx-auto max-w-2xl">

        {/* サイトヘッダー */}
        <div className="relative mb-2 flex min-h-8 items-center justify-center">
          <Link
            href="/"
            className="group inline-flex items-baseline gap-0.5 border-b border-transparent pb-0.5 font-serif text-2xl text-stone-700 transition-colors hover:border-stone-400 hover:text-stone-900"
          >
            <span>日程組</span>
            <span className="text-sm text-stone-500 transition-colors group-hover:text-stone-700">で作成</span>
          </Link>
          <Link
            href={`/?edit=${shareId}`}
            className="absolute right-0 top-1/2 -translate-y-1/2 text-sm text-stone-400 transition-colors hover:text-rose-700"
          >
            日程を編集
          </Link>
        </div>

        {/* イベントヘッダー */}
        <div className="mb-1">
          <h1 className="font-serif text-3xl text-rose-800">{event.name}</h1>
          {event.description && (
            <p className="mt-1 whitespace-pre-wrap break-words text-stone-600">{event.description}</p>
          )}
          <div id="answer-actions" className="mt-0.5 flex scroll-mt-4 flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleCopyUrl}
              className="inline-flex items-center gap-1.5 rounded-lg bg-white/50 px-2 py-0.5 text-xs text-stone-400 transition-colors hover:bg-rose-50 hover:text-rose-700"
            >
              {copied ? (
                <>✓ コピーしました</>
              ) : (
                <>/e/{shareId} ⧉</>
              )}
            </button>
            <button
              type="button"
              onClick={scrollToResponses}
              className="inline-flex items-center rounded-lg bg-white/50 px-2 py-0.5 text-xs text-stone-400 transition-colors hover:bg-rose-50 hover:text-rose-700"
            >
              ↓ みんなの回答へ
            </button>
          </div>
        </div>

        {/* 回答フォーム */}
        <form
          id="answer-form"
          onSubmit={handleSubmit}
          className="mb-8 scroll-mt-4 rounded-2xl bg-white/70 px-6 py-3 shadow-sm backdrop-blur"
        >
          <div className="mb-1 flex items-center justify-between">
            <h2 className="font-serif text-xl text-stone-700">
              {editingResponseId ? '回答を編集' : '回答する'}
            </h2>
            {editingResponseId && (
              <div className="flex items-center gap-3">
                {editingResponse && (
                  <button
                    type="button"
                    onClick={() => handleDeleteResponse(editingResponse)}
                    disabled={deletingResponseId === editingResponse.id}
                    className="text-sm text-stone-400 transition-colors hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {deletingResponseId === editingResponse.id ? '削除中...' : '削除'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="text-sm text-stone-400 transition-colors hover:text-rose-700"
                >
                  キャンセル
                </button>
              </div>
            )}
          </div>

          {/* 名前 */}
          <div className="mb-3">
            <label className="mb-1 block text-sm font-medium text-stone-700">
              お名前 <span className="text-rose-700">*</span>
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={!!editingResponseId}
              placeholder="例：山田"
              className="w-full max-w-xs rounded-lg border border-stone-200 bg-white px-4 py-2.5 text-stone-800 placeholder-stone-300 focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100 disabled:bg-stone-50 disabled:text-stone-400"
            />
          </div>

          {/* .ics ファイルから日程を読み取り */}
          <div className="mb-2">
            <input
              ref={icsInputRef}
              type="file"
              accept=".ics,.zip"
              className="hidden"
              onChange={handleIcsUpload}
            />
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
              <button
                type="button"
                onClick={() => icsInputRef.current?.click()}
                disabled={icsStatus === 'loading'}
                className="flex items-center gap-2 rounded-full border border-stone-200 px-4 py-2 text-sm text-stone-600 transition-colors hover:border-rose-300 hover:bg-rose-50 hover:text-rose-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {icsStatus === 'loading' ? (
                  <>
                    <span className="animate-spin">⟳</span>
                    解析中...
                  </>
                ) : (
                  <>
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M19 4h-1V2h-2v2H8V2H6v2H5C3.89 4 3 4.9 3 6v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V9h14v11zM5 7V6h14v1H5z"/>
                    </svg>
                    .ics / zip から自動入力
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => setIcsOptionsOpen((v) => !v)}
                aria-expanded={icsOptionsOpen}
                className="rounded-full border border-stone-200 px-3 py-1.5 text-xs text-stone-500 transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
              >
                設定 {icsOptionsOpen ? '▲' : '▼'}
              </button>
            </div>
            {icsOptionsOpen && (
              <div className="mt-2 rounded-xl border border-stone-200 bg-stone-50/70 px-3 py-2.5">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs leading-none text-stone-500">
                  <div className="flex items-center gap-1.5">
                    <span className="shrink-0">予定あり：</span>
                    <div className="flex gap-0.5">
                      {ANSWER_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setIcsBusyValue((current) => current === opt.value ? null : opt.value)}
                          aria-label={icsBusyValue === opt.value ? '予定ありの入力を解除する' : `予定ありを${opt.value}にする`}
                          className={`h-6 w-6 rounded-full border text-[11px] transition-all ${
                            icsBusyValue === opt.value ? opt.active : opt.idle
                          }`}
                        >
                          {opt.value === '-' ? '−' : opt.value}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="shrink-0">予定なし：</span>
                    <div className="flex gap-0.5">
                      {ANSWER_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setIcsFreeValue((current) => current === opt.value ? null : opt.value)}
                          aria-label={icsFreeValue === opt.value ? '予定なしの入力を解除する' : `予定なしを${opt.value}にする`}
                          className={`h-6 w-6 rounded-full border text-[11px] transition-all ${
                            icsFreeValue === opt.value ? opt.active : opt.idle
                          }`}
                        >
                          {opt.value === '-' ? '−' : opt.value}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-stone-400">
                  Googleカレンダーから書き出した .ics / .zip ファイルをアップロードできます。zip内の誕生日カレンダーは自動で除外されます。予定と重なる日程・空いている日程を選んだ記号でまとめて入力できます。ファイルは端末内で処理され、送信・保存されません。
                </p>
              </div>
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
                  <a href="https://calendar.google.com/calendar/u/0/r/settings/export" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-white px-2.5 py-1 font-medium text-rose-700 underline-offset-2 transition-colors hover:bg-rose-50 hover:underline">
                    Google カレンダーを開く <span aria-hidden="true">↗</span>
                  </a>
                  <ol className="mt-1 list-decimal pl-4 space-y-0.5 text-stone-500">
                    <li>開いたページで「エクスポート」をクリック</li>
                    <li>ZIP がダウンロードされる</li>
                    <li>その ZIP をそのままアップロード（誕生日カレンダーは自動で除外）</li>
                  </ol>
                </div>
                <div>
                  <a href="https://www.icloud.com/calendar" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-white px-2.5 py-1 font-medium text-rose-700 underline-offset-2 transition-colors hover:bg-rose-50 hover:underline">
                    Apple カレンダー（iCloud）を開く <span aria-hidden="true">↗</span>
                  </a>
                  <ol className="mt-1 list-decimal pl-4 space-y-0.5 text-stone-500">
                    <li>PC ブラウザで開く</li>
                    <li>カレンダー名の横の共有マークから書き出し</li>
                    <li>その .ics をアップロード</li>
                  </ol>
                </div>
                <div>
                  <a href="https://outlook.live.com/calendar" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-white px-2.5 py-1 font-medium text-rose-700 underline-offset-2 transition-colors hover:bg-rose-50 hover:underline">
                    Outlook カレンダーを開く <span aria-hidden="true">↗</span>
                  </a>
                  <ol className="mt-1 list-decimal pl-4 space-y-0.5 text-stone-500">
                    <li>設定 → 共有カレンダー → 書き出し</li>
                    <li>その .ics をアップロード</li>
                  </ol>
                </div>
              </div>
            )}
            {icsStatus === 'done' && (
              <p className="mt-2 rounded-lg bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
                ✓ {icsMessage}
              </p>
            )}
            {icsStatus === 'error' && (
              <p className="mt-2 rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-700">
                {icsMessage}
              </p>
            )}
          </div>

          {/* 一括回答ボタン群 */}
          <div className="mb-2">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={toggleBulkOpen}
                className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                  bulkOpen
                    ? 'border-rose-400 bg-rose-50 text-rose-800'
                    : 'border-stone-200 text-stone-500 hover:border-rose-200 hover:text-rose-700'
                }`}
              >
                📋 範囲で一括回答
              </button>
              <div className="flex items-center gap-1">
                <span className="text-xs text-stone-400">全部これに揃える：</span>
                {ANSWER_OPTIONS.map((opt) => {
                  const isActive = keepExistingAnswers
                    ? lastSetAllAnswers?.value === opt.value &&
                      lastSetAllAnswers.candidateIds.some((id) => answers[id] === opt.value)
                    : candidates.length > 0 && candidates.every((c) => answers[c.id] === opt.value)

                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => handleSetAllAnswers(opt.value)}
                      className={`h-8 w-8 rounded-full border-2 text-sm transition-all hover:scale-110 ${
                        isActive ? opt.active : opt.idle
                      }`}
                    >
                      {opt.value === '-' ? '−' : opt.value}
                    </button>
                    )
                  })}
              </div>
              <label className="flex items-center gap-1.5 text-xs text-stone-400">
                <input
                  type="checkbox"
                  checked={keepExistingAnswers}
                  onChange={(e) => {
                    setKeepExistingAnswers(e.target.checked)
                    setLastSetAllAnswers(null)
                  }}
                  className="h-3.5 w-3.5 rounded border-stone-300 text-rose-800 focus:ring-rose-200"
                />
                入力済の行は変更しない
              </label>
              <div className="ml-auto flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={undoAnswerChange}
                  disabled={answerPast.length === 0}
                  className="rounded-full border border-stone-300 px-3 py-1.5 text-xs text-stone-600 transition-colors hover:border-rose-300 hover:bg-rose-50 hover:text-rose-800 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  ↶ 戻す
                </button>
                <button
                  type="button"
                  onClick={redoAnswerChange}
                  disabled={answerFuture.length === 0}
                  className="rounded-full border border-stone-300 px-3 py-1.5 text-xs text-stone-600 transition-colors hover:border-rose-300 hover:bg-rose-50 hover:text-rose-800 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  ↷ 進む
                </button>
              </div>
            </div>

            {bulkOpen && (
              <div className="mt-3 rounded-xl border border-stone-200 bg-stone-50 px-4 py-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-xs font-medium text-stone-500">日程範囲と回答を選択して「適用」</p>
                  <button
                    type="button"
                    onClick={() => setBulkOpen(false)}
                    className="text-xs text-stone-400 hover:text-stone-600"
                  >
                    閉じる
                  </button>
                </div>
                {/* 日付範囲 */}
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <input
                    type="date"
                    value={bulkStart}
                    onChange={(e) => setBulkStart(e.target.value)}
                    className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-800 focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100"
                  />
                  <span className="text-stone-400">〜</span>
                  <input
                    type="date"
                    value={bulkEnd}
                    min={bulkStart}
                    onChange={(e) => setBulkEnd(e.target.value)}
                    className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-800 focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100"
                  />
                </div>
                {/* 曜日フィルター：選ぶと下の2つの「適用」がその曜日だけに絞られる */}
                <div className="mb-3 flex flex-wrap items-center gap-1.5">
                  <span className="text-xs text-stone-400">曜日で絞る（任意）：</span>
                  {DAYS.map((label, i) => {
                    const hasCandidateOnWeekday = candidates.some(
                      (c) => new Date(c.date + 'T00:00:00').getDay() === i
                    )
                    const isSelected = bulkWeekdays.has(i)
                    return (
                      <button
                        key={label}
                        type="button"
                        onClick={() => toggleBulkWeekday(i)}
                        disabled={!hasCandidateOnWeekday}
                        className={`flex h-7 w-7 items-center justify-center rounded-full border text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${
                          isSelected
                            ? 'border-rose-400 bg-rose-700 font-bold text-white'
                            : i === 0
                            ? 'border-stone-200 text-rose-400 hover:border-rose-200 hover:bg-rose-50'
                            : i === 6
                            ? 'border-stone-200 text-blue-400 hover:border-blue-200 hover:bg-blue-50'
                            : 'border-stone-200 text-stone-500 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700'
                        }`}
                      >
                        {label}
                      </button>
                    )
                  })}
                  {bulkWeekdays.size > 0 && (
                    <button
                      type="button"
                      onClick={() => setBulkWeekdays(new Set())}
                      className="text-xs text-stone-400 underline hover:text-stone-600"
                    >
                      解除
                    </button>
                  )}
                </div>
                {/* 回答選択 */}
                <div className="mb-3 flex gap-2">
                  {ANSWER_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setBulkValue(opt.value)}
                      className={`h-10 w-10 rounded-full border-2 text-base transition-all ${
                        bulkValue === opt.value ? opt.active : opt.idle
                      }`}
                    >
                      {opt.value === '-' ? '−' : opt.value}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={applyBulkAnswer}
                  disabled={!bulkStart || !bulkEnd || bulkStart > bulkEnd}
                  className="rounded-full bg-rose-800 px-4 py-2 text-sm text-white transition-colors hover:bg-rose-900 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  適用
                </button>
                <div className="mt-4 border-t border-stone-200 pt-3">
                  <p className="mb-2 text-xs font-medium text-stone-500">
                    日付範囲 + 時間帯で一括回答
                  </p>
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <input
                      type="time"
                      value={bulkTimeStart}
                      onChange={(e) => setBulkTimeStart(e.target.value)}
                      className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-800 focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100"
                    />
                    <span className="text-stone-400">〜</span>
                    <input
                      type="time"
                      value={bulkTimeEnd}
                      onChange={(e) => setBulkTimeEnd(e.target.value)}
                      className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-800 focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100"
                    />
                  </div>
                  <div className="mb-3 flex items-center gap-2">
                    <span className="text-xs text-stone-400">重なる候補を：</span>
                    {ANSWER_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setBulkTimeValue(opt.value)}
                        className={`h-8 w-8 rounded-full border-2 text-sm transition-all ${
                          bulkTimeValue === opt.value ? opt.active : opt.idle
                        }`}
                      >
                        {opt.value === '-' ? '−' : opt.value}
                      </button>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={applyBulkTimeAnswer}
                      disabled={
                        !bulkStart ||
                        !bulkEnd ||
                        bulkStart > bulkEnd ||
                        !bulkTimeStart ||
                        !bulkTimeEnd ||
                        bulkTimeStart === bulkTimeEnd
                      }
                      className="rounded-full bg-rose-800 px-4 py-2 text-sm text-white transition-colors hover:bg-rose-900 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      適用
                    </button>
                    <span className="text-xs text-stone-400">
                      上の日付範囲・曜日の中で、少しでも時間が重なる候補を変更します
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 候補日ごとの回答 */}
          <div className="mb-6 space-y-0.5">
            <div className="mb-1 text-sm font-medium text-stone-700">
              各日程への出欠 <span className="text-rose-700">*</span>
            </div>
            {candidates.map((c) => (
              <div key={c.id} data-answer-row-id={c.id}>
                <div className="flex flex-wrap items-center gap-2 py-0">
                  <div className="w-max min-w-[9rem] shrink-0 whitespace-nowrap">
                    <span className="font-serif text-sm text-stone-700">{formatDate(c.date)}</span>
                    {c.time_label && (
                      <span className="ml-1 text-xs text-stone-400 whitespace-nowrap">{c.time_label}</span>
                    )}
                  </div>
                  <div className="flex gap-1.5">
                    {ANSWER_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        data-answer-candidate-id={c.id}
                        data-answer-value={opt.value}
                        onPointerDown={(e) => handleAnswerPaintStart(e, c.id, opt.value)}
                        onPointerMove={handleAnswerPaintMove}
                        onPointerUp={handleAnswerPaintEnd}
                        onPointerCancel={handleAnswerPaintEnd}
                        onTouchStart={(e) => handleAnswerTouchStart(e, c.id, opt.value)}
                        onTouchEnd={handleAnswerTouchEnd}
                        onTouchCancel={handleAnswerTouchEnd}
                        onClick={() => {
                          if (suppressNextAnswerClickRef.current) {
                            suppressNextAnswerClickRef.current = false
                            return
                          }
                          handleAnswerChange(c.id, opt.value)
                        }}
                        className={`h-8 w-8 select-none rounded-full border-2 text-sm transition-all ${
                          answers[c.id] === opt.value ? opt.active : opt.idle
                        }`}
                      >
                        {opt.value === '-' ? '−' : opt.value}
                      </button>
                    ))}
                  </div>
                </div>
                {/* 個別メモ：「-」選択時のみ表示 */}
                {answers[c.id] === '-' && (
                  <div className="mt-1 sm:ml-[9.5rem]">
                    <input
                      type="text"
                      value={detailNotes[c.id] ?? ''}
                      onChange={(e) =>
                        setDetailNotes((prev) => ({ ...prev, [c.id]: e.target.value }))
                      }
                      placeholder="この日の状況を記入（任意）"
                      className="w-full rounded-lg border border-blue-100 bg-blue-50/50 px-4 py-2 text-sm text-stone-700 placeholder-stone-300 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100"
                    />
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* 共通メモ：常時表示 */}
          <div className="mb-8">
            <input
              type="text"
              value={sharedNote}
              onChange={(e) => setSharedNote(e.target.value)}
              placeholder="全体へのメモ（任意）"
              className="w-full rounded-lg border border-stone-200 bg-white px-4 py-2 text-sm text-stone-700 placeholder-stone-300 focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100"
            />
          </div>

          <div id="answer-submit-area">
            {/* エラー・成功メッセージ */}
            {error && (
              <p className="mb-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">
                {error}
              </p>
            )}
            {submitSuccess && (
              <p className="mb-4 rounded-lg bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
                {submitSuccess === 'updated' ? '回答を更新しました！' : '回答を送信しました！ありがとうございます。'}
              </p>
            )}

            <button
              type="submit"
              disabled={isSubmitting || Boolean(deletingResponseId)}
              className="w-full rounded-full bg-rose-800 py-3 text-base font-medium text-white shadow transition-all hover:bg-rose-900 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? '送信中...' : editingResponseId ? '回答を更新' : '回答を送信'}
            </button>
          </div>
        </form>

        {/* 集計テーブル */}
        <div id="responses-section" className="scroll-mt-4 rounded-2xl bg-white/70 px-6 py-6 shadow-sm backdrop-blur">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-serif text-xl text-stone-700">みんなの回答</h2>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={scrollToAnswerForm}
                className="rounded-full border border-stone-200 px-3 py-1.5 text-xs text-stone-400 transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
              >
                ↑ 回答へ
              </button>
              {hasResponses && (
                <div className="flex overflow-hidden rounded-full border border-stone-200">
                  <button
                    type="button"
                    onClick={() => setTableLayout('h')}
                    title="横向き表示"
                    className={`px-3 py-1.5 text-xs transition-colors ${
                      tableLayout === 'h'
                        ? 'bg-rose-800 text-white'
                        : 'text-stone-400 hover:bg-stone-50'
                    }`}
                  >
                    ╠═╣ 横
                  </button>
                  <button
                    type="button"
                    onClick={() => setTableLayout('v')}
                    title="縦向き表示"
                    className={`border-l border-stone-200 px-3 py-1.5 text-xs transition-colors ${
                      tableLayout === 'v'
                        ? 'bg-rose-800 text-white'
                        : 'text-stone-400 hover:bg-stone-50'
                    }`}
                  >
                    縦 ╦
                  </button>
                </div>
              )}
            </div>
          </div>

          {responsesError && (
            <p className="mb-3 rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-700">
              {responsesError}
            </p>
          )}

          {isLoadingResponses && !hasResponses ? (
            <p className="text-sm text-stone-400">回答一覧を読み込み中...</p>
          ) : !hasResponses ? (
            <p className="text-sm text-stone-400">まだ回答がありません。</p>
          ) : tableLayout === 'h' ? (

            /* ── 横向きテーブル：行=回答者、列=候補日 ── */
            <div className="overflow-x-auto">
              <table className="w-full text-center text-sm">
                <thead>
                  <tr>
                    <th className="w-28 pb-3 text-left text-xs font-normal text-stone-400">名前</th>
                    {candidates.map((c) => (
                      <th
                        key={c.id}
                        className="pb-3 font-normal text-stone-500 whitespace-nowrap"
                      >
                        <div className="font-serif text-sm">{formatDate(c.date)}</div>
                        {c.time_label && (
                          <div className="text-xs text-stone-400 whitespace-nowrap">{c.time_label}</div>
                        )}
                      </th>
                    ))}
                    <th className="pb-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {responseRows.map((r) => (
                    <tr key={r.id} className="border-t border-stone-100">
                      <td className="py-2 text-left text-stone-700">
                        <div>{r.name}</div>
                        {r.note && (
                          <div className="text-xs text-stone-400">（{r.note}）</div>
                        )}
                      </td>
                      {candidates.map((c) => {
                        const answer = answerByResponseAndCandidate.get(`${r.id}:${c.id}`)
                        return (
                          <td
                            key={c.id}
                            className="py-2"
                          >
                            <span className={answerColor(answer?.value)}>
                              {answer?.value ?? '−'}
                            </span>
                            {answer?.value === '-' && answer.note && (
                              <p className="mt-0.5 text-xs text-stone-400">（{answer.note}）</p>
                            )}
                          </td>
                        )
                      })}
                      <td className="py-2">
                        <button
                          type="button"
                          onClick={() => handleEdit(r)}
                          className="text-xs text-stone-300 transition-colors hover:text-rose-700"
                        >
                          編集
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

          ) : (

            /* ── 縦向きテーブル：行=候補日、列=回答者 ── */
            <div className="overflow-x-auto">
              <table className="w-full text-center text-sm">
                <thead>
                  <tr>
                    <th className="pb-3 text-left text-xs font-normal text-stone-400">候補日</th>
                    {responseRows.map((r) => (
                      <th key={r.id} className="pb-3 font-normal text-stone-500">
                        <div>{r.name}</div>
                        {r.note && (
                          <div className="text-xs font-normal text-stone-400">（{r.note}）</div>
                        )}
                        <button
                          type="button"
                          onClick={() => handleEdit(r)}
                          className="text-xs font-normal text-stone-300 transition-colors hover:text-rose-700"
                        >
                          編集
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {candidates.map((c) => (
                    <tr key={c.id} className="border-t border-stone-100">
                      <td className="py-2 text-left whitespace-nowrap">
                        <span className="font-serif text-stone-700">
                          {formatDate(c.date)}
                        </span>
                        {c.time_label && (
                          <span className="ml-1 text-xs text-stone-400 whitespace-nowrap">{c.time_label}</span>
                        )}
                      </td>
                      {responseRows.map((r) => {
                        const answer = answerByResponseAndCandidate.get(`${r.id}:${c.id}`)
                        return (
                          <td key={r.id} className="py-2">
                            <span className={answerColor(answer?.value)}>
                              {answer?.value ?? '−'}
                            </span>
                            {answer?.value === '-' && answer.note && (
                              <p className="mt-0.5 text-xs text-stone-400">（{answer.note}）</p>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

          )}
        </div>

      </div>
    </div>
  )
}
