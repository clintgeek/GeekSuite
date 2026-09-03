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
    await logout()
    window.location.reload()
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
