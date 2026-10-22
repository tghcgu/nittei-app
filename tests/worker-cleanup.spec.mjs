import { expect, test } from '@playwright/test'
import worker from '../custom-worker.mjs'

const env = { SUPABASE_URL: 'https://db.example/', SUPABASE_KEY: 'public-key', SUPABASE_SERVICE_ROLE_KEY: 'secret-key' }

// Replaces fetch while the Worker runs and records what it sends to Supabase.
async function withFakeSupabase(answer, run) {
  const original = globalThis.fetch
  const sent = []
  globalThis.fetch = async (url, init = {}) => {
    sent.push({ url: String(url), method: init.method ?? 'GET', headers: new Headers(init.headers) })
    return answer(String(url), init.method ?? 'GET', sent.length)
  }
  try {
    await run()
  } finally {
    globalThis.fetch = original
  }
  return sent
}

test('the daily cleanup deletes events not updated for 365 days, in batches, with the secret key', async () => {
  const before = Date.now()
  const sent = await withFakeSupabase((url, method) => method === 'GET'
    ? Response.json([{ id: 'a' }, { id: 'b' }])
    : new Response(null, { status: 204, headers: { 'content-range': '*/2' } }), () => worker.scheduled({}, env))
  expect(sent.map(request => request.method)).toEqual(['GET', 'DELETE'])
  const [select, remove] = sent
  const cutoff = new Date(decodeURIComponent(select.url.match(/updated_at=lt\.([^&]+)/)[1])).getTime()
  expect(Math.abs(before - 365 * 24 * 60 * 60 * 1000 - cutoff)).toBeLessThan(60_000)
  expect(select.url).toMatch(/^https:\/\/db\.example\/rest\/v1\/events\?select=id&updated_at=lt\..+&order=updated_at\.asc&limit=200$/)
  // only the selected events, and only if they are still old
  expect(remove.url).toMatch(/^https:\/\/db\.example\/rest\/v1\/events\?id=in\.\(a,b\)&updated_at=lt\./)
  expect(remove.headers.get('prefer')).toContain('count=exact')
  for (const request of sent) {
    expect(request.headers.get('apikey')).toBe('secret-key')
    expect(request.headers.get('authorization')).toBe('Bearer secret-key')
  }
})

test('the daily cleanup keeps going while full batches come back, and stops when nothing is old', async () => {
  const full = Array.from({ length: 200 }, (_, index) => ({ id: `e${index}` }))
  const sent = await withFakeSupabase((url, method, count) => method === 'GET'
    ? Response.json(count === 1 ? full : [])
    : new Response(null, { status: 204, headers: { 'content-range': '*/200' } }), () => worker.scheduled({}, env))
  expect(sent.map(request => request.method)).toEqual(['GET', 'DELETE', 'GET'])
})

test('the daily cleanup fails loudly without the secret key or when Supabase refuses', async () => {
  await expect(worker.scheduled({}, { ...env, SUPABASE_SERVICE_ROLE_KEY: undefined })).rejects.toThrow('SUPABASE_SERVICE_ROLE_KEY')
  await withFakeSupabase(() => new Response('nope', { status: 500 }), async () => {
    await expect(worker.scheduled({}, env)).rejects.toThrow('Supabase 500')
  })
})

test('the Google site verification file is answered by the Worker', async () => {
  const response = await worker.fetch(new Request('https://nitei.pages.dev/googlecc8378481687d5f8.html'), env)
  expect(response.status).toBe(200)
  expect(await response.text()).toBe('google-site-verification: googlecc8378481687d5f8.html')
  expect(response.headers.get('x-frame-options')).toBe('DENY')
})
