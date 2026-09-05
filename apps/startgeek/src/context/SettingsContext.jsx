import { useState, useEffect, useCallback, useMemo } from 'react'
import { SettingsContext } from './settingsContextValue'
import { DEFAULT_SETTINGS, BACKDROPS, CLOCKS } from '../config/modules'

// Per-browser console settings, stored the same way the search engine
// choice is (localStorage, no backend). Same key shape as the mockup.
const STORAGE_KEY = 'startgeek.settings'

const clone = (v) => JSON.parse(JSON.stringify(v))

const load = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return clone(DEFAULT_SETTINGS)
    const saved = JSON.parse(raw)
    const calendars = Array.isArray(saved.calendars)
      ? clone(saved.calendars).map((c) => ({ ...c, url: c.url || c.id || '' }))
      : clone(DEFAULT_SETTINGS.calendars)
    return {
      backdrop: BACKDROPS.includes(saved.backdrop) ? saved.backdrop : DEFAULT_SETTINGS.backdrop,
      clock: CLOCKS.includes(saved.clock) ? saved.clock : DEFAULT_SETTINGS.clock,
      modules: { ...DEFAULT_SETTINGS.modules, ...(saved.modules || {}) },
      ask: typeof saved.ask === 'boolean' ? saved.ask : DEFAULT_SETTINGS.ask,
      calendars,
    }
  } catch {
    return clone(DEFAULT_SETTINGS)
  }
}

export const SettingsProvider = ({ children }) => {
  const [settings, setSettings] = useState(load)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
    } catch {
      // storage unavailable; settings live for the session only
    }
  }, [settings])

  const setBackdrop = useCallback((backdrop) => {
    if (!BACKDROPS.includes(backdrop)) return
    setSettings((s) => ({ ...s, backdrop }))
  }, [])

  const setClock = useCallback((clock) => {
    if (!CLOCKS.includes(clock)) return
    setSettings((s) => ({ ...s, clock }))
  }, [])

  const toggleModule = useCallback((id) => {
    setSettings((s) => ({
      ...s,
      modules: { ...s.modules, [id]: !s.modules[id] },
    }))
  }, [])

  const toggleAsk = useCallback(() => {
    setSettings((s) => ({ ...s, ask: !s.ask }))
  }, [])

  const setCalendars = useCallback((updater) => {
    setSettings((s) => ({
      ...s,
      calendars: typeof updater === 'function' ? updater(s.calendars) : updater,
    }))
  }, [])

  const reset = useCallback(() => setSettings(clone(DEFAULT_SETTINGS)), [])

  const value = useMemo(
    () => ({ settings, setBackdrop, setClock, toggleModule, toggleAsk, setCalendars, reset }),
    [settings, setBackdrop, setClock, toggleModule, toggleAsk, setCalendars, reset]
  )

  return (
    <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
  )
}
