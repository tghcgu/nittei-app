'use client'

import { useState, useRef } from 'react'
import ICAL from 'ical.js'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
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

// ---- スコア・表示設定 ----
const SCORE: Record<AnswerValue, number> = { '○': 2, '△': 1, '-': 0.5, '✕': 0 }

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

// ---- メインコンポーネント ----
export function ResponsePage({ shareId, event, candidates, responses }: Props) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({})
  // 個別メモ：「-」選択時のみ、候補日ごと（answers.note に保存）
  const [detailNotes, setDetailNotes] = useState<Record<string, string>>({})
  // 共通メモ：常時表示、回答全体で1つ（responses.note に保存）
  const [sharedNote, setSharedNote] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitSuccess, setSubmitSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tableLayout, setTableLayout] = useState<'h' | 'v'>('h')
  const [editingResponseId, setEditingResponseId] = useState<string | null>(null)

  // 範囲で一括回答
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkStart, setBulkStart] = useState('')
  const [bulkEnd, setBulkEnd] = useState('')
  const [bulkValue, setBulkValue] = useState<AnswerValue>('○')

  // 共有URLコピー
  const [copied, setCopied] = useState(false)

  function handleCopyUrl() {
    const url = `${window.location.origin}/e/${shareId}`
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  // .ics 自動入力ステータス
  const [icsStatus, setIcsStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [icsMessage, setIcsMessage] = useState('')
  const [icsGuideOpen, setIcsGuideOpen] = useState(false)

  const columnScores = Object.fromEntries(
    candidates.map((c) => [
      c.id,
      responses.reduce((sum, r) => {
        const answer = r.answers.find((a) => a.candidate_id === c.id)
        return sum + (answer ? (SCORE[answer.value] ?? 0) : 0)
      }, 0),
    ])
  )
  const maxScore = candidates.length > 0 ? Math.max(...Object.values(columnScores)) : 0

  function handleEdit(r: ResponseWithAnswers) {
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
    setSubmitSuccess(false)
    setError(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function handleCancelEdit() {
    setName('')
    setAnswers({})
    setDetailNotes({})
    setSharedNote('')
    setEditingResponseId(null)
    setError(null)
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

  async function handleIcsUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    setIcsStatus('loading')
    setIcsMessage('')

    try {
      const sortedDates = [...candidates].sort((a, b) => a.date.localeCompare(b.date))
      const rangeStart = ICAL.Time.fromDateTimeString(sortedDates[0].date + 'T00:00:00')
      const rangeEnd = ICAL.Time.fromDateTimeString(sortedDates[sortedDates.length - 1].date + 'T23:59:59')

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

      const newAnswers: Record<string, AnswerValue> = {}
      for (const c of candidates) {
        const { start: cs, end: ce } = parseCandidateTimeRange(c.date, c.time_label)
        const csMs = new Date(cs).getTime()
        const ceMs = new Date(ce).getTime()
        const datePrefix = c.date

        const isBusy = busyPeriods.some(({ start, end, isAllDay }) => {
          if (isAllDay) return start.toISOString().slice(0, 10) === datePrefix
          return start.getTime() < ceMs && end.getTime() > csMs
        })

        newAnswers[c.id] = isBusy ? '✕' : '○'
      }

      // 既に✕になっている候補は次のファイルを読んでも✕を維持する
      setAnswers((prev) => {
        const merged: Record<string, AnswerValue> = { ...prev }
        for (const [id, val] of Object.entries(newAnswers)) {
          if (prev[id] === '✕') continue
          merged[id] = val
        }
        return merged
      })
      setIcsStatus('done')
      setIcsMessage('.ics を解析しました。内容を確認してから送信してください。')
    } catch {
      setIcsStatus('error')
      setIcsMessage('読み取りに失敗しました。.ics ファイルか確認して、手動で入力してください。')
    }
  }

  function applyBulkAnswer() {
    if (!bulkStart || !bulkEnd || bulkStart > bulkEnd) return
    const updates: Record<string, AnswerValue> = {}
    for (const c of candidates) {
      if (c.date >= bulkStart && c.date <= bulkEnd) {
        updates[c.id] = bulkValue
      }
    }
    setAnswers((prev) => ({ ...prev, ...updates }))
    // 「-」以外なら個別メモをクリア
    if (bulkValue !== '-') {
      setDetailNotes((prev) => {
        const next = { ...prev }
        for (const id of Object.keys(updates)) delete next[id]
        return next
      })
    }
    setBulkOpen(false)
  }

  function handleAnswerChange(candidateId: string, value: AnswerValue) {
    setAnswers((prev) => {
      if (prev[candidateId] === value) {
        const next = { ...prev }
        delete next[candidateId]
        return next
      }
      return { ...prev, [candidateId]: value }
    })
    if (value !== '-') {
      setDetailNotes((prev) => {
        const next = { ...prev }
        delete next[candidateId]
        return next
      })
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
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

        // 既存のanswersを削除して再挿入
        const { error: delError } = await supabase
          .from('answers')
          .delete()
          .eq('response_id', editingResponseId)

        if (delError) throw delError

        const { error: insError } = await supabase
          .from('answers')
          .insert(answerRows.map((a) => ({ ...a, response_id: editingResponseId })))

        if (insError) throw insError
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
      setSharedNote('')
      setEditingResponseId(null)
      setSubmitSuccess(true)

      router.refresh()
      setTimeout(() => setSubmitSuccess(false), 3000)
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

        {/* 戻るリンク */}
        <Link
          href="/"
          className="mb-2 inline-block text-sm text-stone-400 transition-colors hover:text-rose-700"
        >
          ← 新しいイベントを作る
        </Link>

        {/* イベントヘッダー */}
        <div className="mb-1">
          <h1 className="font-serif text-3xl text-rose-800">{event.name}</h1>
          {event.description && (
            <p className="mt-1 text-stone-600">{event.description}</p>
          )}
          <button
            type="button"
            onClick={handleCopyUrl}
            className="mt-0.5 inline-flex items-center gap-1.5 rounded-lg bg-white/50 px-2 py-0.5 text-xs text-stone-400 transition-colors hover:bg-rose-50 hover:text-rose-700"
          >
            {copied ? (
              <>✓ コピーしました</>
            ) : (
              <>/e/{shareId} ⧉</>
            )}
          </button>
        </div>

        {/* 回答フォーム */}
        <form
          onSubmit={handleSubmit}
          className="mb-8 rounded-2xl bg-white/70 px-6 py-3 shadow-sm backdrop-blur"
        >
          <div className="mb-1 flex items-center justify-between">
            <h2 className="font-serif text-xl text-stone-700">
              {editingResponseId ? '回答を編集' : '回答する'}
            </h2>
            {editingResponseId && (
              <button
                type="button"
                onClick={handleCancelEdit}
                className="text-sm text-stone-400 transition-colors hover:text-rose-700"
              >
                キャンセル
              </button>
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
              accept=".ics"
              className="hidden"
              onChange={handleIcsUpload}
            />
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
                  .ics から自動入力
                </>
              )}
            </button>
            <p className="mt-1 text-xs text-stone-400">
              カレンダーアプリから書き出した .ics ファイルをアップロード。予定と重なる日程を自動で✕にまとめて入力できます。ファイルは端末内で処理され、送信・保存されません。
            </p>
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
                onClick={() => setBulkOpen((v) => !v)}
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
                {ANSWER_OPTIONS.filter((o) => o.value !== '-').map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() =>
                      setAnswers(
                        Object.fromEntries(candidates.map((c) => [c.id, opt.value]))
                      )
                    }
                    className={`h-8 w-8 rounded-full border-2 text-sm transition-all ${opt.idle} hover:scale-110`}
                  >
                    {opt.value}
                  </button>
                ))}
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
              </div>
            )}
          </div>

          {/* 候補日ごとの回答 */}
          <div className="mb-6 space-y-0.5">
            <div className="mb-1 text-sm font-medium text-stone-700">
              各日程への出欠 <span className="text-rose-700">*</span>
            </div>
            {candidates.map((c) => (
              <div key={c.id}>
                <div className="flex flex-wrap items-center gap-2 py-0">
                  <div className="w-32 shrink-0">
                    <span className="font-serif text-sm text-stone-700">{formatDate(c.date)}</span>
                    {c.time_label && (
                      <span className="ml-1 text-xs text-stone-400">{c.time_label}</span>
                    )}
                  </div>
                  <div className="flex gap-1.5">
                    {ANSWER_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => handleAnswerChange(c.id, opt.value)}
                        className={`h-8 w-8 rounded-full border-2 text-sm transition-all ${
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
                  <div className="ml-[9.5rem] mt-1">
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

          {/* エラー・成功メッセージ */}
          {error && (
            <p className="mb-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">
              {error}
            </p>
          )}
          {submitSuccess && (
            <p className="mb-4 rounded-lg bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
              {editingResponseId ? '回答を更新しました！' : '回答を送信しました！ありがとうございます。'}
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-full bg-rose-800 py-3 text-base font-medium text-white shadow transition-all hover:bg-rose-900 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? '送信中...' : editingResponseId ? '回答を更新' : '回答を送信'}
          </button>
        </form>

        {/* 集計テーブル */}
        <div className="rounded-2xl bg-white/70 px-8 py-8 shadow-sm backdrop-blur">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="font-serif text-xl text-stone-700">みんなの回答</h2>
            {responses.length > 0 && (
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

          {responses.length === 0 ? (
            <p className="text-sm text-stone-400">まだ回答がありません。</p>
          ) : tableLayout === 'h' ? (

            /* ── 横向きテーブル：行=回答者、列=候補日 ── */
            <div className="overflow-x-auto">
              <table className="w-full text-center text-sm">
                <thead>
                  <tr>
                    <th className="w-28 pb-4 text-left text-xs font-normal text-stone-400">名前</th>
                    {candidates.map((c) => (
                      <th
                        key={c.id}
                        className={`pb-4 font-normal ${
                          columnScores[c.id] === maxScore && maxScore > 0
                            ? 'text-rose-800'
                            : 'text-stone-500'
                        }`}
                      >
                        <div className="font-serif text-sm">{formatDate(c.date)}</div>
                        {c.time_label && (
                          <div className="text-xs text-stone-400">{c.time_label}</div>
                        )}
                      </th>
                    ))}
                    <th className="pb-4"></th>
                  </tr>
                </thead>
                <tbody>
                  {responses.map((r) => (
                    <tr key={r.id} className="border-t border-stone-100">
                      <td className="py-3 text-left text-stone-700">
                        <div>{r.name}</div>
                        {r.note && (
                          <div className="text-xs text-stone-400">（{r.note}）</div>
                        )}
                      </td>
                      {candidates.map((c) => {
                        const answer = r.answers.find((a) => a.candidate_id === c.id)
                        return (
                          <td
                            key={c.id}
                            className={`py-3 ${
                              columnScores[c.id] === maxScore && maxScore > 0 ? 'bg-rose-50' : ''
                            }`}
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
                      <td className="py-3">
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
                <tfoot>
                  <tr className="border-t-2 border-stone-200">
                    <td className="pt-3 text-left text-xs text-stone-400">スコア</td>
                    {candidates.map((c) => (
                      <td
                        key={c.id}
                        className={`pt-3 font-bold ${
                          columnScores[c.id] === maxScore && maxScore > 0
                            ? 'bg-rose-50 text-rose-800'
                            : 'text-stone-500'
                        }`}
                      >
                        {columnScores[c.id]}
                        {columnScores[c.id] === maxScore && maxScore > 0 && (
                          <span className="ml-1 text-xs">★</span>
                        )}
                      </td>
                    ))}
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>

          ) : (

            /* ── 縦向きテーブル：行=候補日、列=回答者 ── */
            <div className="overflow-x-auto">
              <table className="w-full text-center text-sm">
                <thead>
                  <tr>
                    <th className="pb-4 text-left text-xs font-normal text-stone-400">候補日</th>
                    {responses.map((r) => (
                      <th key={r.id} className="pb-4 font-normal text-stone-500">
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
                    <th className="pb-4 text-xs font-normal text-stone-400">スコア</th>
                  </tr>
                </thead>
                <tbody>
                  {candidates.map((c) => {
                    const isBest = columnScores[c.id] === maxScore && maxScore > 0
                    return (
                      <tr key={c.id} className="border-t border-stone-100">
                        <td className={`py-3 text-left ${isBest ? 'bg-rose-50' : ''}`}>
                          <span className={`font-serif ${isBest ? 'text-rose-800' : 'text-stone-700'}`}>
                            {formatDate(c.date)}
                          </span>
                          {c.time_label && (
                            <span className="ml-1 text-xs text-stone-400">{c.time_label}</span>
                          )}
                        </td>
                        {responses.map((r) => {
                          const answer = r.answers.find((a) => a.candidate_id === c.id)
                          return (
                            <td key={r.id} className={`py-3 ${isBest ? 'bg-rose-50' : ''}`}>
                              <span className={answerColor(answer?.value)}>
                                {answer?.value ?? '−'}
                              </span>
                              {answer?.value === '-' && answer.note && (
                                <p className="mt-0.5 text-xs text-stone-400">（{answer.note}）</p>
                              )}
                            </td>
                          )
                        })}
                        <td className={`py-3 font-bold ${isBest ? 'bg-rose-50 text-rose-800' : 'text-stone-500'}`}>
                          {columnScores[c.id]}
                          {isBest && <span className="ml-1 text-xs">★</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

          )}
        </div>

      </div>
    </div>
  )
}
