'use client'

import { useCallback, useEffect, useEffectEvent, useLayoutEffect, useMemo, useState, useRef, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { useI18n } from '@/app/LocaleProvider'
import { LanguageSwitch } from '@/app/LanguageSwitch'
import { ServiceShareLink } from '@/app/ServiceShareLink'
import { eventClient } from '@/lib/supabase'
import { newEditToken, readEditToken, storeEditToken, consumeEditKey } from '@/lib/edit-keys'
import { useLanguageDraft } from '@/app/useLanguageDraft'
import { calendarBusyPeriods, overlapsCalendar, type BusyPeriod } from '@/lib/calendar'
import { siteShortName } from '@/lib/site'
import { recordHistory } from '@/lib/history'
import { answerValuesFor } from '@/lib/answer-choices'
import { describeCalendarFileError, describeCalendarFileRead, readCalendarFileTexts } from '@/lib/calendar-files'
import type { Event, Candidate, Answer, AnswerValue } from '@/lib/database.types'

// ---- 型定義 ----
type ResponseWithAnswers = {
  id: string
  event_id: string
  name: string
  note: string | null
  created_at: string
  edit_protected: boolean
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
    value: '◎' as AnswerValue,
    idle: 'border-stone-300 text-stone-500 hover:border-teal-400 hover:text-teal-500',
    active: 'answer-mark-strong border-teal-600 bg-teal-100 text-teal-700 font-bold',
  },
  {
    value: '○' as AnswerValue,
    idle: 'border-stone-300 text-stone-500 hover:border-emerald-300 hover:text-emerald-400',
    active: 'border-emerald-500 bg-emerald-50 text-emerald-700 font-bold',
  },
  {
    value: '△' as AnswerValue,
    idle: 'border-stone-300 text-stone-500 hover:border-amber-300 hover:text-amber-500',
    active: 'border-amber-400 bg-amber-50 text-amber-700 font-bold',
  },
  {
    value: '✕' as AnswerValue,
    idle: 'border-stone-300 text-stone-500 hover:border-stone-400 hover:text-stone-600',
    active: 'border-stone-400 bg-stone-100 text-stone-700 font-bold',
  },
  {
    value: '-' as AnswerValue,
    idle: 'border-stone-300 text-stone-500 hover:border-blue-300 hover:text-blue-400',
    active: 'border-blue-300 bg-blue-50 text-blue-600 font-bold',
  },
]

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

const emptySubscribe = () => () => {}

// 「みんなの回答」の表示設定。端末内に覚えておく
type TablePrefs = { counts: boolean; sticky: boolean; layout: 'h' | 'v'; notes: 'name' | 'bottom' }
const TABLE_PREFS_KEY = 'nittei-table-prefs'
const DEFAULT_TABLE_PREFS: TablePrefs = { counts: true, sticky: true, layout: 'v', notes: 'name' }

function readTablePrefs(): TablePrefs | null {
  try {
    const raw = window.localStorage.getItem(TABLE_PREFS_KEY)
    if (!raw) return null
    const parsed: Record<string, unknown> = JSON.parse(raw)
    return {
      counts: typeof parsed.counts === 'boolean' ? parsed.counts : DEFAULT_TABLE_PREFS.counts,
      sticky: typeof parsed.sticky === 'boolean' ? parsed.sticky : DEFAULT_TABLE_PREFS.sticky,
      layout: parsed.layout === 'h' || parsed.layout === 'v' ? parsed.layout : DEFAULT_TABLE_PREFS.layout,
      notes: parsed.notes === 'name' || parsed.notes === 'bottom' ? parsed.notes : DEFAULT_TABLE_PREFS.notes,
    }
  } catch {
    // localStorage が使えない環境では既定値のまま
    return null
  }
}

function writeTablePrefs(prefs: TablePrefs) {
  try {
    window.localStorage.setItem(TABLE_PREFS_KEY, JSON.stringify(prefs))
  } catch {
    // 保存できなくても表示には影響しない
  }
}

function readLocalUpdatedAt(shareId: string) {
  try {
    return window.localStorage.getItem(`nittei-updated-${shareId}`)
  } catch {
    // プライベートモードなどで localStorage が使えないときは表示しないだけ
    return null
  }
}

