import { SessionProvider } from './context/SessionContext'
import { GlanceProvider } from './context/GlanceContext'
import { WeatherProvider } from './context/WeatherContext'
import BackgroundManager from './components/BackgroundManager'
import DateTime from './components/DateTime'
import WeatherStrip from './components/WeatherStrip'
import CommandBox from './components/CommandBox'
import GlanceColumn from './components/GlanceColumn'
import AppDock from './components/AppDock'
import SessionButton from './components/SessionButton'

function App() {
  return (
    <SessionProvider>
      <GlanceProvider>
        <WeatherProvider>
          <div className="min-h-screen relative overflow-hidden font-sans">
            <BackgroundManager />
            <div
              className="fixed inset-0 -z-[5] pointer-events-none bg-gradient-to-b from-black/0 via-black/30 to-black/50"
              aria-hidden="true"
            />

            {/* Session + ambient weather — top bar */}
            <div className="fixed top-0 inset-x-0 z-20 pt-5 pb-2 px-6 flex items-start justify-between">
              <div className="w-20" aria-hidden="true" />
              <WeatherStrip />
              <SessionButton />
            </div>

            {/* Hero — Time & Date, upper third */}
            <div className="pt-[16vh] flex flex-col items-center px-6">
              <DateTime />

              {/* Command box slot */}
              <div className="mt-12 w-full max-w-2xl">
                <CommandBox />
              </div>

              {/* Glance column slot */}
              <div className="mt-8 w-full max-w-xl">
                <GlanceColumn />
              </div>
            </div>

            {/* App Dock — fixed bottom */}
            <AppDock />
          </div>
        </WeatherProvider>
      </GlanceProvider>
    </SessionProvider>
  )
}

export default App
