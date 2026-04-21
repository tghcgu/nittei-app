'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// Google OAuth リダイレクトのコールバックページ
// URL hash に access_token が含まれるので sessionStorage に保存して元ページに戻る
export default function GCalCallbackPage() {
  const router = useRouter()

  useEffect(() => {
    const hash = window.location.hash.substring(1)
    const params = new URLSearchParams(hash)
    const token = params.get('access_token')
    const error = params.get('error')
    const shareId = sessionStorage.getItem('gcal_shareId')

    if (token) {
      sessionStorage.setItem('gcal_token', token)
    } else if (error) {
      sessionStorage.setItem('gcal_error', error)
    } else {
      sessionStorage.setItem('gcal_error', 'no_token')
    }

    router.replace(shareId ? `/e/${shareId}` : '/')
  }, [router])

  return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="font-serif text-stone-400">Googleカレンダーと連携中...</p>
    </div>
  )
}