function answerColor(v: AnswerValue | undefined) {
  if (v === '◎') return 'answer-mark-strong text-teal-700 font-bold'
  if (v === '○') return 'text-emerald-700 font-bold'
  if (v === '△') return 'text-amber-700 font-bold'
  if (v === '✕') return 'text-stone-600'
  if (v === '-') return 'text-blue-600'
  return 'text-stone-500'
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
  const { locale, t, path, formatDate, formatDateTime, weekdays: DAYS } = useI18n()
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
  const [tablePrefsOverride, setTablePrefsOverride] = useState<TablePrefs | null>(null)
  // 見出し列（名前・候補日）を横スクロール時に固定するか
  // 「今の時刻」「端末の記録」はビルド時のHTMLとズレるため、マウント後に描画する
  const infoMounted = useSyncExternalStore(emptySubscribe, () => true, () => false)
  // 表示設定は端末に覚えさせる。サーバーでは読めないのでマウント後に反映する
  const tablePrefs =
    tablePrefsOverride ?? (infoMounted ? readTablePrefs() : null) ?? DEFAULT_TABLE_PREFS
  const { counts: showAnswerCounts, sticky: stickyHeadColumn, layout: tableLayout, notes: notePosition } = tablePrefs
  const updateTablePrefs = (patch: Partial<TablePrefs>) => {
    const next = { ...tablePrefs, ...patch }
    setTablePrefsOverride(next)
    writeTablePrefs(next)
  }
  const resultsTableRef = useRef<HTMLTableElement>(null)
  useLayoutEffect(() => {
    const labels = Array.from(resultsTableRef.current?.querySelectorAll<HTMLElement>('.response-name') ?? [])
    labels.forEach(element => { element.style.width = '' })
    // Measure centered lines before resizing any columns, avoiding repeated table layout.
    const widths = labels.map(element => {
      const range = document.createRange()
      range.selectNodeContents(element)
      return Math.ceil(range.getBoundingClientRect().width)
    })
    labels.forEach((element, index) => { element.style.width = `${widths[index]}px` })
  }, [responseRows, tableLayout])
  // 送信直後にその場で反映するための上書き値
  const [localUpdatedOverride, setLocalUpdatedOverride] = useState<string | null>(null)
  const [showPeerAnswers, setShowPeerAnswers] = useState(true)
  const [editingResponseId, setEditingResponseId] = useState<string | null>(null)
  const [pendingIdentity, setPendingIdentity] = useState<{id: string; token: string} | null>(null)
  const [keysReady, setKeysReady] = useState(false)
  const [requestedResponseId, setRequestedResponseId] = useState<string | null>(null)
  const [deletingResponseId, setDeletingResponseId] = useState<string | null>(null)

  // 範囲で一括回答
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkStart, setBulkStart] = useState('')
  const [bulkEnd, setBulkEnd] = useState('')
  const [bulkValue, setBulkValue] = useState<AnswerValue>('○')
  const [bulkTimeStart, setBulkTimeStart] = useState('')
  const [bulkTimeEnd, setBulkTimeEnd] = useState('')
  const [bulkTimeValue, setBulkTimeValue] = useState<AnswerValue>('✕')
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

  const loadEditKey = useEffectEvent(() => {
    const responseId = new URLSearchParams(window.location.search).get('response')
    if (responseId) consumeEditKey('response', responseId)
    setRequestedResponseId(responseId)
    setKeysReady(true)
  })
  // Private fragments are available only in the browser, never during SSR.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => loadEditKey(), [])

  const canEditEvent = !event.edit_protected || (keysReady && Boolean(readEditToken('event', shareId)))
  function canEditResponse(response: ResponseWithAnswers) {
    return !response.edit_protected || canEditEvent || (keysReady && Boolean(readEditToken('response', response.id)))
  }

  async function handleCopyEditUrl(kind: 'event' | 'response', id: string) {
    const token = readEditToken(kind, id)
    if (!token) return
    const route = kind === 'event' ? `/?edit=${shareId}` : `/e/${shareId}?response=${id}`
    const url = `${window.location.origin}${path(route)}#key=${token}`
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { window.prompt(t("このURLをコピーしてください"), url) }
  }

  useLanguageDraft(keysReady ? `response-${shareId}` : null, {
    name, sharedNote, answers, detailNotes, editingResponseId, pendingIdentity,
    lastSetAllAnswers, answerPast, answerFuture, keepExistingAnswers, showPeerAnswers,
  }, draft => {
    setName(draft.name)
    setSharedNote(draft.sharedNote)
    setAnswers(draft.answers)
    setDetailNotes(draft.detailNotes)
    setEditingResponseId(draft.editingResponseId)
    setPendingIdentity(draft.pendingIdentity)
    setLastSetAllAnswers(draft.lastSetAllAnswers)
    setAnswerPast(draft.answerPast)
    setAnswerFuture(draft.answerFuture)
    setKeepExistingAnswers(draft.keepExistingAnswers)
    setShowPeerAnswers(draft.showPeerAnswers)
  })

  async function handleCopyUrl() {
    const url = `${window.location.origin}${path(`/e/${shareId}`)}`
    try {
      if (!navigator.clipboard) throw new Error('clipboard unavailable')
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // 非HTTPSやWebViewなどクリップボードが使えない環境では手動コピー用に提示する
      window.prompt(t("このURLをコピーしてください"), url)
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
  const [isIcsDragOver, setIsIcsDragOver] = useState(false)
  const [icsMessage, setIcsMessage] = useState('')
  const [icsOptionsOpen, setIcsOptionsOpen] = useState(false)
  const [icsGuideOpen, setIcsGuideOpen] = useState(false)
  const [icsBusyValue, setIcsBusyValue] = useState<AnswerValue | null>('✕')
  const [icsFreeValue, setIcsFreeValue] = useState<AnswerValue | null>('○')
  const loadResponses = useCallback(async () => {
    setIsLoadingResponses(true)
    setResponsesError(null)

    try {
      const { data, error } = await eventClient(shareId)
        .from('responses')
        .select('id, event_id, name, note, created_at, edit_protected, answers(id, response_id, candidate_id, value, note)')
        .eq('event_id', event.id)
        .order('created_at')

      if (error) throw error

      setResponseRows((data ?? []) as ResponseWithAnswers[])
    } catch (err) {
      console.error(err)
      setResponsesError(t("回答一覧の読み込みに失敗しました。再読み込みしてください。"))
    } finally {
      setIsLoadingResponses(false)
    }
  }, [event.id, shareId, t])

  // 開いたイベントを端末内の「ページ表示履歴」に記録する（サーバーには送らない）
  useEffect(() => {
    recordHistory(shareId, event.name)
  }, [shareId, event.name])

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
  // 見出し列の固定クラス。OFF のときは普通のセルとして流す
  const stickyHeadClass = (z: string) =>
    stickyHeadColumn ? `response-sticky-cell sticky left-0 ${z} ` : ''

  const answerCountsByCandidate = useMemo(() => {
    const counts = new Map<string, Partial<Record<AnswerValue, number>>>()
    const allowed = answerValuesFor(event.answer_choices)

    for (const candidate of candidates) {
      counts.set(candidate.id, Object.fromEntries(allowed.map((v) => [v, 0])))
    }

    for (const response of responseRows) {
      for (const answer of response.answers) {
        const candidateCounts = counts.get(answer.candidate_id)
        if (candidateCounts) candidateCounts[answer.value] = (candidateCounts[answer.value] ?? 0) + 1
      }
    }

    return counts
  }, [candidates, responseRows, event.answer_choices])
  const bestCandidateIds = useMemo(() => {
    let max = 0
    const best = new Set<string>()
    for (const [id, counts] of answerCountsByCandidate) {
      const available = (counts['◎'] ?? 0) + (counts['○'] ?? 0)
      if (available > max) {
        max = available
        best.clear()
      }
      if (available > 0 && available === max) best.add(id)
    }
    return best
  }, [answerCountsByCandidate])
  const editingResponse = editingResponseId
    ? responseRows.find((response) => response.id === editingResponseId) ?? null
    : null
  const hasResponses = responseRows.length > 0
  const responsesWithNotes = useMemo(() => responseRows.filter(response => response.note?.trim()), [responseRows])
  // このイベントで使える選択肢（主催者が作成時に選んだセット）
  const answerOptions = useMemo(() => {
    const allowed = answerValuesFor(event.answer_choices)
    return ANSWER_OPTIONS.filter((opt) => allowed.includes(opt.value))
  }, [event.answer_choices])
  const countOptions = useMemo(() => {
    const values = new Set(answerValuesFor(event.answer_choices))
    for (const response of responseRows) for (const answer of response.answers) values.add(answer.value)
    return ANSWER_OPTIONS.filter(option => values.has(option.value))
  }, [event.answer_choices, responseRows])
  const viewedAt = useMemo(() => (infoMounted ? new Date() : null), [infoMounted])
  const localUpdatedAt =
    localUpdatedOverride ?? (infoMounted ? readLocalUpdatedAt(shareId) : null)
  // 最終更新は「イベントの更新」と「いちばん新しい回答の投稿」の遅いほうを採る
  const lastUpdatedAt = useMemo(() => {
    let latest = new Date(event.updated_at).getTime()
    for (const response of responseRows) {
      const t = new Date(response.created_at).getTime()
      if (!Number.isNaN(t) && t > latest) latest = t
    }
    return Number.isNaN(latest) ? null : new Date(latest)
  }, [event.updated_at, responseRows])
  const peerResponses = useMemo(
    () => responseRows.filter((response) => response.id !== editingResponseId),
    [responseRows, editingResponseId]
  )
  const hasVisiblePeerAnswers = showPeerAnswers && peerResponses.length > 0
  const answerScrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    answerScrollRef.current?.scrollTo({ left: 0, behavior: 'auto' })
  }, [showPeerAnswers, editingResponseId])

  const openResponseEditLink = useEffectEvent(() => {
    if (!requestedResponseId || !responseRows.length) return
    const response = responseRows.find(r => r.id === requestedResponseId)
    if (!response) return
    setRequestedResponseId(null)
    if (!canEditResponse(response)) { setError(t("編集用URLから開いてください。")); return }
    handleEdit(response)
    const url = new URL(window.location.href)
    url.searchParams.delete('response')
    window.history.replaceState(null, '', url)
  })
  // Consume a recovery link once, after its response has loaded.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => openResponseEditLink(), [requestedResponseId, responseRows])

  function handleEdit(r: ResponseWithAnswers) {
    if (!canEditResponse(r)) return
    setName(r.name)
    const newAnswers: Record<string, AnswerValue> = {}
    const newDetailNotes: Record<string, string> = {}
    for (const a of r.answers) {
      newAnswers[a.candidate_id] = a.value
      if (a.note) newDetailNotes[a.candidate_id] = a.note
    }
    setAnswers(newAnswers)
    setDetailNotes(newDetailNotes)
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
    setSharedNote('')
    setEditingResponseId(null)
    setLastSetAllAnswers(null)
    resetAnswerHistory()
    setError(null)
  }

  async function handleDeleteResponse(r: ResponseWithAnswers) {
    const ok = window.confirm(t("{0} さんの回答を削除します。", r.name))
    if (!ok) return

    setDeletingResponseId(r.id)
    setError(null)

    try {
      const { error: deleteError } = await eventClient(shareId).rpc('nittei_delete_response', {
        p_id: r.id,
        p_edit_token: readEditToken('response', r.id),
      })
      if (deleteError) throw deleteError

      if (editingResponseId === r.id) {
        handleCancelEdit()
      }

      setResponseRows((prev) => prev.filter((response) => response.id !== r.id))
    } catch (err) {
      console.error(err)
      setError(t("回答の削除に失敗しました。もう一度試してください。"))
    } finally {
      setDeletingResponseId(null)
    }
  }

  // ---- .ics ファイルから日程を読み取り ----
  const icsInputRef = useRef<HTMLInputElement>(null)

  function applyBusyPeriodsToAnswers(busyPeriods: BusyPeriod[], doneMessage: string) {
    const newAnswers: Record<string, AnswerValue | null> = {}
    for (const c of candidates) {
      const isBusy = overlapsCalendar({ date: c.date, timeLabel: c.time_label }, busyPeriods)

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

  function handleIcsUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    void processIcsFile(file)
  }

  // ファイルをフォームに落としても読み込めるようにする
  function handleIcsDragOver(e: React.DragEvent) {
    if (!e.dataTransfer.types.includes('Files')) return
    e.preventDefault()
    setIsIcsDragOver(true)
  }

  function handleIcsDragLeave(e: React.DragEvent) {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
    setIsIcsDragOver(false)
  }

  function handleIcsDrop(e: React.DragEvent) {
    if (!e.dataTransfer.types.includes('Files')) return
    e.preventDefault()
    setIsIcsDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) void processIcsFile(file)
  }

  async function processIcsFile(file: File) {
    if (candidates.length === 0) {
      setIcsStatus('error')
      setIcsMessage(t("候補日がないため自動入力できません。"))
      return
    }

    setIcsStatus('loading')
    setIcsMessage('')

    try {
      const calendarFiles = await readCalendarFileTexts(file)
      const busyPeriods = await calendarBusyPeriods(calendarFiles, candidates.map(c => ({ date: c.date, timeLabel: c.time_label })))

      applyBusyPeriodsToAnswers(
        busyPeriods,
        t("{0} 内容を確認してから送信してください。", describeCalendarFileRead(calendarFiles, locale))
      )
    } catch (err) {
      setIcsStatus('error')
      setIcsMessage(
        describeCalendarFileError(err, locale) ??
          t("読み取りに失敗しました。.ics または .zip ファイルか確認して、手動で入力してください。")
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
    const targets = candidates.filter(
      (c) => c.date >= bulkStart && c.date <= bulkEnd && matchesBulkWeekdays(c.date)
    )
    commitAnswerChange((current) => {
      const updates: Record<string, AnswerValue> = {}
      for (const c of targets) {
        // 「入力済の行は変更しない」がONなら、まだ回答していない候補日だけ書き換える
        if (keepExistingAnswers && current.answers[c.id] !== undefined) continue
        updates[c.id] = bulkValue
      }

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

    const targets = candidates.filter((c) => {
      if (c.date < bulkStart || c.date > bulkEnd) return false
      if (!matchesBulkWeekdays(c.date)) return false

      const candidateRange = parseCandidateClockRange(c.time_label)
      return Boolean(candidateRange && clockRangesOverlap(candidateRange, rangeStart, rangeEnd))
    })

    if (targets.length === 0) return

    commitAnswerChange((current) => {
      const updates: Record<string, AnswerValue> = {}
      for (const c of targets) {
        // 「入力済の行は変更しない」がONなら、まだ回答していない候補日だけ書き換える
        if (keepExistingAnswers && current.answers[c.id] !== undefined) continue
        updates[c.id] = bulkTimeValue
      }

      const nextDetailNotes = { ...current.detailNotes }
      if (bulkTimeValue !== '-') {
        for (const id of Object.keys(updates)) delete nextDetailNotes[id]
      }

      return {
        answers: { ...current.answers, ...updates },
        detailNotes: nextDetailNotes,
        lastSetAllAnswers: null,
      }
    })
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
    return answerOptions.find((opt) => opt.value === value)?.value ?? null
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

    // 画面の端に来たら自動スクロール（タッチだけでなくマウスのドラッグでも効かせる）
    updateAnswerPaintAutoScroll(e.clientX, e.clientY)

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
    if (deletingResponseId || isSubmitting) return

    setIsSubmitting(true)
    setError(null)

    try {
      const answerRows = candidates.map((c) => ({
        candidate_id: c.id,
        value: (answers[c.id] ?? '-') as AnswerValue,
        // 個別メモは「-」のときのみ保存、それ以外はnull
        note: answers[c.id] === '-' ? (detailNotes[c.id] || null) : null,
      }))

      const identity = pendingIdentity ?? { id: crypto.randomUUID(), token: newEditToken() }
      if (!editingResponseId) {
        setPendingIdentity(identity)
        storeEditToken('response', identity.id, identity.token)
      }
      const { error: saveError } = await eventClient(shareId).rpc('nittei_save_response', {
        p_id: editingResponseId ?? identity.id,
        p_edit_token: editingResponseId ? readEditToken('response', editingResponseId) : identity.token,
        p_name: name.trim(),
        p_note: sharedNote || null,
        p_answers: answerRows,
      })
      if (saveError) throw saveError
      setPendingIdentity(null)

      setName('')
      setAnswers({})
      setDetailNotes({})
      setSharedNote('')
      // editingResponseId はこの後クリアするので、新規か更新かを先に確定させる
      setSubmitSuccess(editingResponseId ? 'updated' : 'created')
      const updatedNow = new Date().toISOString()
      setLocalUpdatedOverride(updatedNow)
      try {
        window.localStorage.setItem(`nittei-updated-${shareId}`, updatedNow)
      } catch {
        // 保存できなくても回答自体には影響しない
      }
      setEditingResponseId(null)
      setLastSetAllAnswers(null)
      resetAnswerHistory()

      await loadResponses()
      setTimeout(() => setSubmitSuccess(null), 3000)
    } catch (err) {
      console.error(err)
      const message = err && typeof err === 'object' && 'message' in err ? String(err.message) : ''
      setError(message.includes('EDIT_FORBIDDEN')
        ? t("編集用URLから開いてください。")
        : message.includes('INVALID_ANSWER') ? t("選択肢または候補日が更新されています。再読み込みして回答を確認してください。")
        : t("送信中にエラーが発生しました。もう一度試してください。"))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen px-4 py-2">
      <div className="w-full">

        {/* サイトヘッダー */}
        <div className="mb-1 grid min-h-8 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-2">
          {canEditEvent && <Link
            href={path(`/?edit=${shareId}`)}
            className="col-start-3 row-start-1 justify-self-end whitespace-nowrap text-xs text-stone-600 transition-colors hover:text-rose-700 sm:ml-8 sm:justify-self-start sm:text-sm"
          >{t("日程を編集")}</Link>}
          <Link
            href={path("/")}
            aria-label={t("日程組で新しいイベントを作成")}
            className="group col-start-2 row-start-1 inline-flex items-baseline justify-self-center gap-1 whitespace-nowrap border-b border-transparent pb-0.5 font-serif text-xl text-stone-700 transition-colors hover:border-stone-400 hover:text-stone-900 sm:gap-1.5 sm:text-2xl"
          >
            <span>{t("日程組")}</span>
            {locale === 'ja' && <>
              <span className="font-sans text-[10px] font-normal text-stone-600 transition-colors group-hover:text-stone-700 sm:text-xs">略して{siteShortName}</span>
              <span className="text-xs text-stone-600 transition-colors group-hover:text-stone-700 sm:text-sm">で作成</span>
            </>}
          </Link>
        </div>

        {/* イベントヘッダー */}
        <div className="mb-1 min-w-0">
          <h1 className="event-title py-0.5 text-lg leading-6">{event.name}</h1>
          {event.description && (
            <p className="mt-1 max-w-2xl whitespace-pre-wrap break-words text-stone-700">{event.description}</p>
          )}
          <div id="answer-actions" className="mt-0.5 flex scroll-mt-4 flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleCopyUrl}
              className="inline-flex items-center gap-1.5 rounded-lg bg-white/50 px-2 py-0.5 text-xs text-stone-600 transition-colors hover:bg-rose-50 hover:text-rose-700"
            >
              {copied ? (
                <>{t("✓ コピーしました")}</>
              ) : (
                <>{path(`/e/${shareId}`)} ⧉</>
              )}
            </button>
            <button
              type="button"
              onClick={scrollToResponses}
              className="inline-flex items-center rounded-lg bg-white/50 px-2 py-0.5 text-xs text-stone-600 transition-colors hover:bg-rose-50 hover:text-rose-700"
            >{t("↓ みんなの回答へ")}</button>
            {keysReady && readEditToken('event', shareId) && (
              <button type="button" onClick={() => handleCopyEditUrl('event', shareId)}
                className="text-xs text-stone-600 hover:text-rose-700">
                {t("管理用URLをコピー")}
              </button>
            )}
          </div>
        </div>

        {/* 回答フォーム */}
        <form
          id="answer-form"
          onSubmit={handleSubmit}
          onDragOver={handleIcsDragOver}
          onDragLeave={handleIcsDragLeave}
          onDrop={handleIcsDrop}
          className={`mb-2 scroll-mt-4 -mx-4 rounded-2xl bg-white/70 px-1 py-2 shadow-sm backdrop-blur transition-shadow lg:mx-0 lg:px-6 ${
            hasVisiblePeerAnswers
              ? 'lg:w-fit lg:max-w-full'
              : 'lg:max-w-2xl'
          } ${isIcsDragOver ? 'ring-2 ring-rose-400' : ''}`}
        >
          <div className="mb-1 flex items-center justify-between">
            <h2 className="font-serif text-xl text-stone-700">
              {editingResponseId ? t("回答を編集") : t("回答する")}
            </h2>
            {editingResponseId && (
              <div className="flex items-center gap-3">
                {editingResponse && (
                  <button
                    type="button"
                    onClick={() => handleDeleteResponse(editingResponse)}
                    disabled={deletingResponseId === editingResponse.id}
                    className="text-sm text-stone-600 transition-colors hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {deletingResponseId === editingResponse.id ? t("削除中...") : t("削除")}
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="text-sm text-stone-600 transition-colors hover:text-rose-700"
                >{t("キャンセル")}</button>
              </div>
            )}
          </div>

          {editingResponseId && keysReady && readEditToken('response', editingResponseId) && (
            <button type="button" onClick={() => handleCopyEditUrl('response', editingResponseId)}
              className="mb-2 text-xs text-stone-600 hover:text-rose-700">
              {t("回答の編集用URLをコピー")}
            </button>
          )}
          {/* 名前 */}
          <div className="mb-1.5">
            <label className="mb-1 block text-sm font-medium text-stone-700">{t("お名前")}<span className="text-rose-700">*</span>
            </label>
            <input
              type="text"
              required
              maxLength={200}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("例：山田")}
              className="w-full max-w-xs rounded-lg border border-stone-300 bg-white px-4 py-2 text-stone-800 placeholder-stone-500 focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100 disabled:bg-stone-50 disabled:text-stone-600"
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
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <button
                type="button"
                onClick={() => icsInputRef.current?.click()}
                disabled={icsStatus === 'loading'}
                className="flex items-center gap-2 rounded-full border border-stone-300 px-4 py-2 text-sm text-stone-700 transition-colors hover:border-rose-300 hover:bg-rose-50 hover:text-rose-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {icsStatus === 'loading' ? (
                  <>
                    <span className="animate-spin">⟳</span>{t("解析中...")}</>
                ) : (
                  <>
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M19 4h-1V2h-2v2H8V2H6v2H5C3.89 4 3 4.9 3 6v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V9h14v11zM5 7V6h14v1H5z"/>
                    </svg>{t(".ics / zip から自動入力")}</>
                )}
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIcsOptionsOpen((v) => !v)}
                  aria-expanded={icsOptionsOpen}
                  className="rounded-full border border-stone-300 px-3 py-1.5 text-xs text-stone-600 transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
                >{t("設定")}{icsOptionsOpen ? '▲' : '▼'}
                </button>
                <button
                  type="button"
                  onClick={() => setIcsGuideOpen((v) => !v)}
                  aria-expanded={icsGuideOpen}
                  className="shrink-0 whitespace-nowrap text-[11px] text-stone-600 underline hover:text-rose-700"
                >{t("書き出し方法を見る")}{icsGuideOpen ? '▲' : '▼'}
                </button>
              </div>
            </div>
            <p className="mt-1 hidden text-[11px] text-stone-600 sm:block">{t(".ics / zip ファイルはこの枠にドラッグ&ドロップしても読み込めます。")}</p>
            {icsOptionsOpen && (
              <div className="mt-1 rounded-xl border border-stone-300 bg-stone-50/70 px-3 py-2">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs leading-none text-stone-600">
                  <div className="flex items-center gap-1.5">
                    <span className="shrink-0">{t("予定あり：")}</span>
                    <div className="flex gap-0.5">
                      {answerOptions.map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setIcsBusyValue((current) => current === opt.value ? null : opt.value)}
                          aria-label={icsBusyValue === opt.value ? t("予定ありの入力を解除する") : t("予定ありを{0}にする", opt.value)}
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
                    <span className="shrink-0">{t("予定なし：")}</span>
                    <div className="flex gap-0.5">
                      {answerOptions.map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setIcsFreeValue((current) => current === opt.value ? null : opt.value)}
                          aria-label={icsFreeValue === opt.value ? t("予定なしの入力を解除する") : t("予定なしを{0}にする", opt.value)}
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
                <p className="mt-2 text-xs leading-relaxed text-stone-600">{t("カレンダーから書き出した .ics / .zip ファイルをアップロードできます（この枠にドラッグ&ドロップしても読み込めます）。zip内の誕生日カレンダーは自動で除外されます。予定と重なる日程・空いている日程を選んだ記号でまとめて入力できます。ファイルは端末内で処理され、送信・保存されません。")}</p>
              </div>
            )}
            {icsGuideOpen && (
              <div className="mt-1 space-y-2 rounded-xl border border-stone-300 bg-stone-50 px-4 py-2 text-xs text-stone-700">
                <div>
                  <a href="https://calendar.google.com/calendar/u/0/r/settings/export" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-white px-2.5 py-1 font-medium text-rose-700 underline-offset-2 transition-colors hover:bg-rose-50 hover:underline">{t("Google カレンダーを開く")}<span aria-hidden="true">↗</span>
                  </a>
                  <ol className="mt-1 list-decimal pl-4 space-y-0.5 text-stone-600">
                    <li>{t("開いたページで「エクスポート」をクリック")}</li>
                    <li>{t("ZIP がダウンロードされる")}</li>
                    <li>{t("その ZIP をそのままアップロード（誕生日カレンダーは自動で除外）")}</li>
                  </ol>
                </div>
                <div>
                  <a href="https://www.icloud.com/calendar" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-white px-2.5 py-1 font-medium text-rose-700 underline-offset-2 transition-colors hover:bg-rose-50 hover:underline">{t("Apple カレンダー（iCloud）を開く")}<span aria-hidden="true">↗</span>
                  </a>
                  <ol className="mt-1 list-decimal pl-4 space-y-0.5 text-stone-600">
                    <li>{t("PC ブラウザで開く")}</li>
                    <li>{t("カレンダー名の横の共有マークから書き出し")}</li>
                    <li>{t("その .ics をアップロード")}</li>
                  </ol>
                </div>
                <div>
                  <a href="https://outlook.live.com/calendar/options/calendar/SharedCalendars" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-white px-2.5 py-1 font-medium text-rose-700 underline-offset-2 transition-colors hover:bg-rose-50 hover:underline">{t("Outlook カレンダーを開く")}<span aria-hidden="true">↗</span>
                  </a>
                  <ol className="mt-1 list-decimal pl-4 space-y-0.5 text-stone-600">
                    <li>{t("Outlook の URL 先で .ics ファイルをダウンロード")}</li>
                    <li>{t("その .ics をアップロード")}</li>
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
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <button
                type="button"
                onClick={toggleBulkOpen}
                className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                  bulkOpen
                    ? 'border-rose-400 bg-rose-50 text-rose-800'
                    : 'border-stone-300 text-stone-600 hover:border-rose-200 hover:text-rose-700'
                }`}
              >{t("📋 範囲で一括回答")}</button>
              <div className="flex items-center gap-1">
                <span className="text-xs text-stone-600">{t("全部これに揃える：")}</span>
                {answerOptions.map((opt) => {
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
              <label className="flex items-center gap-1.5 text-xs text-stone-600">
                <input
                  type="checkbox"
                  checked={keepExistingAnswers}
                  onChange={(e) => {
                    setKeepExistingAnswers(e.target.checked)
                    setLastSetAllAnswers(null)
                  }}
                  className="h-3.5 w-3.5 rounded border-stone-300 text-rose-800 focus:ring-rose-200"
                />{t("入力済の行は変更しない")}</label>
            </div>
            <div className="mt-1 flex items-center gap-1">
              <button
                type="button"
                onClick={undoAnswerChange}
                disabled={answerPast.length === 0}
                className="rounded-full border border-stone-300 px-3 py-1.5 text-xs text-stone-700 transition-colors hover:border-rose-300 hover:bg-rose-50 hover:text-rose-800 disabled:cursor-not-allowed disabled:opacity-70"
              >{t("↶ 戻す")}</button>
              <button
                type="button"
                onClick={redoAnswerChange}
                disabled={answerFuture.length === 0}
                className="rounded-full border border-stone-300 px-3 py-1.5 text-xs text-stone-700 transition-colors hover:border-rose-300 hover:bg-rose-50 hover:text-rose-800 disabled:cursor-not-allowed disabled:opacity-70"
              >{t("↷ 進む")}</button>
            </div>

            {bulkOpen && (
              <div className="mt-1.5 rounded-xl border border-stone-300 bg-stone-50 px-4 py-2">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-medium text-stone-600">{t("日程範囲と回答を選択して「適用」")}</p>
                  <button
                    type="button"
                    onClick={() => setBulkOpen(false)}
                    className="text-xs text-stone-600 hover:text-stone-700"
                  >{t("閉じる")}</button>
                </div>
                {/* 日付範囲 */}
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <input
                    type="date"
                    value={bulkStart}
                    onChange={(e) => setBulkStart(e.target.value)}
                    className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800 focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100"
                  />
                  <span className="text-stone-600">〜</span>
                  <input
                    type="date"
                    value={bulkEnd}
                    min={bulkStart}
                    onChange={(e) => setBulkEnd(e.target.value)}
                    className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800 focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100"
                  />
                </div>
                {/* 曜日フィルター：選ぶと下の2つの「適用」がその曜日だけに絞られる */}
                <p className="mb-1 text-xs text-stone-600">{t("曜日で絞る(任意)")}</p>
                <div className="mb-2 flex flex-wrap items-center gap-1">
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
                        className={`flex h-6 w-6 items-center justify-center rounded-full border text-[11px] transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${
                          isSelected
                            ? 'border-rose-400 bg-rose-700 font-bold text-white'
                            : i === 0
                            ? 'border-stone-300 text-rose-400 hover:border-rose-200 hover:bg-rose-50'
                            : i === 6
                            ? 'border-stone-300 text-blue-400 hover:border-blue-200 hover:bg-blue-50'
                            : 'border-stone-300 text-stone-600 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700'
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
                      className="text-xs text-stone-600 underline hover:text-stone-700"
                    >{t("解除")}</button>
                  )}
                </div>
                {/* 回答選択 */}
                <div className="mb-2 flex gap-2">
                  {answerOptions.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setBulkValue(opt.value)}
                      className={`h-8 w-8 rounded-full border-2 text-sm transition-all ${
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
                  className="rounded-full bg-rose-800 px-4 py-1.5 text-sm text-white transition-colors hover:bg-rose-900 disabled:cursor-not-allowed disabled:opacity-70"
                >{t("適用")}</button>
                <div className="mt-2 border-t border-stone-300 pt-1.5">
                  <p className="mb-1.5 text-xs font-medium text-stone-600">{t("日付範囲 + 時間帯で一括回答")}</p>
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <input
                      type="time"
                      value={bulkTimeStart}
                      onChange={(e) => setBulkTimeStart(e.target.value)}
                      className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800 focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100"
                    />
                    <span className="text-stone-600">〜</span>
                    <input
                      type="time"
                      value={bulkTimeEnd}
                      onChange={(e) => setBulkTimeEnd(e.target.value)}
                      className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800 focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100"
                    />
                  </div>
                  <div className="mb-2 flex items-center gap-2">
                    <span className="text-xs text-stone-600">{t("重なる候補を：")}</span>
                    {answerOptions.map((opt) => (
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
                      className="rounded-full bg-rose-800 px-4 py-1.5 text-sm text-white transition-colors hover:bg-rose-900 disabled:cursor-not-allowed disabled:opacity-70"
                    >{t("適用")}</button>
                    <span className="text-xs text-stone-600">{t("上の日付範囲・曜日の中で、少しでも時間が重なる候補を変更します")}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 候補日ごとの回答。見出しと切替は横スクロールさせず、回答列だけを動かす。 */}
          <div className="mb-1">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <div className="text-sm font-medium text-stone-700">{t("各日程への出欠")}<span className="text-rose-700">*</span>
              </div>
              {peerResponses.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowPeerAnswers((value) => !value)}
                  className={`rounded-full border px-2 py-0.5 text-[11px] transition-colors ${
                    hasVisiblePeerAnswers
                      ? 'border-rose-400 bg-rose-50 text-rose-800'
                      : 'border-stone-300 text-stone-600 hover:border-rose-200 hover:text-rose-700'
                  }`}
                >
                  {hasVisiblePeerAnswers
                    ? t("✓ 他の人の回答を横に表示")
                    : t("他の人の回答を横に表示")}
                </button>
              )}
            </div>
            <p className="mt-0.5 text-[10px] leading-tight text-stone-600">{t("長押し・ドラッグでまとめて入力できます")}</p>
          </div>
          <div className="mb-2 flex min-w-0 overflow-hidden">
            {/* 日付と自分の回答は、他の人の回答とは別の固定領域に置く。 */}
            <div
              className={`relative z-10 grid shrink-0 gap-y-0.5 ${
                hasVisiblePeerAnswers
                  ? 'grid-cols-[max-content_max-content]'
                  : 'w-full grid-cols-[max-content_minmax(0,1fr)]'
              }`}
            >
              {hasVisiblePeerAnswers && (
                <div className="col-span-2 grid h-12 grid-cols-subgrid items-end">
                  <div />
                  <div className="pr-2 pb-0.5 text-[10px] text-stone-600">{t("あなた")}</div>
                </div>
              )}
              {candidates.map((c, index) => (
                <div
                  key={c.id}
                  data-answer-row-id={c.id}
                  className={`col-span-2 grid h-9 grid-cols-subgrid items-center rounded-l-md ${
                    index % 2 === 1 ? 'bg-stone-500/20' : ''
                  }`}
                >
                  <div className="answer-date-label whitespace-nowrap pr-2">
                    <span className="whitespace-nowrap font-serif text-sm text-stone-700">{formatDate(c.date)}</span>
                    {c.time_label && (
                      <>
                        {' '}
                        <span className="whitespace-nowrap text-xs text-stone-600">{c.time_label}</span>
                      </>
                    )}
                  </div>
                  <div className="answer-inputs flex items-center gap-1.5 pr-2">
                    {answerOptions.map((opt) => (
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
                        className={`h-8 w-8 shrink-0 select-none rounded-full border-2 text-sm transition-all ${
                          answers[c.id] === opt.value ? opt.active : opt.idle
                        }`}
                      >
                        {opt.value === '-' ? '−' : opt.value}
                      </button>
                    ))}
                    {answers[c.id] === '-' && (
                      <input
                        type="text"
                        value={detailNotes[c.id] ?? ''}
                        onChange={(e) =>
                          setDetailNotes((prev) => ({ ...prev, [c.id]: e.target.value }))
                        }
                        placeholder={t("メモ(任意)")}
                        className={`min-w-0 rounded-lg border border-blue-100 bg-blue-50/50 px-1.5 py-1 text-xs text-stone-700 placeholder-stone-500 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100 ${
                          hasVisiblePeerAnswers ? 'w-12 sm:w-32' : 'w-0 flex-1'
                        }`}
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>

            {hasVisiblePeerAnswers && (
              <div
                ref={answerScrollRef}
                className="min-w-0 flex-1 overflow-x-auto overscroll-x-contain"
              >
                <div
                  className="grid w-max gap-y-0.5"
                  style={{ gridTemplateColumns: `repeat(${peerResponses.length}, fit-content(6rem))` }}
                >
                  <div className="col-span-full grid h-12 grid-cols-subgrid items-end">
                    {peerResponses.map((response) => (
                      <div
                        key={response.id}
                        className="flex min-w-5 max-w-36 items-end justify-center self-stretch border-l border-stone-500/50 px-0.5 pb-0.5"
                      >
                        <div
                          className="line-clamp-3 overflow-hidden break-all text-center text-[11px] leading-tight text-stone-600"
                          title={response.name}
                        >
                          {response.name}
                        </div>
                      </div>
                    ))}
                  </div>
                  {candidates.map((c, index) => (
                    <div
                      key={c.id}
                      className={`col-span-full grid h-9 grid-cols-subgrid items-center rounded-r-md ${
                        index % 2 === 1 ? 'bg-stone-500/20' : ''
                      }`}
                    >
                      {peerResponses.map((response) => {
                        const answer = answerByResponseAndCandidate.get(`${response.id}:${c.id}`)
                        return (
                          <div
                            key={response.id}
                            className="flex min-w-5 items-center justify-center self-stretch border-l border-stone-500/50 px-0.5 text-sm leading-tight"
                          >
                            <span className={answerColor(answer?.value)}>
                              {answer?.value ?? '−'}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 共通メモ：常時表示 */}
          <div className="mb-2">
            <input
              type="text"
              value={sharedNote}
              onChange={(e) => setSharedNote(e.target.value)}
              placeholder={t("全体へのメモ(任意)")}
              className="w-full rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm text-stone-700 placeholder-stone-500 focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100"
            />
          </div>

          <div id="answer-submit-area">
            {/* エラー・成功メッセージ */}
            {error && (
              <p className="mb-2 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">
                {error}
              </p>
            )}
            {submitSuccess && (
              <p className="mb-2 rounded-lg bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
                {submitSuccess === 'updated' ? t("回答を更新しました！") : t("回答を送信しました！ありがとうございます。")}
              </p>
            )}

            <button
              type="submit"
              disabled={isSubmitting || Boolean(deletingResponseId)}
              className="w-full rounded-full bg-rose-800 py-2.5 text-base font-medium text-white shadow transition-all hover:bg-rose-900 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? t("送信中...") : editingResponseId ? t("回答を更新") : t("回答を送信")}
            </button>
          </div>
        </form>

        {/* 集計テーブル */}
        <div
          id="responses-section"
          className="scroll-mt-4 -mx-4 rounded-2xl bg-white/70 px-1 py-2 shadow-sm backdrop-blur lg:mx-0 lg:w-fit lg:max-w-full lg:px-6"
        >
          {/* スマホでは見出しの下に操作を1行で置き、入りきらないときはその行だけ横に流す。640px以上は見出しの横に置き、入りきらなければ折り返す */}
          <div className="mb-2 flex flex-col items-start gap-1.5 sm:flex-row sm:items-center sm:gap-x-3">
            <h2 className="shrink-0 font-serif text-xl text-stone-700">{t("みんなの回答")}</h2>
            <div className="-mx-1 flex w-full shrink-0 items-center gap-1 overflow-x-auto px-1 pb-1 sm:mx-0 sm:w-auto sm:min-w-0 sm:shrink sm:flex-wrap sm:gap-2 sm:overflow-visible sm:pb-0">
              <button
                type="button"
                onClick={scrollToAnswerForm}
                className="shrink-0 rounded-full border border-stone-300 px-2 py-1.5 text-xs text-stone-600 transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 sm:px-3"
              >{t("↑ 回答へ")}</button>
              {hasResponses && (
                <label className="flex shrink-0 cursor-pointer items-center gap-1 whitespace-nowrap rounded-full border border-stone-300 px-2 py-1.5 text-xs text-stone-600 transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 sm:gap-1.5 sm:px-3">
                  <input
                    type="checkbox"
                    checked={showAnswerCounts}
                    onChange={(e) => updateTablePrefs({ counts: e.target.checked })}
                    className="h-3.5 w-3.5 accent-rose-700"
                  />{t("集計")}</label>
              )}
              {hasResponses && (
                <label className="flex shrink-0 cursor-pointer items-center gap-1 whitespace-nowrap rounded-full border border-stone-300 px-2 py-1.5 text-xs text-stone-600 transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 sm:gap-1.5 sm:px-3">
                  <input
                    type="checkbox"
                    checked={stickyHeadColumn}
                    onChange={(e) => updateTablePrefs({ sticky: e.target.checked })}
                    className="h-3.5 w-3.5 accent-rose-700"
                  />{t("見出し固定")}</label>
              )}
              {hasResponses && (
                <div className="flex shrink-0 overflow-hidden rounded-full border border-stone-300">
                  <button
                    type="button"
                    onClick={() => updateTablePrefs({ layout: 'h' })}
                    title={t("横向き表示")}
                    className={`px-2.5 py-1.5 text-xs transition-colors sm:px-3 ${
                      tableLayout === 'h'
                        ? 'bg-rose-800 text-white'
                        : 'text-stone-600 hover:bg-stone-50'
                    }`}
                  >{t("╠═╣ 横")}</button>
                  <button
                    type="button"
                    onClick={() => updateTablePrefs({ layout: 'v' })}
                    title={t("縦向き表示")}
                    className={`border-l border-stone-300 px-2.5 py-1.5 text-xs transition-colors sm:px-3 ${
                      tableLayout === 'v'
                        ? 'bg-rose-800 text-white'
                        : 'text-stone-600 hover:bg-stone-50'
                    }`}
                  >{t("縦 ╦")}</button>
                </div>
              )}
              {hasResponses && (
                <div role="group" aria-label={t("全体メモの表示位置")} className="flex shrink-0 items-center gap-1 text-xs text-stone-600">
                  <span>{t("全体メモ")}</span>
                  <div className="flex overflow-hidden rounded-full border border-stone-300">
                    <button
                      type="button"
                      aria-pressed={notePosition === 'name'}
                      onClick={() => updateTablePrefs({ notes: 'name' })}
                      className={`whitespace-nowrap px-2 py-1.5 transition-colors ${notePosition === 'name' ? 'bg-rose-800 text-white' : 'hover:bg-stone-50'}`}
                    >{t("名前の下")}</button>
                    <button
                      type="button"
                      aria-pressed={notePosition === 'bottom'}
                      onClick={() => updateTablePrefs({ notes: 'bottom' })}
                      className={`whitespace-nowrap border-l border-stone-300 px-2 py-1.5 transition-colors ${notePosition === 'bottom' ? 'bg-rose-800 text-white' : 'hover:bg-stone-50'}`}
                    >{t("表の下")}</button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Keep the description from determining the content-sized table width. */}
          <div className="response-event-details mb-1.5 min-w-0 [contain:inline-size] [overflow-wrap:anywhere]">
            <h3 className="event-title text-base leading-5">{event.name}</h3>
            {event.description?.trim() && (
              <p className="mt-1 max-w-2xl whitespace-pre-wrap text-sm leading-relaxed text-stone-700">{event.description}</p>
            )}
          </div>

          {responsesError && (
            <p className="mb-3 rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-700">
              {responsesError}
            </p>
          )}

          {isLoadingResponses && !hasResponses ? (
            <p className="text-sm text-stone-600">{t("回答一覧を読み込み中...")}</p>
          ) : !hasResponses ? (
            <p className="text-sm text-stone-600">{t("まだ回答がありません。")}</p>
          ) : tableLayout === 'h' ? (

            /* ── 横向きテーブル：行=回答者、列=候補日 ── */
            <div className="relative isolate overflow-x-auto">
              <table className="response-results-table w-max text-center text-sm leading-tight">
                <thead>
                  <tr>
                    <th className={`${stickyHeadClass('z-20')}w-40 min-w-40 max-w-40 pb-1 pr-3 text-left text-xs font-normal text-stone-600`}>{t("名前")}</th>
                    {candidates.map((c) => (
                      <th
                        key={c.id}
                        className={`border-l border-stone-500/50 px-1.5 pb-1 font-normal text-stone-600 whitespace-nowrap ${bestCandidateIds.has(c.id) ? 'response-best-candidate' : ''}`}
                      >
                        <div className="font-serif text-sm">{formatDate(c.date)}</div>
                        {c.time_label && (
                          <div className="text-xs text-stone-600 whitespace-nowrap">{c.time_label}</div>
                        )}
                      </th>
                    ))}
                    <th className="border-l border-stone-500/50 pb-1"></th>
                  </tr>
                </thead>
                <tbody>
                  {showAnswerCounts && countOptions.map((option, index) => (
                    <tr
                      key={`count-${option.value}`}
                      className={`border-t border-stone-300 ${
                        index % 2 === 1 ? 'bg-stone-500/20' : ''
                      }`}
                    >
                      <th className={`${stickyHeadClass('z-10')}w-40 min-w-40 max-w-40 py-0 pr-3 text-left font-normal`}>
                        <span className={answerColor(option.value)}>
                          {option.value === '-' ? '−' : option.value}
                        </span>
                      </th>
                      {candidates.map((candidate) => {
                        const count = answerCountsByCandidate.get(candidate.id)?.[option.value] ?? 0
                        const isBest = bestCandidateIds.has(candidate.id) && count > 0 && (option.value === '◎' || option.value === '○')
                        return (
                          <td
                            key={candidate.id}
                            title={t("{0}：{1}人", option.value === '-' ? '−' : option.value, count)}
                            className={`border-l border-stone-500/50 px-1.5 py-0 ${isBest ? 'response-best-candidate response-best-count' : 'font-medium text-stone-700'}`}
                          >
                            {count || ''}
                          </td>
                        )
                      })}
                      <td className="border-l border-stone-500/50 py-0"></td>
                    </tr>
                  ))}
                  {responseRows.map((r, index) => (
                    <tr
                      key={r.id}
                      className={`border-stone-300 even:bg-stone-500/20 ${
                        index === 0 && showAnswerCounts ? 'border-t-2' : 'border-t'
                      }`}
                    >
                      <td className={`${stickyHeadClass('z-10')}w-40 min-w-40 max-w-40 py-0 pr-3 text-left text-stone-700`}>
                        <div className="[overflow-wrap:anywhere]">{r.name}</div>
                        {notePosition === 'name' && r.note?.trim() && (
                          <div className="response-general-note whitespace-pre-wrap [overflow-wrap:anywhere] text-xs text-stone-600">{r.note.trim()}</div>
                        )}
                      </td>
                      {candidates.map((c) => {
                        const answer = answerByResponseAndCandidate.get(`${r.id}:${c.id}`)
                        return (
                          <td
                            key={c.id}
                            className="border-l border-stone-500/50 px-1.5 py-0"
                          >
                            <span className={answerColor(answer?.value)}>
                              {answer?.value ?? '−'}
                            </span>
                            {answer?.value === '-' && answer.note?.trim() && (
                              <p className="mx-auto max-w-48 [overflow-wrap:anywhere] text-xs text-stone-600">{answer.note.trim()}</p>
                            )}
                          </td>
                        )
                      })}
                      <td className="border-l border-stone-500/50 py-0">
                        <button
                          type="button"
                          hidden={!canEditResponse(r)}
                          onClick={() => handleEdit(r)}
                          className="text-xs text-stone-500 transition-colors hover:text-rose-700"
                        >{t("編集")}</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

          ) : (

            /* ── 縦向きテーブル：行=候補日、列=回答者 ── */
            <div className="relative isolate overflow-x-auto">
              <table ref={resultsTableRef} className="response-results-table w-max text-center text-sm leading-tight">
                <thead>
                  <tr>
                    <th className={`${stickyHeadClass('z-20')}pb-1 pr-0.5 text-left text-xs font-normal text-stone-600`}>{t("候補日")}</th>
                    {showAnswerCounts && countOptions.map((option) => (
                      <th
                        key={`count-heading-${option.value}`}
                        title={t("{0}の人数", option.value === '-' ? '−' : option.value)}
                        className={`min-w-7 border-l border-stone-500/50 px-1 pb-1 font-normal ${answerColor(option.value)}`}
                      >
                        {option.value === '-' ? '−' : option.value}
                      </th>
                    ))}
                    {responseRows.map((r) => (
                      <th key={r.id} className="border-l border-stone-500/50 px-0 pb-1 font-normal text-stone-600">
                        <div className="response-name mx-auto w-max max-w-44 text-center [overflow-wrap:anywhere]">{r.name}</div>
                        {notePosition === 'name' && r.note?.trim() && (
                          <div className="response-general-note mx-auto max-w-44 whitespace-pre-wrap [overflow-wrap:anywhere] text-xs font-normal text-stone-600">{r.note.trim()}</div>
                        )}
                        <button
                          type="button"
                          hidden={!canEditResponse(r)}
                          onClick={() => handleEdit(r)}
                          className="text-xs font-normal text-stone-500 transition-colors hover:text-rose-700"
                        >{t("編集")}</button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {candidates.map((c) => (
                    <tr key={c.id} className="border-t border-stone-300 even:bg-stone-500/20">
                      <td className={`${stickyHeadClass('z-10')}py-0 pr-0.5 text-left whitespace-nowrap ${bestCandidateIds.has(c.id) ? 'response-best-candidate' : ''}`}>
                        <span className="font-serif text-stone-700">
                          {formatDate(c.date)}
                        </span>
                        {c.time_label && (
                          <span className="ml-1 text-xs text-stone-600 whitespace-nowrap">{c.time_label}</span>
                        )}
                      </td>
                      {showAnswerCounts && countOptions.map((option) => {
                        const count = answerCountsByCandidate.get(c.id)?.[option.value] ?? 0
                        const isBest = bestCandidateIds.has(c.id) && count > 0 && (option.value === '◎' || option.value === '○')
                        return (
                          <td
                            key={`count-${option.value}`}
                            title={t("{0}：{1}人", option.value === '-' ? '−' : option.value, count)}
                            className={`min-w-7 border-l border-stone-500/50 px-1 py-0 ${isBest ? 'response-best-candidate response-best-count' : 'font-medium text-stone-700'}`}
                          >
                            {count || ''}
                          </td>
                        )
                      })}
                      {responseRows.map((r) => {
                        const answer = answerByResponseAndCandidate.get(`${r.id}:${c.id}`)
                        return (
                          <td key={r.id} className="border-l border-stone-500/50 px-0 py-0">
                            <span className={answerColor(answer?.value)}>
                              {answer?.value ?? '−'}
                            </span>
                            {answer?.value === '-' && answer.note?.trim() && (
                              <p className="mx-auto max-w-48 [overflow-wrap:anywhere] text-xs text-stone-600">{answer.note.trim()}</p>
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
          {notePosition === 'bottom' && responsesWithNotes.length > 0 && (
            <section aria-labelledby="response-notes-heading" className="response-general-notes mt-1.5 min-w-0 [contain:inline-size] [overflow-wrap:anywhere]">
              <h3 id="response-notes-heading" className="text-xs font-medium text-stone-700">{t("全体メモ")}</h3>
              <ul className="max-w-2xl list-disc pl-4 text-xs leading-relaxed text-stone-600">
                {responsesWithNotes.map(response => (
                  <li key={response.id} className="whitespace-pre-wrap">
                    <span className="font-medium text-stone-700">{response.name}</span>{': '}{response.note?.trim()}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        {/* 日時はサーバー(UTC)とブラウザ(現地時間)で食い違うため、マウント後に描画する */}
        {infoMounted && (
          <div className="mt-2 rounded-2xl bg-white/50 px-4 py-2 text-[11px] leading-relaxed text-stone-600">
            <p className="mb-1 font-medium text-stone-700">{t("【このページについての情報】")}</p>
            <p>{t("ページ表示日時：")}{formatDateTime(viewedAt)}</p>
            <p>{t("作成日時：")}{formatDateTime(event.created_at)}</p>
            <p>{t("最終更新日時：")}{formatDateTime(lastUpdatedAt)}</p>
            {localUpdatedAt && (
              <p>{t("この端末からの最終更新日時：")}{formatDateTime(localUpdatedAt)}</p>
            )}
            <p>{t("回答人数：")}{responseRows.length}{t("人")}</p>
          </div>
        )}

        <p className="footer-links mt-2 text-center text-[11px] text-stone-600">
          <Link href={path("/terms")} className="underline-offset-2 transition-colors hover:text-rose-700 hover:underline">{t("利用規約")}</Link>
          <span className="mx-2">·</span>
          <Link href={path("/privacy")} className="underline-offset-2 transition-colors hover:text-rose-700 hover:underline">{t("プライバシーポリシー")}</Link>
          <span className="mx-2">·</span>
          <Link href={path("/history")} className="underline-offset-2 transition-colors hover:text-rose-700 hover:underline">{t("ページ表示履歴")}</Link>
          <span className="mx-2">·</span>
          <Link href={path("/contact")} className="underline-offset-2 transition-colors hover:text-rose-700 hover:underline">{t("お問い合わせ")}</Link>
          <span className="mx-2">·</span>
          <a
            href="https://www.amazon.jp/hz/wishlist/ls/5B63O13XSOQ4?ref_=wl_share"
            target="_blank"
            rel="noopener noreferrer"
            title={t("Amazon のほしい物リストが開きます")}
            className="underline-offset-2 transition-colors hover:text-rose-700 hover:underline"
          >{t("支援")}<span aria-hidden="true">↗</span>
          </a>
          <span className="mx-1">·</span>
          <LanguageSwitch />
        </p>
        <p className="site-secondary-links mt-1 text-center text-[11px] text-stone-600">
          <Link href={path("/updates")} className="underline underline-offset-2 transition-colors hover:text-rose-700">{t("更新履歴")}</Link>
          <span className="mx-1">·</span>
          <ServiceShareLink locale={locale} />
        </p>
      </div>
    </div>
  )
}
