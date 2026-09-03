import { WeatherProvider } from './context/WeatherContext'
import BackgroundManager from './components/BackgroundManager'
import DateTime from './components/DateTime'
import WeatherStrip from './components/WeatherStrip'
import AppDock from './components/AppDock'

function App() {
  return (
    <WeatherProvider>
      <div className="min-h-screen relative overflow-hidden font-sans">
        <BackgroundManager />

        {/* Ambient Weather — top center */}
        <div className="fixed top-0 inset-x-0 z-10 pt-5 pb-2 px-6">
          <WeatherStrip />
        </div>

        {/* Hero — Time & Date, vertically centered */}
        <div className="min-h-screen flex items-center justify-center px-6">
          <DateTime />
        </div>

        {/* App Dock — fixed bottom */}
        <AppDock />
      </div>
    </WeatherProvider>
  )
}

export default App
