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
    .select('id, share_id, name, description, created_at')
    .eq('share_id', shareId)
    .single()

  if (!event) notFound()

  const [{ data: candidates }, { data: responses }] = await Promise.all([
    supabase
      .from('candidates')
      .select('id, event_id, date, time_label, sort_order')
      .eq('event_id', event.id)
      .order('sort_order'),
    supabase
      .from('responses')
      .select('id, event_id, name, note, created_at, answers(id, response_id, candidate_id, value, note)')
      .eq('event_id', event.id)
      .order('created_at'),
  ])

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
