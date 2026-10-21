import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { rmSync } from 'node:fs'

// Isolated PostgREST fixture: no test request can reach the real Supabase project.
const db = { events: [], candidates: [], responses: [], answers: [] }
const api = createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, POST, PATCH, DELETE, OPTIONS')
  res.setHeader('Access-Control-Expose-Headers', 'Content-Range')
  if (req.method === 'OPTIONS') { res.writeHead(204).end(); return }
  const url = new URL(req.url, 'http://localhost')
  const table = url.pathname.split('/').pop()
  if (!Object.hasOwn(db, table)) { res.writeHead(404).end(); return }
  let body = ''
  for await (const chunk of req) body += chunk
  const input = body ? JSON.parse(body) : null
  const matches = row => [...url.searchParams].every(([key, value]) => {
    if (value.startsWith('eq.')) return String(row[key]) === value.slice(3)
    if (value.startsWith('in.(')) return value.slice(4, -1).split(',').includes(String(row[key]))
    return true
  })
  let rows = db[table].filter(matches)
  if (req.method === 'POST') {
    const incoming = Array.isArray(input) ? input : [input]
    const merging = req.headers.prefer?.includes('resolution=merge-duplicates')
    if (!merging && incoming.some(row => row.id && db[table].some(saved => saved.id === row.id))) {
      res.writeHead(409, { 'Content-Type': 'application/json' }).end(JSON.stringify({ code: '23505' }))
      return
    }
    rows = incoming.map(row => {
      const existing = row.id && db[table].find(saved => saved.id === row.id)
      if (existing) return Object.assign(existing, row)
      const created = { id: randomUUID(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...row }
      db[table].push(created)
      return created
    })
  } else if (req.method === 'PATCH') {
    rows.forEach(row => Object.assign(row, input, { updated_at: new Date().toISOString() }))
  } else if (req.method === 'DELETE') {
    db[table] = db[table].filter(row => !matches(row))
    if (table === 'responses') db.answers = db.answers.filter(a => !rows.some(r => r.id === a.response_id))
  }
  const order = url.searchParams.get('order')?.split('.')[0]
  if (order) rows.sort((a, b) => String(a[order]).localeCompare(String(b[order]), 'en', { numeric: true }))
  if (table === 'responses' && url.searchParams.get('select')?.includes('answers')) {
    rows = rows.map(row => ({ ...row, answers: db.answers.filter(a => a.response_id === row.id) }))
  }
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Content-Range', `0-${Math.max(0, rows.length - 1)}/${rows.length}`)
  const single = req.headers.accept?.includes('application/vnd.pgrst.object+json')
  res.end(req.method === 'HEAD' ? '' : JSON.stringify(single ? rows[0] ?? null : rows))
})
await new Promise((resolve, reject) => api.listen(54329, '127.0.0.1', resolve).once('error', reject))

// The site is tested the way it runs in production: built as files (output: 'export') against the test
// database, then served by the same Worker (custom-worker.mjs) on wrangler's local runtime.
const testDatabase = 'http://127.0.0.1:54329'
const testKey = 'isolated-test-key'
const exportDir = '.next-i18n-tests'
const run = (args, env) => new Promise((resolve, reject) => {
  spawn(process.execPath, args, { stdio: 'inherit', env }).on('exit', code => code === 0 ? resolve() : reject(new Error(`${args[0]} exited with ${code}`)))
})
let worker = null
const shutdown = () => { worker?.kill(); api.close() }
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
try {
  // start from an empty folder: files from older builds (or the former dev server) can break the type check
  rmSync(exportDir, { recursive: true, force: true })
  await run(['node_modules/next/dist/bin/next', 'build', '--webpack'], {
    ...process.env,
    NITTEI_TEST_DIST_DIR: exportDir,
    NEXT_PUBLIC_SUPABASE_URL: testDatabase,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: testKey,
  })
  await run(['scripts/finish-export.mjs', exportDir], process.env)
} catch (error) {
  console.error(error)
  shutdown()
  process.exit(1)
}
worker = spawn(process.execPath, [
  'node_modules/wrangler/bin/wrangler.js', 'dev', '--config', 'wrangler.test.jsonc',
  '--ip', '127.0.0.1', '--port', '3100', '--show-interactive-dev-session=false',
  '--var', `SUPABASE_URL:${testDatabase}`, '--var', `SUPABASE_KEY:${testKey}`,
], { stdio: 'inherit', env: process.env })
worker.on('exit', code => { api.close(); process.exitCode = code ?? 0 })
