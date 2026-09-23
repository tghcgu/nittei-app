const memory = new Map<string, string>()

export function newEditToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), value => value.toString(16).padStart(2, '0')).join('')
}

export function readEditToken(kind: 'event' | 'response', id: string) {
  if (typeof window === 'undefined') return null
  const key = `nittei-${kind}-key-${id}`
  try { return localStorage.getItem(key) ?? memory.get(key) ?? null }
  catch { return memory.get(key) ?? null }
}

export function storeEditToken(kind: 'event' | 'response', id: string, token: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) return
  const key = `nittei-${kind}-key-${id}`
  memory.set(key, token)
  try { localStorage.setItem(key, token) } catch { /* The management URL remains usable. */ }
}
// Keep management secrets out of HTTP requests and subsequent copied share links.
export function consumeEditKey(kind: 'event' | 'response', id: string) {
  const url = new URL(window.location.href)
  const hash = new URLSearchParams(url.hash.slice(1))
  const token = hash.get('key') ?? url.searchParams.get('key')
  if (!token) return
  storeEditToken(kind, id, token)
  hash.delete('key')
  url.searchParams.delete('key')
  url.hash = hash.toString()
  window.history.replaceState(null, '', url)
}
