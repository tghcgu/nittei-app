import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { cache } from 'react'
import { supabase } from '@/lib/supabase'
import { siteDescription, siteName, siteTitle, siteUrl } from '@/lib/site'
import { ResponsePage } from './ResponsePage'

type Props = {
  params: Promise<{ shareId: string }>
}

const eventSelect = 'id, share_id, name, description, created_at'

const getEventByShareId = cache(async (shareId: string) => {
  const { data } = await supabase
    .from('events')
    .select(eventSelect)
    .eq('share_id', shareId)
    .single()

  return data
})

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { shareId } = await params
  const event = await getEventByShareId(shareId)

  if (!event) {
    return {
      title: {
        absolute: siteTitle,
      },
    }
  }

  const title = `${event.name}-${siteTitle}`
  const description = event.description?.replace(/\s+/g, ' ').trim() || siteDescription
  const url = `${siteUrl}/e/${shareId}`

  return {
    title: {
      absolute: title,
    },
    description,
    alternates: {
      canonical: url,
    },
    openGraph: {
      title,
      description,
      url,
      siteName,
      locale: 'ja_JP',
      type: 'website',
    },
    twitter: {
      card: 'summary',
      title,
      description,
    },
  }
}

export default async function Page({
  params,
}: Props) {
  const { shareId } = await params

  // イベントを取得
  const event = await getEventByShareId(shareId)

  if (!event) notFound()

  const { data: candidates } = await supabase
    .from('candidates')
    .select('id, event_id, date, time_label, sort_order')
    .eq('event_id', event.id)
    .order('sort_order')

  return (
    <ResponsePage
      shareId={shareId}
      event={event}
      candidates={candidates ?? []}
      responses={[]}
    />
  )
}
