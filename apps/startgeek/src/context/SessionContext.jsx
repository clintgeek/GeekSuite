import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { SessionContext } from './sessionContextValue'
import { BASEGEEK, logout } from '../lib/basegeek'
import { sessionStatusFor } from '../lib/sessionStatus'
import { useRefetchOnResume } from '../lib/refetchOnResume'

export const SessionProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [status, setStatus] = useState('loading')

  const markOut = useCallback(() => {
    setUser(null)
    setStatus('out')
  }, [])

  const signOut = useCallback(async () => {
    // The reload is what actually ends the session in this tab, so it has to
    // happen whether or not the round-trip to basegeek did. Before this a
    // network failure (or basegeek being down) rejected out of `logout()` and
    // the reload never ran: the Sign out button simply did nothing, and the
    // rejection surfaced as an unhandled promise in the console.
    // Going-over 2026-09-05.
    try {
      await logout()
    } catch {
      // Best effort — the cookies are basegeek's to clear, and a reload with
      // a live cookie lands back signed in, which is the honest outcome.
    } finally {
      window.location.reload()
    }
  }, [])

  // status: 'loading' | 'in' | 'out' | 'error'. 'error' is "couldn't ask"
  // (network, 5xx, AUTH_UNAVAILABLE) — never drawn as signed out (THE_CONTEXT
  // §3.3). It retries on Retry, on resume and when the connection comes back.
  const [checking, setChecking] = useState(false)
  const checkingRef = useRef(false)

  const check = useCallback(async () => {
    if (checkingRef.current) return
    checkingRef.current = true
    setChecking(true)
    let httpStatus = null
    let body = null
    try {
      const res = await fetch(`${BASEGEEK}/api/users/me`, {
        credentials: 'include',
      })
      httpStatus = res.status
      // An OK answer that isn't JSON is a broken proxy, not a signed-out user.
      if (res.ok) {
        body = await res.json().catch(() => {
          httpStatus = null
          return null
        })
      }
    } catch {
      httpStatus = null
    } finally {
      checkingRef.current = false
      setChecking(false)
    }
    const next = sessionStatusFor(httpStatus, body)
    if (next === 'in') {
      setUser(body.user)
      setStatus('in')
    } else if (next === 'out') {
      markOut()
    } else {
      setStatus((prev) => (prev === 'in' ? prev : 'error'))
    }
  }, [markOut])

  useEffect(() => {
    check()
  }, [check])

  useRefetchOnResume(check, { enabled: status === 'error', minIntervalMs: 5000 })

  const value = useMemo(
    () => ({ user, status, checking, signOut, markOut, recheck: check }),
    [user, status, checking, signOut, markOut, check]
  )

  return (
    <SessionContext.Provider value={value}>
      {children}
    </SessionContext.Provider>
  )
}
