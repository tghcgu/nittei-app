import { notFound } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { ResponsePage } from './ResponsePage'
import type { Answer } from '@/lib/database.types'

export default async function Page({
  params,
}: {
  params: Promise<{ shareId: string }>
}) {
  const { shareId } = await params

  // イベントを取得
  const { data: event } = await supabase
    .from('events')
    .select('*')
    .eq('share_id', shareId)
    .single()

  if (!event) notFound()

  // 候補日を取得
  const { data: candidates } = await supabase
    .from('candidates')
    .select('*')
    .eq('event_id', event.id)
    .order('sort_order')

  // 回答者と回答を取得
  const { data: responses } = await supabase
    .from('responses')
    .select('*, answers(*)')
    .eq('event_id', event.id)
    .order('created_at')

  type ResponseWithAnswers = {
    id: string
    event_id: string
    name: string
    note: string | null
    created_at: string
    answers: Answer[]
  }

  return (
    <ResponsePage
      shareId={shareId}
      event={event}
      candidates={candidates ?? []}
      responses={(responses ?? []) as ResponseWithAnswers[]}
    />
  )
}
