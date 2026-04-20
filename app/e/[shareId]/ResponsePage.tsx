'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import type { Event, Candidate, Answer, AnswerValue } from '@/lib/database.types'

// ---- 型定義 ----
type ResponseWithAnswers = {
  id: string
  event_id: string
  name: string
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
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitSuccess, setSubmitSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tableLayout, setTableLayout] = useState<'h' | 'v'>('h')

  // 列ごとのスコア合計を計算
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setIsSubmitting(true)
    setError(null)

    try {
      // responses テーブルに回答者を保存
      const { data: response, error: responseError } = await supabase
        .from('responses')
        .insert({ event_id: event.id, name })
        .select()
        .single()

      if (responseError) throw responseError

      // answers テーブルに各候補日への回答を保存
      const answerRows = candidates.map((c) => ({
        response_id: response.id,
        candidate_id: c.id,
        value: answers[c.id] ?? '✕' as AnswerValue,
        note: notes[c.id] ?? null,
      }))

      const { error: answersError } = await supabase
        .from('answers')
        .insert(answerRows)

      if (answersError) throw answersError

      // フォームをリセット
      setName('')
      setAnswers({})
      setNotes({})
      setSubmitSuccess(true)

      // テーブルを最新データで更新
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
    <div className="min-h-screen px-4 py-10">
      <div className="mx-auto max-w-2xl">

        {/* 戻るリンク */}
        <Link
          href="/"
          className="mb-8 inline-block text-sm text-stone-400 transition-colors hover:text-rose-700"
        >
          ← 新しいイベントを作る
        </Link>

        {/* イベントヘッダー */}
        <div className="mb-8">
          <h1 className="font-serif text-3xl text-rose-800">{event.name}</h1>
          {event.description && (
            <p className="mt-2 text-stone-600">{event.description}</p>
          )}
          <p className="mt-3 inline-block rounded-lg bg-white/50 px-3 py-2 text-xs text-stone-400">
            共有URL: /e/{shareId}
          </p>
        </div>

        {/* 回答フォーム */}
        <form
          onSubmit={handleSubmit}
          className="mb-8 rounded-2xl bg-white/70 px-8 py-8 shadow-sm backdrop-blur"
        >
          <h2 className="mb-6 font-serif text-xl text-stone-700">回答する</h2>

          {/* 名前 */}
          <div className="mb-7">
            <label className="mb-1 block text-sm font-medium text-stone-700">
              お名前 <span className="text-rose-700">*</span>
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例：山田"
              className="w-full max-w-xs rounded-lg border border-stone-200 bg-white px-4 py-2.5 text-stone-800 placeholder-stone-300 focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100"
            />
          </div>

          {/* 候補日ごとの回答 */}
          <div className="mb-8 space-y-5">
            <div className="mb-1 text-sm font-medium text-stone-700">
              各日程への出欠 <span className="text-rose-700">*</span>
            </div>
            {candidates.map((c) => (
              <div key={c.id}>
                <div className="flex flex-wrap items-center gap-3">
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
                        onClick={() =>
                          setAnswers((prev) => ({ ...prev, [c.id]: opt.value }))
                        }
                        className={`h-10 w-10 rounded-full border-2 text-base transition-all ${
                          answers[c.id] === opt.value ? opt.active : opt.idle
                        }`}
                      >
                        {opt.value === '-' ? '−' : opt.value}
                      </button>
                    ))}
                  </div>
                </div>
                {answers[c.id] === '-' && (
                  <div className="ml-[9.5rem] mt-2">
                    <input
                      type="text"
                      value={notes[c.id] ?? ''}
                      onChange={(e) =>
                        setNotes((prev) => ({ ...prev, [c.id]: e.target.value }))
                      }
                      placeholder="メモ（任意）"
                      className="w-full rounded-lg border border-stone-200 bg-white px-4 py-2 text-sm text-stone-700 placeholder-stone-300 focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100"
                    />
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* エラー・成功メッセージ */}
          {error && (
            <p className="mb-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">
              {error}
            </p>
          )}
          {submitSuccess && (
            <p className="mb-4 rounded-lg bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
              回答を送信しました！ありがとうございます。
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-full bg-rose-800 py-3 text-base font-medium text-white shadow transition-all hover:bg-rose-900 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? '送信中...' : '回答を送信'}
          </button>
        </form>

        {/* 集計テーブル */}
        <div className="rounded-2xl bg-white/70 px-8 py-8 shadow-sm backdrop-blur">
          {/* ヘッダー行：タイトル + 切り替えボタン */}
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

            /* ── 横向きテーブル（デフォルト）：行=回答者、列=候補日 ── */
            <div className="overflow-x-auto">
              <table className="w-full text-center text-sm">
                <thead>
                  <tr>
                    <th className="w-20 pb-4 text-left text-xs font-normal text-stone-400">
                      名前
                    </th>
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
                  </tr>
                </thead>
                <tbody>
                  {responses.map((r) => (
                    <tr key={r.id} className="border-t border-stone-100">
                      <td className="py-3 text-left text-stone-700">{r.name}</td>
                      {candidates.map((c) => {
                        const answer = r.answers.find((a) => a.candidate_id === c.id)
                        return (
                          <td
                            key={c.id}
                            className={`py-3 ${
                              columnScores[c.id] === maxScore && maxScore > 0
                                ? 'bg-rose-50'
                                : ''
                            }`}
                          >
                            <span className={answerColor(answer?.value)}>
                              {answer?.value ?? '−'}
                            </span>
                            {answer?.note && (
                              <p className="mt-0.5 text-xs text-stone-400">
                                （{answer.note}）
                              </p>
                            )}
                          </td>
                        )
                      })}
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
                    <th className="pb-4 text-left text-xs font-normal text-stone-400">
                      候補日
                    </th>
                    {responses.map((r) => (
                      <th
                        key={r.id}
                        className="pb-4 font-normal text-stone-500"
                      >
                        {r.name}
                      </th>
                    ))}
                    <th className="pb-4 text-xs font-normal text-stone-400">
                      スコア
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {candidates.map((c) => {
                    const isBest = columnScores[c.id] === maxScore && maxScore > 0
                    return (
                      <tr key={c.id} className="border-t border-stone-100">
                        {/* 候補日セル */}
                        <td className={`py-3 text-left ${isBest ? 'bg-rose-50' : ''}`}>
                          <span className={`font-serif ${isBest ? 'text-rose-800' : 'text-stone-700'}`}>
                            {formatDate(c.date)}
                          </span>
                          {c.time_label && (
                            <span className="ml-1 text-xs text-stone-400">{c.time_label}</span>
                          )}
                        </td>
                        {/* 各回答者のセル */}
                        {responses.map((r) => {
                          const answer = r.answers.find((a) => a.candidate_id === c.id)
                          return (
                            <td
                              key={r.id}
                              className={`py-3 ${isBest ? 'bg-rose-50' : ''}`}
                            >
                              <span className={answerColor(answer?.value)}>
                                {answer?.value ?? '−'}
                              </span>
                              {answer?.note && (
                                <p className="mt-0.5 text-xs text-stone-400">
                                  （{answer.note}）
                                </p>
                              )}
                            </td>
                          )
                        })}
                        {/* スコアセル */}
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
