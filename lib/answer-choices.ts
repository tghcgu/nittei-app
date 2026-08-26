import type { AnswerChoiceSet, AnswerValue } from './database.types'

// 主催者がイベント作成時に選ぶ「回答の選択肢」。伝助と同じ3種類。
export const ANSWER_CHOICE_SETS: {
  value: AnswerChoiceSet
  label: string
  values: AnswerValue[]
}[] = [
  { value: '○✕', label: '「○✕」から選択', values: ['○', '✕'] },
  { value: '○△✕', label: '「○△✕」から選択', values: ['○', '△', '✕'] },
  { value: '◎○△✕', label: '「◎○△✕」から選択', values: ['◎', '○', '△', '✕'] },
]

export const DEFAULT_ANSWER_CHOICES: AnswerChoiceSet = '○△✕'

// 「−」（その日の状況をメモする用）はどのセットでも常に使えるようにする
export function answerValuesFor(set: AnswerChoiceSet | null | undefined): AnswerValue[] {
  const found =
    ANSWER_CHOICE_SETS.find((s) => s.value === set) ??
    ANSWER_CHOICE_SETS.find((s) => s.value === DEFAULT_ANSWER_CHOICES)!
  return [...found.values, '-']
}
