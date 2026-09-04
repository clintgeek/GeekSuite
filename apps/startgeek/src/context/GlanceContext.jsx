import { useState, useEffect, useCallback, useRef } from 'react'
import { GlanceContext } from './glanceContextValue'
import { useSession } from '../hooks/useSession'
import { gql, UnauthorizedError } from '../lib/graphql'
import { GLANCE_TODAY } from '../lib/queries'
import { INTERVALS } from '../constants'

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
  const lastFetchedRef = useRef(0)
  const intervalRef = useRef(null)

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
      lastFetchedRef.current = 0
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      return
    }

    load(true)

    intervalRef.current = setInterval(() => {
      load(true)
    }, INTERVALS.GLANCE_REFRESH)

    const handleWindowFocus = () => {
      if (document.visibilityState !== 'hidden' && Date.now() - lastFetchedRef.current > INTERVALS.GLANCE_STALE) {
        load(true)
      }
    }

    window.addEventListener('focus', handleWindowFocus)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      window.removeEventListener('focus', handleWindowFocus)
    }
  }, [status, load])

  const value = { data, loading, error, refetch }

  return (
    <GlanceContext.Provider value={value}>
      {children}
    </GlanceContext.Provider>
  )
}
