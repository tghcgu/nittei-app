import { expect, test } from '@playwright/test'
import { zipSync, strToU8 } from 'fflate'
import { calendarBusyPeriods, overlapsCalendar } from '../lib/calendar'
import { readCalendarFileTexts } from '../lib/calendar-files'

const calendar = (...events: string[]) => ({
  isZip: false, skippedBirthdayNames: [], totalIcsCount: 1,
  texts: [{ name: 'test.ics', text: ['BEGIN:VCALENDAR','VERSION:2.0',...events,'END:VCALENDAR'].join('\r\n') }],
})
const event = (...fields: string[]) => ['BEGIN:VEVENT', ...fields, 'END:VEVENT'].join('\r\n')

test('cancelled recurrence, transparent events, unrelated UIDs, and overnight dates', async () => {
  const candidates = [
    {date:'2026-09-14',timeLabel:'23:00-01:00'},
    {date:'2026-09-15',timeLabel:null},
    {date:'2026-09-16',timeLabel:null},
  ]
  const periods = await calendarBusyPeriods(calendar(
    event('UID:daily','DTSTART;VALUE=DATE:20260914','DTEND;VALUE=DATE:20260915','RRULE:FREQ=DAILY;COUNT=3'),
    event('UID:daily','RECURRENCE-ID;VALUE=DATE:20260915','DTSTART;VALUE=DATE:20260915','DTEND;VALUE=DATE:20260916','STATUS:CANCELLED'),
    event('UID:free','DTSTART;VALUE=DATE:20260915','DTEND;VALUE=DATE:20260916','TRANSP:TRANSPARENT'),
  ), candidates)
  expect(candidates.map(c => overlapsCalendar(c, periods))).toEqual([true,false,true])

  const overnight = await calendarBusyPeriods(calendar(
    event('UID:next-day','DTSTART;VALUE=DATE:20260915','DTEND;VALUE=DATE:20260916'),
  ), candidates)
  expect(overlapsCalendar(candidates[0], overnight)).toBe(true)
  expect(overlapsCalendar({...candidates[0],timeLabel:'21:00-22:00'}, overnight)).toBe(false)
  expect(overlapsCalendar({...candidates[0],timeLabel:'23:00-'}, overnight)).toBe(true)
  expect(overlapsCalendar({...candidates[0],timeLabel:null}, overnight)).toBe(false)

  const unrelated = await calendarBusyPeriods(calendar(
    event('UID:series-a','DTSTART;VALUE=DATE:20260914','DTEND;VALUE=DATE:20260915','RRULE:FREQ=DAILY;COUNT=3'),
    event('UID:series-b','DTSTART;VALUE=DATE:20260914','DTEND;VALUE=DATE:20260915','RRULE:FREQ=DAILY;COUNT=3'),
    event('UID:series-b','RECURRENCE-ID;VALUE=DATE:20260915','DTSTART;VALUE=DATE:20260915','DTEND;VALUE=DATE:20260916','STATUS:CANCELLED'),
  ), candidates)
  expect(overlapsCalendar(candidates[1], unrelated)).toBe(true)
  const missingTimes = await calendarBusyPeriods(calendar(
    event('UID:series','DTSTART;VALUE=DATE:20260914','DTEND;VALUE=DATE:20260915','RRULE:FREQ=DAILY;COUNT=3'),
    event('UID:series','RECURRENCE-ID;VALUE=DATE:20260915','STATUS:CANCELLED'),
  ), candidates)
  expect(overlapsCalendar(candidates[1], missingTimes)).toBe(false)
  const detached = await calendarBusyPeriods(calendar(
    event('UID:detached','RECURRENCE-ID;VALUE=DATE:20260914','DTSTART;VALUE=DATE:20260915','DTEND;VALUE=DATE:20260916'),
  ), candidates)
  expect(overlapsCalendar(candidates[1], detached)).toBe(true)
})

test('calendar file and expanded ZIP limits reject oversized inputs without reading unrelated entries', async () => {
  const file = new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'large.ics')
  await expect(readCalendarFileTexts(file)).rejects.toThrow('CALENDAR_FILE_TOO_LARGE')
  const zipped = zipSync({'large.ics': new Uint8Array(51 * 1024 * 1024)})
  await expect(readCalendarFileTexts(new File([new Uint8Array(zipped)], 'large.zip'))).rejects.toThrow('CALENDAR_FILE_TOO_LARGE')
  const many = Object.fromEntries(Array.from({length:101}, (_,i) => [i+'.ics',strToU8('calendar')]))
  await expect(readCalendarFileTexts(new File([new Uint8Array(zipSync(many))], 'many.zip'))).rejects.toThrow('CALENDAR_FILE_TOO_LARGE')
  const valid = zipSync({'work.ics':strToU8('BEGIN:VCALENDAR'), 'birthday.ics':strToU8('ignored'), 'unrelated.bin':new Uint8Array(51 * 1024 * 1024)})
  const result = await readCalendarFileTexts(new File([new Uint8Array(valid)], 'small.zip'))
  expect(result.texts).toEqual([{name:'work.ics',text:'BEGIN:VCALENDAR'}])
  expect(result.skippedBirthdayNames).toEqual(['birthday.ics'])
})
