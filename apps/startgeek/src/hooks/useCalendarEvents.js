import { useEffect, useState, useCallback } from 'react'
import { useSession } from './useSession'
import { gql, UnauthorizedError } from '../lib/graphql'
import { CALENDAR_EVENTS } from '../lib/queries'
import { INTERVALS } from '../constants'

const DAY_MS = 24 * 60 * 60 * 1000
const CACHE_KEY = 'startgeek.calendarCache'
const CACHE_VERSION = 1

const startOfToday = () => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

const sourcesKey = (sources) =>
  JSON.stringify(sources.map((s) => ({ url: s.url, color: s.color })).sort((a, b) => a.url.localeCompare(b.url)))

const loadCache = (sources) => {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed.v !== CACHE_VERSION) return null
    if (sourcesKey(parsed.sources) !== sourcesKey(sources)) return null
    if (Date.now() - parsed.fetchedAt >= INTERVALS.GLANCE_REFRESH) return null
    return { events: parsed.events || [], fetchedAt: parsed.fetchedAt }
  } catch {
    return null
  }
}

const saveCache = (sources, events) => {
  try {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({
        v: CACHE_VERSION,
        sources: sources.map((s) => ({ url: s.url, color: s.color })),
        events,
        fetchedAt: Date.now(),
      })
    )
  } catch {
    // storage unavailable; cache lives for the session
  }
}

export const useCalendarEvents = (sources) => {
  const { markOut } = useSession()
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [visible, setVisible] = useState(!document.hidden)

  useEffect(() => {
    const onVisibility = () => setVisible(!document.hidden)
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  const fetch = useCallback(
    async ({ background = false } = {}) => {
      if (sources.length === 0) {
        setEvents([])
        setError(null)
        setLoading(false)
        return
      }

      if (!background) setLoading(true)
      setError(null)

      try {
        const from = startOfToday()
        const to = new Date(from.getTime() + 14 * DAY_MS)
        const data = await gql(CALENDAR_EVENTS, { sources, from, to })
        const next = data.calendarEvents || []
        setEvents(next)
        saveCache(sources, next)
      } catch (err) {
        if (err instanceof UnauthorizedError) {
          markOut()
          return
        }
        if (!background) setError(err.message || 'Could not load calendars')
      } finally {
        if (!background) setLoading(false)
      }
    },
    [sources, markOut]
  )

  useEffect(() => {
    if (sources.length === 0) {
      setEvents([])
      setError(null)
      setLoading(false)
      return
    }

    const cache = loadCache(sources)
    if (cache) {
      setEvents(cache.events)
    }

    const shouldFetch = !cache || Date.now() - cache.fetchedAt >= INTERVALS.GLANCE_REFRESH

    if (shouldFetch && visible) {
      fetch({ background: !!cache })
    }

    if (!visible) return

    const interval = setInterval(() => {
      if (!document.hidden) {
        fetch({ background: true })
      }
    }, INTERVALS.GLANCE_REFRESH)

    return () => clearInterval(interval)
  }, [sources, visible, fetch])

  return { events, loading, error, refetch: fetch }
}
