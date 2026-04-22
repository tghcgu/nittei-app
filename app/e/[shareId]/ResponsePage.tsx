'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
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
const GCAL_TOKEN_KEY = 'gcal_token'
const GCAL_ERROR_KEY = 'gcal_error'
const GCAL_SHARE_ID_KEY = 'gcal_shareId'
const GCAL_STATE_KEY = 'gcal_oauth_state'
const GCAL_VERIFIER_KEY = 'gcal_pkce_verifier'

function base64UrlEncode(bytes: Uint8Array) {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function createRandomUrlSafeString(byteLength: number) {
  const bytes = new Uint8Array(byteLength)
  crypto.getRandomValues(bytes)
  return base64UrlEncode(bytes)
}

async function createCodeChallenge(codeVerifier: string) {
  const encoder = new TextEncoder()
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(codeVerifier))
  return base64UrlEncode(new Uint8Array(digest))
}

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

  // Google Calendar連携
  const [gcalStatus, setGcalStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [gcalMessage, setGcalMessage] = useState('')

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

  // リダイレクト後に sessionStorage からトークンを受け取り FreeBusy を呼ぶ
  const callFreeBusy = useCallback(async (token: string) => {
    setGcalStatus('loading')
    try {
      const sorted = [...candidates].sort((a, b) => a.date.localeCompare(b.date))
      const timeMin = new Date(sorted[0].date + 'T00:00:00').toISOString()
      const timeMax = new Date(sorted[sorted.length - 1].date + 'T23:59:59').toISOString()

      const res = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ timeMin, timeMax, items: [{ id: 'primary' }] }),
      })

      if (!res.ok) {
        const errText = await res.text()
        throw new Error(`FreeBusy API: ${res.status} ${errText}`)
      }

      const data = await res.json()
      const busyPeriods: { start: string; end: string }[] =
        data.calendars?.primary?.busy ?? []

      const newAnswers: Record<string, AnswerValue> = {}
      for (const c of candidates) {
        const { start: cs, end: ce } = parseCandidateTimeRange(c.date, c.time_label)
        const csMs = new Date(cs).getTime()
        const ceMs = new Date(ce).getTime()
        const isBusy = busyPeriods.some((p) => {
          const ps = new Date(p.start).getTime()
          const pe = new Date(p.end).getTime()
          return ps < ceMs && pe > csMs
        })
        newAnswers[c.id] = isBusy ? '✕' : '○'
      }

      setAnswers((prev) => ({ ...prev, ...newAnswers }))
      setGcalStatus('done')
      setGcalMessage('カレンダーを参照してプリセットしました。内容を確認してから送信してください。')
    } catch (err) {
      console.error('[GCal] FreeBusy エラー:', err)
      setGcalStatus('error')
      setGcalMessage('カレンダーの取得中にエラーが発生しました。手動で入力してください。')
    }
  }, [candidates])

  // ページロード時：リダイレクト後のトークンを sessionStorage から受け取る
  useEffect(() => {
    const token = sessionStorage.getItem(GCAL_TOKEN_KEY)
    const error = sessionStorage.getItem(GCAL_ERROR_KEY)
    sessionStorage.removeItem(GCAL_TOKEN_KEY)
    sessionStorage.removeItem(GCAL_ERROR_KEY)
    sessionStorage.removeItem(GCAL_SHARE_ID_KEY)
    sessionStorage.removeItem(GCAL_STATE_KEY)
    sessionStorage.removeItem(GCAL_VERIFIER_KEY)

    if (token) {
      queueMicrotask(() => {
        void callFreeBusy(token)
      })
    } else if (error) {
      queueMicrotask(() => {
        setGcalStatus('error')
        setGcalMessage('Google連携に失敗しました。通常ボタンで再試行するか、手動で入力してください。')
      })
    }
  }, [callFreeBusy])

  // Google OAuth Authorization Code Flow (PKCE, redirect方式)
  async function handleGoogleCalendar() {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
    if (!clientId) {
      setGcalStatus('error')
      setGcalMessage('Google Client IDが設定されていません。管理者にお問い合わせください。')
      return
    }

    try {
      const state = createRandomUrlSafeString(32)
      const codeVerifier = createRandomUrlSafeString(64)
      const codeChallenge = await createCodeChallenge(codeVerifier)

      sessionStorage.setItem(GCAL_SHARE_ID_KEY, shareId)
      sessionStorage.setItem(GCAL_STATE_KEY, state)
      sessionStorage.setItem(GCAL_VERIFIER_KEY, codeVerifier)

      const redirectUri = `${window.location.origin}/auth/gcal`
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'https://www.googleapis.com/auth/calendar.readonly',
        include_granted_scopes: 'true',
        state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
      })

      window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params}`
    } catch (err) {
      console.error('[GCal] OAuth開始エラー:', err)
      setGcalStatus('error')
      setGcalMessage('Google連携の開始に失敗しました。手動で入力してください。')
    }
  }

  // ---- 画像から日程を読み取り ----
  const imageInputRef = useRef<HTMLInputElement>(null)

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    // 同じファイルを再選択できるようリセット
    e.target.value = ''
    if (!file) return

    setGcalStatus('loading')
    setGcalMessage('')

    try {
      // ファイルをBase64に変換
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => {
          const result = reader.result as string
          resolve(result.split(',')[1]) // "data:image/jpeg;base64,..." の後半だけ
        }
        reader.onerror = reject
        reader.readAsDataURL(file)
      })

      const res = await fetch('/api/analyze-calendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64, mimeType: file.type }),
      })

      if (!res.ok) throw new Error(`API error: ${res.status}`)

      const data = await res.json()
      const events: { date: string; startTime: string | null; endTime: string | null }[] =
        data.events ?? []

      // 各候補日について busy/free を判定して○✕をセット
      const newAnswers: Record<string, AnswerValue> = {}
      for (const c of candidates) {
        const { start: cs, end: ce } = parseCandidateTimeRange(c.date, c.time_label)
        const csMs = new Date(cs).getTime()
        const ceMs = new Date(ce).getTime()

        const isBusy = events.some((ev) => {
          if (ev.date !== c.date) return false
          // 時刻不明な終日予定は✕扱い
          if (!ev.startTime) return true
          const evStart = new Date(`${ev.date}T${ev.startTime}:00`).getTime()
          const evEnd = ev.endTime
            ? new Date(`${ev.date}T${ev.endTime}:00`).getTime()
            : evStart + 60 * 60 * 1000
          return evStart < ceMs && evEnd > csMs
        })

        newAnswers[c.id] = isBusy ? '✕' : '○'
      }

      setAnswers((prev) => ({ ...prev, ...newAnswers }))
      setGcalStatus('done')
      setGcalMessage('画像を解析しました。内容を確認してから送信してください。')
    } catch {
      setGcalStatus('error')
      setGcalMessage('読み取りに失敗しました。手動で入力してください。')
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
    setAnswers((prev) => ({ ...prev, [candidateId]: value }))
    // 「-」以外に変更した場合、その候補日の個別メモをクリア
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
          className="mb-8 rounded-2xl bg-white/70 px-6 py-5 shadow-sm backdrop-blur"
        >
          <div className="mb-3 flex items-center justify-between">
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

          {/* 画像から日程を読み取り */}
          <div className="mb-2">
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImageUpload}
            />
            <button
              type="button"
              onClick={() => imageInputRef.current?.click()}
              disabled={gcalStatus === 'loading'}
              className="flex items-center gap-2 rounded-full border border-stone-200 px-4 py-2 text-sm text-stone-600 transition-colors hover:border-rose-300 hover:bg-rose-50 hover:text-rose-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {gcalStatus === 'loading' ? (
                <>
                  <span className="animate-spin">⟳</span>
                  解析中...
                </>
              ) : (
                <>
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/>
                  </svg>
                  画像から読み取り
                </>
              )}
            </button>
            <p className="mt-1 text-xs text-stone-400">
              画像はAIへの送信のみ、保存されません。個人情報にご注意ください。
            </p>
            {gcalStatus === 'done' && (
              <p className="mt-2 rounded-lg bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
                ✓ {gcalMessage}
              </p>
            )}
            {gcalStatus === 'error' && (
              <p className="mt-2 rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-700">
                {gcalMessage}
              </p>
            )}
          </div>

          {/* 範囲で一括回答 */}
          <div className="mb-2">
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
                <div className="flex flex-wrap items-center gap-3 py-0.5">
                  <div className="w-36 shrink-0">
                    <span className="font-serif text-stone-700">{formatDate(c.date)}</span>
                    {c.time_label && (
                      <span className="ml-1 text-sm text-stone-400">{c.time_label}</span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {ANSWER_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => handleAnswerChange(c.id, opt.value)}
                        className={`h-10 w-10 rounded-full border-2 text-base transition-all ${
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
