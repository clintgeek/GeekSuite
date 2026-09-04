import { useEffect, useMemo, useState } from 'react'
import Module from './Module'
import { useSettings } from '../hooks/useSettings'
import { useSession } from '../hooks/useSession'
import { gql, UnauthorizedError } from '../lib/graphql'
import { CALENDAR_EVENTS } from '../lib/queries'
import { INTERVALS } from '../constants'

const DAY_MS = 24 * 60 * 60 * 1000

const startOfToday = () => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

const dateKey = (d, isFullDay) =>
  new Date(d).toLocaleDateString('en-US', {
    timeZone: isFullDay ? 'UTC' : undefined,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })

const sameDay = (a, b, aFullDay, bFullDay) => {
  const da = new Date(a)
  const db = new Date(b)
  const useUtc = aFullDay || bFullDay
  const getYear = useUtc ? (d) => d.getUTCFullYear() : (d) => d.getFullYear()
  const getMonth = useUtc ? (d) => d.getUTCMonth() : (d) => d.getMonth()
  const getDate = useUtc ? (d) => d.getUTCDate() : (d) => d.getDate()
  return (
    getYear(da) === getYear(db) &&
    getMonth(da) === getMonth(db) &&
    getDate(da) === getDate(db)
  )
}

const formatTime = (d) =>
  new Date(d).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  })

const formatEventTime = (ev) => {
  if (ev.isFullDay) {
    if (ev.end && !sameDay(ev.start, ev.end, true, true)) {
      return `${dateKey(ev.start, true)} – ${dateKey(ev.end, true)}`
    }
    return 'All day'
  }
  const start = formatTime(ev.start)
  if (!ev.end) return start
  if (sameDay(ev.start, ev.end, false, false)) {
    return `${start} – ${formatTime(ev.end)}`
  }
  return `${dateKey(ev.start)}, ${start} – ${dateKey(ev.end)}, ${formatTime(ev.end)}`
}

const groupEvents = (events) => {
  const groups = new Map()
  for (const ev of events) {
    const key = dateKey(ev.start, ev.isFullDay)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(ev)
  }
  return Array.from(groups.entries())
}

const CalendarModule = () => {
  const { settings } = useSettings()
  const { markOut } = useSession()
  const sources = useMemo(
    () => (settings.calendars || []).filter((c) => c.url).map((c) => ({ url: c.url, color: c.color })),
    [settings.calendars]
  )

  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (sources.length === 0) return

    let cancelled = false
    const fetchEvents = async () => {
      setLoading(true)
      setError(null)
      try {
        const from = startOfToday()
        const to = new Date(from.getTime() + 14 * DAY_MS)
        const data = await gql(CALENDAR_EVENTS, { sources, from, to })
        if (!cancelled) setEvents(data.calendarEvents || [])
      } catch (err) {
        if (err instanceof UnauthorizedError) {
          markOut()
          return
        }
        if (!cancelled) {
          setError(err.message || 'Could not load calendars')
          setEvents([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchEvents()
    const interval = setInterval(fetchEvents, INTERVALS.GLANCE_REFRESH)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [sources, markOut])

  const grouped = useMemo(() => groupEvents(events), [events])

  return (
    <Module label="Calendar" className="mod-calendar" count={events.length || undefined}>
      {sources.length === 0 ? (
        <p className="text-sm text-ink-3">Add an ICS URL in settings to see events.</p>
      ) : loading && events.length === 0 ? (
        <div className="flex-1 min-h-0 space-y-3">
          <div className="h-3 w-20 bg-white/10 rounded animate-pulse" />
          <div className="h-3 w-full bg-white/10 rounded animate-pulse" />
          <div className="h-3 w-4/5 bg-white/10 rounded animate-pulse" />
          <div className="h-3 w-full bg-white/10 rounded animate-pulse" />
        </div>
      ) : error ? (
        <p className="text-sm text-critical">{error}</p>
      ) : events.length === 0 ? (
        <p className="text-sm text-ink-3">No events in the next two weeks.</p>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto -mr-1 pr-1">
          {grouped.map(([date, dayEvents]) => (
            <div key={date} className="mb-3">
              <h4 className="text-[10px] font-medium uppercase tracking-wider text-ink-3 mb-1.5">
                {date}
              </h4>
              <div className="flex flex-col gap-2">
                {dayEvents.map((ev) => (
                  <div key={ev.id} className="flex items-start gap-2.5">
                    <span
                      className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ backgroundColor: ev.color || '#2952A3' }}
                      aria-hidden="true"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] text-ink leading-tight truncate">{ev.summary}</p>
                      <p className="text-[11px] text-ink-3">{formatEventTime(ev)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Module>
  )
}

export default CalendarModule
