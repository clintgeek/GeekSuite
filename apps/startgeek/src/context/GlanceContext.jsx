import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { GlanceContext } from './glanceContextValue'
import { useSession } from '../hooks/useSession'
import { gql, UnauthorizedError } from '../lib/graphql'
import { GLANCE_TODAY } from '../lib/queries'
import { INTERVALS } from '../constants'
import { useRefetchOnResume } from '../lib/refetchOnResume'

function todayIso() {
  const d = new Date()
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .split('T')[0]
}

export const GlanceProvider = ({ children }) => {
  const { status, markOut } = useSession()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [loadedAt, setLoadedAt] = useState(null)
  const lastFetchedRef = useRef(0)

  const load = useCallback(
    async (force = false) => {
      if (status !== 'in') return

      const now = Date.now()
      if (!force && now - lastFetchedRef.current < INTERVALS.GLANCE_STALE) {
        return
      }

      setLoading(true)
      setError(null)

      try {
        const result = await gql(GLANCE_TODAY, { date: todayIso() })
        setData(result.glanceToday || null)
        lastFetchedRef.current = Date.now()
        setLoadedAt(lastFetchedRef.current)
      } catch (err) {
        if (err instanceof UnauthorizedError) {
          markOut()
        } else {
          setError(err)
        }
      } finally {
        setLoading(false)
      }
    },
    [status, markOut]
  )

  const refetch = useCallback(() => load(true), [load])

  useEffect(() => {
    if (status !== 'in') {
      setData(null)
      setError(null)
      setLoadedAt(null)
      lastFetchedRef.current = 0
      return
    }
    load(true)
  }, [status, load])

  // Resume, focus, back-forward restore and "online" re-read the day (the
  // suite hook; SUITE_REVIEW_2026-11 §3). The 5-minute poll runs only while
  // the page is visible — it used to run in hidden tabs too, and an installed
  // PWA coming back did not always fire `focus`.
  useRefetchOnResume(refetch, {
    enabled: status === 'in',
    minIntervalMs: INTERVALS.GLANCE_STALE,
    pollMs: INTERVALS.GLANCE_REFRESH,
  })

  // Memoized: every consumer of this context (ModuleGrid, TaskRow, CommandBox)
  // re-rendered on every GlanceProvider render otherwise, including the ones
  // caused by the 60s poll setting `loading` twice.
  const value = useMemo(
    () => ({ data, loading, error, loadedAt, refetch }),
    [data, loading, error, loadedAt, refetch]
  )

  return (
    <GlanceContext.Provider value={value}>
      {children}
    </GlanceContext.Provider>
  )
}
