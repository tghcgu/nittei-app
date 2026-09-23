import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './database.types'
import { readEditToken } from './edit-keys'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
const browserClients = new Map<string, SupabaseClient<Database>>()

export function eventClient(shareId: string) {
  if (typeof window !== 'undefined' && browserClients.has(shareId)) return browserClients.get(shareId)!
  const client = createClient<Database>(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: `nittei-api-${shareId}` },
    global: {
      headers: { 'x-nittei-share-id': shareId },
      fetch: (input, init) => {
        const headers = new Headers(init?.headers)
        const token = readEditToken('event', shareId)
        if (token) headers.set('x-nittei-edit-token', token)
        return fetch(input, { ...init, headers })
      },
    },
  })
  // Never share request-scoped clients across server renders.
  if (typeof window !== 'undefined') browserClients.set(shareId, client)
  return client
}
