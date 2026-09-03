import { useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useWeather } from '../hooks/useWeather'
import { ANIMATION, REDUCED_MOTION } from '../constants'

const FOCUSABLE =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

const hhmm = (iso) => {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
}

const Detail = ({ k, v }) => (
  <div className="flex flex-col gap-1 min-w-0 border-t border-hair pt-3">
    <span className="font-mono text-[10px] tracking-[0.1em] uppercase text-ink-3">{k}</span>
    <span className="text-[15px] text-ink tnum truncate">{v ?? '--'}</span>
  </div>
)

// Seven days as hi/lo range bars on one shared scale.
const Week = ({ days }) => {
  if (!days || days.length < 2) return null
  const min = Math.min(...days.map((d) => d.lowTemp)) - 3
  const max = Math.max(...days.map((d) => d.highTemp)) + 3
  const pos = (t) => (1 - (t - min) / (max - min)) * 100

  return (
    <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
      {days.map((d, i) => {
        const top = pos(d.highTemp)
        const height = pos(d.lowTemp) - top
        const today = i === 0
        return (
          <div
            key={d.date}
            className={`grid gap-1.5 text-center px-1 pt-1.5 pb-1 rounded-lg ${
              today ? 'bg-white/[0.04] border border-hair' : ''
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
  )
}

// Large modal: today's details, then the week. Focus-trapped, Esc closes.
const WeatherModal = ({ open, onClose }) => {
  const panelRef = useRef(null)
  const { local } = useWeather()
  const { current: w, forecast } = local
  const today = forecast?.[0]

  useEffect(() => {
    if (!open) return
    const panel = panelRef.current
    if (!panel) return
    const focusable = Array.from(panel.querySelectorAll(FOCUSABLE))
    focusable[0]?.focus()

    const handleKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }
      if (e.key !== 'Tab' || focusable.length === 0) return
      const index = focusable.indexOf(document.activeElement)
      e.preventDefault()
      const next = e.shiftKey
        ? index <= 0 ? focusable[focusable.length - 1] : focusable[index - 1]
        : index === focusable.length - 1 ? focusable[0] : focusable[index + 1]
      next.focus()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  const city = w?.location || 'Local'

  return (
    <AnimatePresence>
      {open && w && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: REDUCED_MOTION ? 0 : 0.2 }}
          className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[8vh] pb-8 overflow-y-auto"
          style={{ background: 'rgba(0, 0, 0, 0.55)' }}
          onMouseDown={(e) => {
            if (panelRef.current && !panelRef.current.contains(e.target)) onClose()
          }}
        >
          <motion.section
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={`Weather details for ${city}`}
            initial={REDUCED_MOTION ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: REDUCED_MOTION ? 0 : ANIMATION.FAST, ease: ANIMATION.EASE }}
            className="w-full max-w-3xl rounded-2xl border border-hair-strong p-6 md:p-8"
            style={{
              background: 'rgba(12, 15, 21, 0.94)',
              backdropFilter: 'blur(24px)',
              WebkitBackdropFilter: 'blur(24px)',
            }}
          >
            <div className="flex items-start justify-between gap-4 mb-6">
              <div className="min-w-0">
                <span className="label block">{city}</span>
                <div className="flex items-baseline gap-4 mt-2">
                  <span className="font-extralight leading-none tracking-[-0.03em] tnum text-ink text-[64px]">
                    {w.temperature}°
                  </span>
                  <span className="text-[15px] text-ink-2">{w.description}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="w-8 h-8 rounded-lg grid place-items-center text-ink-3 hover:text-ink hover:bg-panel transition-colors shrink-0"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-5 gap-y-4">
              <Detail k="High / Low" v={today ? `${today.highTemp}° / ${today.lowTemp}°` : null} />
              <Detail k="Feels like" v={Number.isFinite(w.feelsLike) ? `${w.feelsLike}°` : null} />
              <Detail k="Humidity" v={Number.isFinite(w.humidity) ? `${w.humidity}%` : null} />
              <Detail k="Wind" v={Number.isFinite(w.windSpeed) ? `${w.windSpeed} mph` : null} />
              <Detail k="Rain chance" v={Number.isFinite(w.precipitationProbability) ? `${w.precipitationProbability}%` : null} />
              <Detail k="Pressure" v={Number.isFinite(w.pressure) ? `${Math.round(w.pressure)} hPa` : null} />
              <Detail k="Sunrise" v={hhmm(today?.sunrise)} />
              <Detail k="Sunset" v={hhmm(today?.sunset)} />
            </div>

            <div className="mt-8">
              <span className="label block mb-3">Next 7 days</span>
              <Week days={(forecast || []).slice(0, 7)} />
            </div>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export default WeatherModal
