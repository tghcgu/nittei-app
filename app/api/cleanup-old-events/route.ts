import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const RETENTION_DAYS = 365
const DELETE_BATCH_SIZE = 200
const MAX_DELETE_BATCHES = 20

let supabaseAdmin: SupabaseClient<Database> | null = null

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not configured')
  if (!serviceRoleKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured')

  if (!supabaseAdmin) {
    supabaseAdmin = createClient<Database>(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
  }

  return supabaseAdmin
}

function cutoffIso(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
}

async function deleteOldEvents() {
  const supabase = getSupabaseAdmin()
  const cutoff = cutoffIso(RETENTION_DAYS)
  let deletedCount = 0
  let batches = 0

  for (; batches < MAX_DELETE_BATCHES; batches++) {
    const { data: oldEvents, error: selectError } = await supabase
      .from('events')
      .select('id')
      .lt('updated_at', cutoff)
      .order('updated_at', { ascending: true })
      .limit(DELETE_BATCH_SIZE)

    if (selectError) throw selectError
    if (!oldEvents || oldEvents.length === 0) break

    const ids = oldEvents.map((event) => event.id)
    const { count, error: deleteError } = await supabase
      .from('events')
      .delete({ count: 'exact' })
      .in('id', ids)
      .lt('updated_at', cutoff)

    if (deleteError) throw deleteError

    deletedCount += count ?? 0

    if (oldEvents.length < DELETE_BATCH_SIZE) break
  }

  return {
    cutoff,
    deletedCount,
    reachedBatchLimit: batches >= MAX_DELETE_BATCHES,
    retentionDays: RETENTION_DAYS,
  }
}

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret) {
    return Response.json(
      { ok: false, error: 'CRON_SECRET is not configured' },
      { status: 500 }
    )
  }

  if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await deleteOldEvents()
    return Response.json({ ok: true, ...result })
  } catch (error) {
    console.error('cleanup-old-events failed', error)
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
