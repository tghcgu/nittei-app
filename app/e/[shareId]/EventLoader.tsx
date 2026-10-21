'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import { usePathname } from 'next/navigation'
import NotFoundPage from '@/app/NotFoundPage'
import { useI18n } from '@/app/LocaleProvider'
import { supabase } from '@/lib/supabase'
import { siteTitle } from '@/lib/site'
import { englishTitle } from '@/lib/i18n/metadata'
import type { Candidate, Event } from '@/lib/database.types'
import { ResponsePage } from './ResponsePage'

type EventData = { event: Event; candidates: Candidate[] }

const EMBEDDED_ID = 'nittei-event'
const eventSelect = 'id, share_id, name, description, answer_choices, created_at, updated_at'
const emptySubscribe = () => () => {}

// custom-worker.mjs がページに入れたイベント（<script id="nittei-event" type="application/json">）。
// 毎回同じオブジェクトを返すよう、読んだ結果を覚えておく
let embeddedText: string | null = null
let embeddedData: EventData | null = null
function readEmbedded() {
  const text = document.getElementById(EMBEDDED_ID)?.textContent ?? null
  if (text !== embeddedText) {
    embeddedText = text
    try {
      embeddedData = text ? JSON.parse(text) as EventData : null
    } catch {
      embeddedData = null
    }
  }
  return embeddedData
}

// /e/<共有ID> と /en/e/<共有ID> の最後の部分。このファイルは e/_ として作られるので、URL から読む
function shareIdFrom(pathname: string) {
  const last = pathname.split('/').filter(Boolean).at(-1) ?? ''
  try {
    return decodeURIComponent(last)
  } catch {
    return last
  }
}

export function EventLoader() {
  const { t, locale } = useI18n()
  const shareId = shareIdFrom(usePathname())
  // サーバー（ビルド時）には入っていないので、画面を出すのはブラウザーで読めてから
  const embedded = useSyncExternalStore(emptySubscribe, readEmbedded, () => null)
  const fromPage = embedded?.event.share_id === shareId ? embedded : null
  const [fetched, setFetched] = useState<{ shareId: string; data: EventData | null } | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const mounted = useSyncExternalStore(emptySubscribe, () => true, () => false)

  // ページの中にイベントがないとき（サイトの中を移動してきたときなど）は、ブラウザーから読む
  useEffect(() => {
    if (!mounted || fromPage || fetched?.shareId === shareId) return
    let cancelled = false
    void (async () => {
      try {
        const client = supabase
        const { data: event, error } = await client.from('events').select(eventSelect).eq('share_id', shareId).maybeSingle()
        if (error) throw error
        let candidates: Candidate[] = []
        if (event) {
          const result = await client.from('candidates').select('id, event_id, date, time_label, sort_order').eq('event_id', event.id).order('sort_order')
          if (result.error) throw result.error
          candidates = result.data ?? []
        }
        if (!cancelled) setFetched({ shareId, data: event ? { event, candidates } : null })
      } catch (error) {
        console.error(error)
        if (!cancelled) setFailed(shareId)
      }
    })()
    return () => { cancelled = true }
  }, [mounted, fromPage, fetched, shareId])

  const data = fromPage ?? (fetched?.shareId === shareId ? fetched.data : undefined)
  const eventName = data?.event.name

  // タブのタイトル。ページの <title> は custom-worker.mjs が入れるが、画面を作るときに共通のタイトルに戻るため
  useEffect(() => {
    if (eventName !== undefined) document.title = `${eventName}-${locale === 'en' ? englishTitle : siteTitle}`
  }, [eventName, locale])

  if (data) return <ResponsePage shareId={shareId} event={data.event} candidates={data.candidates} responses={[]} />
  if (data === null) return <NotFoundPage locale={locale} />
  if (failed === shareId) {
    return (
      <div className="min-h-screen px-4 py-6">
        <p className="mx-auto max-w-xl rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-700">{t("イベントを読み込めませんでした。再読み込みしてください。")}</p>
      </div>
    )
  }
  return (
    <div className="min-h-screen px-4 py-6">
      <p className="text-center text-sm text-stone-600" role="status">{mounted ? t("読み込み中...") : ''}</p>
    </div>
  )
}
