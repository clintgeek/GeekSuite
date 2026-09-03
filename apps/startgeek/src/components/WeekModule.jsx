import { useWeather } from '../hooks/useWeather'
import Module from './Module'

// Seven-day forecast as hi/lo range bars on one shared temperature scale.
const WeekModule = () => {
  const { local } = useWeather()
  const days = (local.forecast || []).slice(0, 7)
  if (days.length < 2) return null

  const min = Math.min(...days.map((d) => d.lowTemp)) - 3
  const max = Math.max(...days.map((d) => d.highTemp)) + 3
  const pos = (t) => (1 - (t - min) / (max - min)) * 100

  const city = local.current?.location?.split(',')[0]

  return (
    <Module label="Week" count={city ? `${city} · 7 days` : '7 days'} span={12} wide>
      <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
        {days.map((d, i) => {
          const top = pos(d.highTemp)
          const height = pos(d.lowTemp) - top
          const today = i === 0
          return (
            <div
              key={d.date}
              className={`grid gap-1.5 text-center px-1 pt-1.5 pb-0.5 rounded-lg ${
                today ? 'bg-white/[0.03] border border-hair' : ''
              } ${i >= 4 ? 'hidden sm:grid' : ''}`}
              style={{ gridTemplateRows: 'auto auto 1fr auto' }}
            >
              <div className={`font-mono text-[11px] tracking-[0.08em] uppercase ${today ? 'text-accent' : 'text-ink-3'}`}>
                {today ? 'Today' : d.dayName}
              </div>
              <div className="text-[11.5px] text-ink-2 truncate">{d.condition}</div>
              <div className="range">
                <i style={{ top: `${top}%`, height: `${height}%` }} />
              </div>
              <div className="font-mono text-[11px] text-ink-2 tnum">
                <b className="font-medium text-ink">{d.highTemp}</b> / {d.lowTemp}
                {d.precipProbability > 0 && (
                  <span className="ml-1.5 text-[10px] text-sky">{d.precipProbability}%</span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </Module>
  )
}

export default WeekModule
