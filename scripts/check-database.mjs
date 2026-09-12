import { pathToFileURL } from 'node:url'

export async function checkDatabase({ url, key, fetchImpl = fetch }) {
  if (!url || !key) throw new Error('Missing public Supabase configuration.')
  const base = new URL('/rest/v1/', url)
  async function read(resource) {
    let response
    try {
      response = await fetchImpl(new URL(resource, base), {
        method: 'GET', headers: { apikey: key }, signal: AbortSignal.timeout(10000),
      })
    } catch {
      throw new Error('Database compatibility check could not connect. Deployment stopped.')
    }
    if (!response.ok) throw new Error(`Database compatibility check failed (HTTP ${response.status}). Apply secure-scheduling.sql with the matching application.`)
    return response.json()
  }

  // No share ID or edit key is sent; these reads must expose no records.
  for (const table of ['events', 'candidates', 'responses', 'answers']) {
    const columns = ['events', 'responses'].includes(table) ? 'id,edit_protected' : 'id'
    const rows = await read(`${table}?select=${columns}&limit=1`)
    if (!Array.isArray(rows) || rows.length !== 0) {
      throw new Error(`Unscoped ${table} reads are not restricted. Deployment stopped.`)
    }
  }
  const allowed = await read('rpc/nittei_can_edit_event?target_id=00000000-0000-0000-0000-000000000000')
  if (allowed !== false) throw new Error('Edit permission check returned an unexpected result. Deployment stopped.')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { default: env } = await import('@next/env')
  env.loadEnvConfig(process.cwd(), false, { info() {}, error() {} })
  try {
    await checkDatabase({ url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY })
    console.log('Database read compatibility verified. No data was changed.')
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Database compatibility check failed.')
    console.error('See SECURE-ROLLOUT.md. Do not deploy main to the legacy database.')
    process.exitCode = 1
  }
}
