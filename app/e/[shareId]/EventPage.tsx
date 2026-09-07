import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { cache } from 'react'
import { supabase } from '@/lib/supabase'
import { siteDescription, siteName, siteTitle, siteUrl } from '@/lib/site'
import { ResponsePage } from './ResponsePage'
import { localizedPath, type Locale } from '@/lib/i18n'
import { englishDescription, englishTitle } from '@/lib/i18n/metadata'

type Props = {
  params: Promise<{ shareId: string }>
  locale?: Locale
}

const eventSelect = 'id, share_id, name, description, answer_choices, created_at, updated_at'

const getEventByShareId = cache(async (shareId: string) => {
  // 「該当なし」（→404）とDB障害（→エラー）を区別する。
  // maybeSingle は0件のとき error にせず data: null を返す。
  const { data, error } = await supabase
    .from('events')
    .select(eventSelect)
    .eq('share_id', shareId)
    .maybeSingle()

  if (error) throw error
  return data
})

export async function generateEventMetadata({ params, locale = 'ja' }: Props): Promise<Metadata> {
  const { shareId } = await params
  const event = await getEventByShareId(shareId)

  if (!event) {
    return {
      title: {
        absolute: locale === 'en' ? englishTitle : siteTitle,
      },
    }
  }

  const title = `${event.name}-${locale === 'en' ? englishTitle : siteTitle}`
  const description = event.description?.replace(/\s+/g, ' ').trim() || (locale === 'en' ? englishDescription : siteDescription)
  const url = `${siteUrl}${localizedPath(`/e/${shareId}`, locale)}`

  return {
    title: {
      absolute: title,
    },
    description,
    // イベントページには回答者名が載るため検索エンジンに載せない
    // （LINE/Slack等のURLプレビューには影響しない）
    robots: {
      index: false,
      follow: true,
    },
    alternates: {
      canonical: url,
      languages: { ja: `/e/${shareId}`, en: `/en/e/${shareId}` },
    },
    openGraph: {
      title,
      description,
      url,
      siteName: locale === 'en' ? 'Nitteigumi' : siteName,
      locale: locale === 'en' ? 'en_US' : 'ja_JP',
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

  const { data: candidates, error: candidatesError } = await supabase
    .from('candidates')
    .select('id, event_id, date, time_label, sort_order')
    .eq('event_id', event.id)
    .order('sort_order')

  if (candidatesError) throw candidatesError

  return (
    <ResponsePage
      shareId={shareId}
      event={event}
      candidates={candidates ?? []}
      responses={[]}
    />
  )
}
