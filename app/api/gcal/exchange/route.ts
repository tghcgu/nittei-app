import { NextResponse } from 'next/server'

type ExchangeRequest = {
  code?: string
  codeVerifier?: string
  redirectUri?: string
}

type GoogleTokenResponse = {
  access_token?: string
  expires_in?: number
  error?: string
  error_description?: string
}

export async function POST(req: Request) {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { error: 'google_oauth_not_configured' },
      { status: 500 }
    )
  }

  let body: ExchangeRequest
  try {
    body = (await req.json()) as ExchangeRequest
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const { code, codeVerifier, redirectUri } = body
  if (!code || !codeVerifier || !redirectUri) {
    return NextResponse.json(
      { error: 'missing_code_or_verifier' },
      { status: 400 }
    )
  }

  const tokenBody = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
    code_verifier: codeVerifier,
  })

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenBody.toString(),
      cache: 'no-store',
    })

    const tokenData = (await tokenRes.json().catch(() => ({}))) as GoogleTokenResponse
    if (!tokenRes.ok || !tokenData.access_token) {
      return NextResponse.json(
        {
          error: tokenData.error ?? 'token_exchange_failed',
          errorDescription: tokenData.error_description ?? null,
        },
        { status: 400 }
      )
    }

    return NextResponse.json(
      {
        accessToken: tokenData.access_token,
        expiresIn: tokenData.expires_in ?? null,
      },
      { status: 200 }
    )
  } catch {
    return NextResponse.json(
      { error: 'token_exchange_request_failed' },
      { status: 502 }
    )
  }
}
