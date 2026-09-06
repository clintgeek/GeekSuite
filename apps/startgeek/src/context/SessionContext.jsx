import { useState, useEffect, useCallback, useMemo } from 'react'
import { SessionContext } from './sessionContextValue'
import { BASEGEEK, logout } from '../lib/basegeek'

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

  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch(`${BASEGEEK}/api/users/me`, {
          credentials: 'include',
        })
        if (res.ok) {
          const json = await res.json()
          setUser(json.user || null)
          setStatus(json.user ? 'in' : 'out')
        } else {
          markOut()
        }
      } catch {
        markOut()
      }
    }

    check()
  }, [markOut])

  const value = useMemo(
    () => ({ user, status, signOut, markOut }),
    [user, status, signOut, markOut]
  )

  return (
    <SessionContext.Provider value={value}>
      {children}
    </SessionContext.Provider>
  )
}
