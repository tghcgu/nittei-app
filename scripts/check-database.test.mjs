import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkDatabase } from './check-database.mjs'

const config = { url: 'https://database.example', key: 'public-test-key' }
test('read-only deployment check accepts the migrated schema', async () => {
  const calls = []
  await checkDatabase({ ...config, fetchImpl: async (url, options) => {
    calls.push(url.pathname)
    assert.equal(options.method, 'GET')
    assert.deepEqual(options.headers, { apikey: 'public-test-key' })
    return Response.json(url.pathname.includes('/rpc/') ? false : [])
  } })
  assert.equal(calls.length, 5)
})

test('deployment stops on a missing migration, public rows, or missing RPC', async () => {
  await assert.rejects(checkDatabase({ ...config, fetchImpl: async () => new Response('', { status: 400 }) }), /secure-scheduling.sql/)
  for (const table of ['events', 'candidates', 'responses', 'answers']) {
    await assert.rejects(checkDatabase({ ...config, fetchImpl: async url =>
      Response.json(url.pathname.endsWith('/'+table) ? [{ id: 'not-logged' }] : [])
    }), /not restricted/)
  }
  await assert.rejects(checkDatabase({ ...config, fetchImpl: async url =>
    url.pathname.includes('/rpc/') ? new Response('', { status: 404 }) : Response.json([])
  }), /HTTP 404/)
})

test('configuration and transport failures fail closed without exposing secrets', async () => {
  await assert.rejects(checkDatabase({ url: '', key: '' }), /Missing/)
  await assert.rejects(checkDatabase({ ...config, fetchImpl: async () => { throw new Error('sensitive transport detail') } }), error => {
    assert.match(error.message, /could not connect/)
    assert.doesNotMatch(error.message, /sensitive/)
    return true
  })
})
