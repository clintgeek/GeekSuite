import { useState, useEffect, useCallback } from 'react'
import { SessionProvider } from './context/SessionContext'
import { GlanceProvider } from './context/GlanceContext'
import { WeatherProvider } from './context/WeatherContext'
import { SettingsProvider } from './context/SettingsContext'
import { useSettings } from './hooks/useSettings'
import BackgroundManager from './components/BackgroundManager'
import DateTime from './components/DateTime'
import WeatherBlock from './components/WeatherBlock'
import WeatherModal from './components/WeatherModal'
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
  const { settings } = useSettings()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [weatherOpen, setWeatherOpen] = useState(false)
  const closeSettings = useCallback(() => setSettingsOpen(false), [])
  const closeWeather = useCallback(() => setWeatherOpen(false), [])

  // `,` toggles the settings sheet from anywhere outside a text field.
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key !== ',' || e.ctrlKey || e.altKey || e.metaKey) return
      if (isEditable(e.target)) return
      e.preventDefault()
      setWeatherOpen(false)
      setSettingsOpen((v) => !v)
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [])

  const showWeather = settings.modules.weather

  return (
    <div className="min-h-screen relative overflow-hidden font-sans">
      <BackgroundManager />

      <main className="relative z-10 max-w-[1180px] mx-auto px-5 sm:px-7 pt-4 pb-32">
        {/* Rail: session and settings, right-aligned */}
        <header className="flex items-center justify-end gap-3.5 pb-3 border-b border-hair">
          <SessionButton />
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="w-[30px] h-[30px] rounded-lg grid place-items-center text-ink-3 border border-transparent hover:text-ink hover:border-hair-strong hover:bg-panel transition-colors"
            aria-label="Blocks and backdrop"
            title="Blocks and backdrop  ( , )"
          >
            <SlidersIcon />
          </button>
        </header>

        {/* Hero: clock left, today's weather right, same height */}
        <section className={`hero pt-10 pb-5 ${showWeather ? 'with-weather' : ''}`}>
          <div className="flex flex-col justify-end">
            <DateTime />
            <div
              className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] tracking-wide text-ink-2 tnum"
              style={{ textShadow: '0 1px 4px rgba(0,0,0,0.25)' }}
            >
              <span><kbd className="px-1 border border-hair rounded">/</kbd> focus</span>
              <span><kbd className="px-1 border border-hair rounded">Tab</kbd> engine</span>
              <span><kbd className="px-1 border border-hair rounded">Esc</kbd> close</span>
              <span><kbd className="px-1 border border-hair rounded">,</kbd> modules</span>
            </div>
          </div>
          {showWeather && <WeatherBlock onOpen={() => setWeatherOpen(true)} />}
        </section>

        <CommandBox onOpenSettings={() => setSettingsOpen(true)} />

        <ModuleGrid />
      </main>

      <AppDock />
      <SettingsSheet open={settingsOpen} onClose={closeSettings} />
      <WeatherModal open={weatherOpen} onClose={closeWeather} />
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
