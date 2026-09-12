import type { CalendarFileReadResult } from './calendar-files'

export type BusyPeriod = { start: Date; end: Date; isAllDay: boolean }
export type CalendarCandidate = { date: string; timeLabel: string | null }
const MAX_OCCURRENCES = 10000

export function candidateTimeRange(date: string, timeLabel: string | null) {
  const start = new Date(`${date}T00:00:00`)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  const match = timeLabel?.match(/(\d{1,2}):(\d{2})[〜~\-](?:(\d{1,2}):(\d{2}))?/)
  if (match) {
    start.setHours(Number(match[1]), Number(match[2]), 0, 0)
    end.setTime(start.getTime())
    if (match[3] !== undefined) {
      end.setHours(Number(match[3]), Number(match[4]), 0, 0)
      if (end <= start) end.setDate(end.getDate() + 1)
    } else {
      end.setHours(end.getHours() + 3)
    }
  }
  return { start, end }
}

export function overlapsCalendar(candidate: CalendarCandidate, periods: BusyPeriod[]) {
  const { start, end } = candidateTimeRange(candidate.date, candidate.timeLabel)
  return periods.some(period => period.start < end && period.end > start)
}

export async function calendarBusyPeriods(files: CalendarFileReadResult, candidates: CalendarCandidate[]) {
  const ICAL = (await import('ical.js')).default
  const bounds = candidates.map(c => candidateTimeRange(c.date, c.timeLabel))
  if (!bounds.length) return []
  const min = Math.min(...bounds.map(b => b.start.getTime())) - 86400000
  const max = Math.max(...bounds.map(b => b.end.getTime())) + 86400000
  const rangeStart = ICAL.Time.fromJSDate(new Date(min), true)
  const rangeEnd = ICAL.Time.fromJSDate(new Date(max), true)
  const periods: BusyPeriod[] = []
  const blocking = (component: InstanceType<typeof ICAL.Component>) =>
    String(component.getFirstPropertyValue('status') ?? '').toUpperCase() !== 'CANCELLED'
    && String(component.getFirstPropertyValue('transp') ?? '').toUpperCase() !== 'TRANSPARENT'

  for (const { text } of files.texts) {
    const components = new ICAL.Component(ICAL.parse(text)).getAllSubcomponents('vevent')
    const masters = new Set(components.filter(c => !c.hasProperty('recurrence-id')).map(c => c.getFirstPropertyValue('uid')))
    for (const component of components) {
      if (!blocking(component)) continue
      const uid = component.getFirstPropertyValue('uid')
      const isException = component.hasProperty('recurrence-id')
      const related = components.filter(c => c.hasProperty('recurrence-id') && c.getFirstPropertyValue('uid') === uid)
      const event = new ICAL.Event(component, {
        exceptions: isException ? [] : related,
      })
      // Explicit moved occurrences may fall inside the range even when their
      // original recurrence dates lie outside it.
      if (isException && masters.has(uid)) {
        periods.push({ start: event.startDate.toJSDate(), end: event.endDate.toJSDate(), isAllDay: event.startDate.isDate })
        continue
      }
      if (!event.isRecurring()) {
        periods.push({ start: event.startDate.toJSDate(), end: event.endDate.toJSDate(), isAllDay: event.startDate.isDate })
        continue
      }
      const expansion = new ICAL.RecurExpansion({ component, dtstart: event.startDate })
      const exceptions = related.map(c => new ICAL.Event(c, { exceptions: [] }))
      let count = 0
      for (let next = expansion.next(); next; next = expansion.next()) {
        if (next.compare(rangeEnd) > 0) break
        if (++count > MAX_OCCURRENCES) throw new Error('CALENDAR_TOO_COMPLEX')
        const exception = exceptions.find(item => item.recurrenceId.compare(next) === 0)
        // Cancelled exceptions can omit DTSTART/DTEND, so check before details.
        if (exception && !blocking(exception.component)) continue
        const detail = event.getOccurrenceDetails(next)
        if (!blocking(detail.item.component) || detail.endDate.compare(rangeStart) <= 0) continue
        periods.push({ start: detail.startDate.toJSDate(), end: detail.endDate.toJSDate(), isAllDay: detail.startDate.isDate })
      }
    }
  }
  return periods
}
