import { expect, test } from '@playwright/test'
import { zipSync, strToU8 } from 'fflate'
import { calendarBusyPeriods, firstMatchingValue, overlapsCalendar, overlapsWindow } from '../lib/calendar'
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

test('free-window rules give the first symbol whose time has no overlapping event', () => {
  const busy = (start: string, end: string, isAllDay = false) => ({ start: new Date(start), end: new Date(end), isAllDay })
  // the legend "◎ all day / ○ 20:00-24:00 / △ 23:00-26:00 / ✕ none", written top to bottom
  const rules = [
    { value: '◎', windows: ['allDay' as const] },
    { value: '○', windows: [{ start: '20:00', end: '00:00' }] },
    { value: '△', windows: [{ start: '23:00', end: '02:00' }] },
  ]
  const periods = [
    busy('2026-10-02T10:00:00', '2026-10-02T12:00:00'),
    busy('2026-10-03T19:00:00', '2026-10-03T21:00:00'),
    busy('2026-10-04T22:00:00', '2026-10-04T23:30:00'),
    // a daytime event plus one after midnight leaves 20:00-24:00 free
    busy('2026-10-05T10:00:00', '2026-10-05T12:00:00'),
    busy('2026-10-06T00:30:00', '2026-10-06T01:30:00'),
    // ends exactly when the 20:00 window starts, so it does not overlap it
    busy('2026-10-07T18:00:00', '2026-10-07T20:00:00'),
    busy('2026-10-08T00:00:00', '2026-10-09T00:00:00', true),
  ]
  const pick = (date: string) => firstMatchingValue(date, rules, '✕', periods)
  expect(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08'].map(pick))
    .toEqual(['◎', '○', '△', '✕', '○', '○', '○', '✕'])
  // order decides: the same free date takes whichever rule comes first
  expect(firstMatchingValue('2026-10-01', [...rules].reverse(), '✕', periods)).toBe('△')
  expect(firstMatchingValue('2026-10-01', [], '✕', periods)).toBe('✕')
  // a rule with two times applies when either is free: "△ = the morning or the evening"
  const halfDay = [{ value: '△', windows: [{ start: '10:00', end: '12:00' }, { start: '19:00', end: '21:00' }] }]
  expect(['2026-10-02', '2026-10-03', '2026-10-08'].map(date => firstMatchingValue(date, halfDay, '✕', periods)))
    .toEqual(['△', '△', '✕'])
  // with 'busy', the first rule whose time has an event applies: "✕ busy in the evening, △ busy in the morning"
  const busyRules = [{ value: '✕', windows: [{ start: '19:00', end: '22:00' }] }, { value: '△', windows: [{ start: '10:00', end: '12:00' }] }]
  expect(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-08'].map(date => firstMatchingValue(date, busyRules, '○', periods, 'busy')))
    .toEqual(['○', '△', '✕', '✕'])

  // the single-window check each rule is built on
  const late = { start: '23:00', end: '02:00' }
  expect(['2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06'].map(date => overlapsWindow(date, late, periods)))
    .toEqual([false, true, true, false])
  expect(overlapsWindow('2026-10-01', 'allDay', periods)).toBe(false)
  expect(overlapsWindow('2026-10-08', 'allDay', periods)).toBe(true)
})
