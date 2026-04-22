'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

const GCAL_TOKEN_KEY = 'gcal_token'
const GCAL_ERROR_KEY = 'gcal_error'
const GCAL_SHARE_ID_KEY = 'gcal_shareId'
const GCAL_STATE_KEY = 'gcal_oauth_state'
const GCAL_VERIFIER_KEY = 'gcal_pkce_verifier'

export default function GCalCallbackPage() {
  const router = useRouter()

  useEffect(() => {
    const finish = () => {
      const shareId = sessionStorage.getItem(GCAL_SHARE_ID_KEY)
      sessionStorage.removeItem(GCAL_STATE_KEY)
      sessionStorage.removeItem(GCAL_VERIFIER_KEY)
      router.replace(shareId ? `/e/${shareId}` : '/')
    }

    const setErrorAndFinish = (error: string) => {
      sessionStorage.setItem(GCAL_ERROR_KEY, error)
      finish()
    }

    const run = async () => {
      const params = new URLSearchParams(window.location.search)
      const code = params.get('code')
      const state = params.get('state')
      const oauthError = params.get('error')
      const expectedState = sessionStorage.getItem(GCAL_STATE_KEY)
      const codeVerifier = sessionStorage.getItem(GCAL_VERIFIER_KEY)

      if (oauthError) {
        setErrorAndFinish(`oauth_error:${oauthError}`)
        return
      }

      if (!code || !state || !expectedState || state !== expectedState || !codeVerifier) {
        setErrorAndFinish('oauth_invalid_state_or_code')
        return
      }

      try {
        const redirectUri = `${window.location.origin}/auth/gcal`
        const res = await fetch('/api/gcal/exchange', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, codeVerifier, redirectUri }),
        })

        if (!res.ok) {
          const errorBody = await res.json().catch(() => ({ error: 'exchange_failed' }))
          setErrorAndFinish(errorBody.error ?? 'exchange_failed')
          return
        }

        const data = (await res.json()) as { accessToken?: string }
        if (!data.accessToken) {
          setErrorAndFinish('no_access_token')
          return
        }

        sessionStorage.setItem(GCAL_TOKEN_KEY, data.accessToken)
        finish()
      } catch (err) {
        console.error('[GCal] callback exchange error:', err)
        setErrorAndFinish('exchange_request_failed')
      }
    }

    void run()
  }, [router])

  return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="font-serif text-stone-400">Googleカレンダーと連携中...</p>
    </div>
  )
}
