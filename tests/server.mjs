import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { createTestDatabase } from './database.mjs'

// Real PostgreSQL policies/RPCs behind an isolated PostgREST-shaped test endpoint.
// Browser requests use anon; keyless fixture setup is confined to this local server.
const db = await createTestDatabase()
const tables = {
  events: ['id','share_id','name','description','answer_choices','created_at','updated_at','edit_protected'],
  candidates: ['id','event_id','date','time_label','sort_order'],
  responses: ['id','event_id','name','note','created_at','edit_protected'],
  answers: ['id','response_id','candidate_id','value','note'],
}
const rpcs = {
  nittei_can_edit_event: ['target_id'],
  nittei_save_event: ['p_id','p_share_id','p_edit_token','p_name','p_description','p_answer_choices','p_candidates'],
  nittei_save_response: ['p_id','p_edit_token','p_name','p_note','p_answers'],
  nittei_delete_response: ['p_id','p_edit_token'],
}
const normalize = rows => rows.map(row => ({
  ...row, ...(row.date instanceof Date ? { date: row.date.toISOString().slice(0,10) } : {}),
}))
const api = createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, POST, PATCH, DELETE, OPTIONS')
  res.setHeader('Access-Control-Expose-Headers', 'Content-Range')
  if (req.method === 'OPTIONS') { res.writeHead(204).end(); return }
  res.setHeader('Content-Type', 'application/json')
  try {
    const url = new URL(req.url, 'http://localhost')
    const resource = url.pathname.split('/').pop()
    let body = ''
    for await (const chunk of req) body += chunk
    const input = body ? JSON.parse(body) : null
    const result = await db.transaction(async tx => {
      if (req.headers.apikey) {
        await tx.exec('set local role anon')
        await tx.query("select set_config('request.headers', $1, true)", [JSON.stringify(req.headers)])
      }
      if (url.pathname.includes('/rpc/')) {
        if (!Object.hasOwn(rpcs, resource) || req.method !== 'POST') throw new Error('Unknown RPC')
        const args = rpcs[resource]
        const values = args.map(key => ['p_candidates','p_answers'].includes(key) ? JSON.stringify(input[key]) : input[key] ?? null)
        return (await tx.query(`select ${resource}(${args.map((_,i) => '$'+(i+1)).join(',')}) as result`, values)).rows[0].result
      }
      if (!Object.hasOwn(tables, resource)) throw new Error('Unknown table')
      const column = name => {
        if (!tables[resource].includes(name)) throw new Error('Unknown column')
        return '"' + name + '"'
      }
      const values = []
      const filters = []
      for (const [key, value] of url.searchParams) {
        if (['select','order','limit','offset'].includes(key)) continue
        if (value.startsWith('eq.')) {
          values.push(value.slice(3))
          filters.push(`${column(key)} = $${values.length}`)
        } else if (value.startsWith('in.(')) {
          const items = value.slice(4,-1).split(',')
          filters.push(`${column(key)} in (${items.map(item => { values.push(item); return '$'+values.length }).join(',')})`)
        } else throw new Error('Unknown filter')
      }
      const where = filters.length ? ' where '+filters.join(' and ') : ''
      const projection = url.searchParams.get('select') || '*'
      const withAnswers = resource === 'responses' && projection.includes('answers(')
      const selection = projection.replace(/,?\s*answers\([^)]*\)/, '').trim()
      const select = selection === '*' ? tables[resource].map(column).join(',') : selection.split(',').map(s => column(s.trim())).join(',')
      let rows
      if (req.method === 'POST') {
        rows = []
        for (const row of Array.isArray(input) ? input : [input]) {
          const keys = Object.keys(row)
          const inserted = await tx.query(`insert into ${resource}(${keys.map(column).join(',')}) values(${keys.map((_,i) => '$'+(i+1)).join(',')}) returning ${select}`, Object.values(row))
          rows.push(...inserted.rows)
        }
      } else if (req.method === 'PATCH') {
        const setters = Object.entries(input).map(([key,value]) => {
          values.push(value)
          return `${column(key)} = $${values.length}`
        })
        rows = (await tx.query(`update ${resource} set ${setters.join(',')}${where} returning ${select}`, values)).rows
      } else if (req.method === 'DELETE') {
        rows = (await tx.query(`delete from ${resource}${where} returning ${select}`, values)).rows
      } else {
        const order = url.searchParams.get('order')
        const orderBy = order ? ' order by '+column(order.split('.')[0])+(order.endsWith('.desc') ? ' desc' : ' asc') : ''
        rows = (await tx.query(`select ${select} from ${resource}${where}${orderBy}`, values)).rows
      }
      if (withAnswers) for (const row of rows) {
        row.answers = (await tx.query('select id,response_id,candidate_id,value,note from answers where response_id=$1',[row.id])).rows
      }
      return normalize(rows)
    })
    if (Array.isArray(result)) {
      res.setHeader('Content-Range', `0-${Math.max(0,result.length-1)}/${result.length}`)
      const single = req.headers.accept?.includes('application/vnd.pgrst.object+json')
      res.end(req.method === 'HEAD' ? '' : JSON.stringify(single ? result[0] ?? null : result))
    } else res.end(JSON.stringify(result))
  } catch (error) {
    res.writeHead(error.code === '42501' ? 403 : 400)
    res.end(JSON.stringify({ code: error.code ?? 'TEST_API_ERROR', message: error.message }))
  }
})
await new Promise((resolve, reject) => api.listen(54329, '127.0.0.1', resolve).once('error', reject))
const next = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--webpack', '--hostname', '127.0.0.1', '--port', '3100'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    NITTEI_TEST_DIST_DIR: '.next-i18n-tests',
    NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54329',
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'isolated-test-key',
  },
})
const shutdown = () => { next.kill(); api.close(); void db.close() }
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
next.on('exit', code => { api.close(); void db.close(); process.exitCode = code ?? 0 })
