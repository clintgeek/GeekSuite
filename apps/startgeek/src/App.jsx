import { useState, useEffect, useCallback } from 'react'
import { SessionProvider } from './context/SessionContext'
import { GlanceProvider } from './context/GlanceContext'
import { WeatherProvider } from './context/WeatherContext'
import { SettingsProvider } from './context/SettingsContext'
import BackgroundManager from './components/BackgroundManager'
import DateTime from './components/DateTime'
import DayTrack from './components/DayTrack'
import GlanceSummary from './components/GlanceSummary'
import WeatherStrip from './components/WeatherStrip'
import CommandBox from './components/CommandBox'
import ModuleGrid from './components/ModuleGrid'
import AppDock from './components/AppDock'
import SessionButton from './components/SessionButton'
import SettingsSheet from './components/SettingsSheet'

const SlidersIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h12M20 18h0" />
    <circle cx="16" cy="6" r="2" />
    <circle cx="8" cy="12" r="2" />
    <circle cx="18" cy="18" r="2" />
  </svg>
)

const isEditable = (el) =>
  el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)

function Console() {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const closeSettings = useCallback(() => setSettingsOpen(false), [])

  // `,` toggles the settings sheet from anywhere outside a text field.
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key !== ',' || e.ctrlKey || e.altKey || e.metaKey) return
      if (isEditable(e.target)) return
      e.preventDefault()
      setSettingsOpen((v) => !v)
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [])

  return (
    <div className="min-h-screen relative overflow-hidden font-sans">
      <BackgroundManager />

      <main className="relative z-10 max-w-[1280px] mx-auto px-5 sm:px-7 pt-4 pb-32">
        {/* Rail: ambient weather left, session and settings right */}
        <header className="flex items-center justify-between gap-4 pb-3.5 border-b border-hair">
          <WeatherStrip />
          <div className="flex items-center gap-3.5 shrink-0">
            <SessionButton />
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="w-[30px] h-[30px] rounded-lg grid place-items-center text-ink-3 border border-transparent hover:text-ink hover:border-hair-strong hover:bg-panel transition-colors"
              aria-label="Modules and backdrop"
              title="Modules and backdrop  ( , )"
            >
              <SlidersIcon />
            </button>
          </div>
        </header>

        {/* Hero: clock left, day track and summary right */}
        <section className="grid grid-cols-1 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] gap-6 lg:gap-8 items-end pt-10 pb-7">
          <DateTime />
          <div className="flex flex-col gap-3.5 pb-2">
            <DayTrack />
            <GlanceSummary />
          </div>
        </section>

        <CommandBox />

        <ModuleGrid />
      </main>

      <AppDock />
      <SettingsSheet open={settingsOpen} onClose={closeSettings} />
    </div>
  )
}

function App() {
  return (
    <SettingsProvider>
      <SessionProvider>
        <GlanceProvider>
          <WeatherProvider>
            <Console />
          </WeatherProvider>
        </GlanceProvider>
      </SessionProvider>
    </SettingsProvider>
  )
}

export default App
