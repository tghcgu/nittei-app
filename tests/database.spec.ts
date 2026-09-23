import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { createTestDatabase } from './database.mjs'

test('scoped access, ownership, atomic writes, retries, and legacy links', async () => {
  const db = await createTestDatabase()
  const eventId = randomUUID()
  const share = 'secure01'
  const owner = 'a'.repeat(64)
  const responder = 'b'.repeat(64)
  const responseId = randomUUID()
  const dates = [{ id: randomUUID(), date: '2026-09-14', time_label: '21:00-22:00' }]
  const asAnon = (headers: Record<string, string>, sql: string, params: unknown[] = []) => db.transaction(async tx => {
    await tx.exec('set local role anon')
    await tx.query("select set_config('request.headers', $1, true)", [JSON.stringify(headers)])
    return tx.query(sql, params)
  })
  const reader = { 'x-nittei-share-id': share }
  const admin = { ...reader, 'x-nittei-edit-token': owner }
  const saveEvent = 'select nittei_save_event($1,$2,$3,$4,$5,$6,$7::jsonb)'
  const eventArgs = [eventId, share, owner, 'Event', null, '○△✕', JSON.stringify(dates)]
  const saveResponse = 'select nittei_save_response($1,$2,$3,$4,$5::jsonb)'
  const answerRows = [{candidate_id: dates[0].id, value: '△', note: null}]
  const responseArgs = [responseId, responder, 'Participant', null, JSON.stringify(answerRows)]
  try {
    await asAnon(admin, saveEvent, eventArgs)
    await asAnon(admin, saveEvent, eventArgs)
    expect((await db.query('select id from events')).rows).toHaveLength(1)
    expect((await asAnon({}, 'select id from events')).rows).toHaveLength(0)
    expect((await asAnon({'x-nittei-share-id':'wrong000'}, 'select id from candidates')).rows).toHaveLength(0)
    expect((await asAnon(reader, 'select id from events')).rows).toHaveLength(1)
    await expect(asAnon(reader, 'select edit_token_hash from events')).rejects.toThrow()
    await expect(asAnon(reader, "update events set name = 'Denied'")).rejects.toThrow()
    await expect(asAnon(reader, saveEvent, eventArgs)).rejects.toThrow('EDIT_FORBIDDEN')

    await expect(asAnon(reader, saveResponse, [...responseArgs.slice(0,4), JSON.stringify([{candidate_id:randomUUID(),value:'○'}])])).rejects.toThrow('INVALID_ANSWER')
    expect((await db.query('select id from responses')).rows).toHaveLength(0)
    await asAnon(reader, saveResponse, responseArgs)
    await asAnon(reader, saveResponse, responseArgs)
    expect((await db.query('select id from responses')).rows).toHaveLength(1)
    expect((await db.query('select id from answers')).rows).toHaveLength(1)
    for (const token of [null, '', 'c'.repeat(64)]) {
      await expect(asAnon(reader, saveResponse, [responseId,token,'Denied',null,JSON.stringify(answerRows)])).rejects.toThrow('EDIT_FORBIDDEN')
      await expect(asAnon(reader, 'select nittei_delete_response($1,$2)', [responseId,token])).rejects.toThrow('EDIT_FORBIDDEN')
    }
    await expect(asAnon(reader, saveResponse, [responseId,responder,'Changed',null,JSON.stringify([{candidate_id:dates[0].id,value:'invalid'}])])).rejects.toThrow('INVALID_ANSWER')
    expect((await db.query<{name: string}>('select name from responses')).rows[0].name).toBe('Participant')
    expect((await db.query<{value: string}>('select value from answers')).rows[0].value).toBe('△')
    await expect(asAnon(admin, saveEvent, [eventId,share,owner,'Changed',null,'○✕',JSON.stringify(dates)])).rejects.toThrow('ANSWER_CHOICES_IN_USE')
    expect((await db.query<{name: string}>('select name from events')).rows[0].name).toBe('Event')

    const [legacy] = (await db.query<{id: string}>("insert into events(share_id,name) values('a3k9x2','Legacy') returning id")).rows
    await asAnon({'x-nittei-share-id':'a3k9x2'}, saveEvent, [legacy.id,'a3k9x2',null,'Legacy edited',null,'○△✕',JSON.stringify([{date:'2026-09-15'}])])
    expect((await asAnon(reader, 'select id from events')).rows).toHaveLength(1)
    await asAnon(admin, 'select nittei_delete_response($1,$2)', [responseId,null])
    expect((await db.query('select id from answers')).rows).toHaveLength(0)
  } finally {
    await db.close()
  }
})
