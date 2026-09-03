import Module from './Module'
import { useSettings } from '../hooks/useSettings'

const buildCalendarUrl = (calendars) => {
  const params = new URLSearchParams()
  params.set('mode', 'AGENDA')
  params.set('showTitle', '0')
  params.set('showNav', '0')
  params.set('showDate', '0')
  params.set('showPrint', '0')
  params.set('showTabs', '0')
  params.set('showCalendars', '0')
  params.set('showTz', '0')
  params.set('wkst', '1')
  params.set('hl', 'en')
  params.set('bgcolor', '#0a0d12')
  params.set('ctz', Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Los_Angeles')

  calendars.forEach((cal) => {
    if (!cal.id) return
    params.append('src', cal.id)
    params.append('color', cal.color || '#2952A3')
  })

  return `https://calendar.google.com/calendar/embed?${params.toString()}`
}

const CalendarModule = () => {
  const { settings } = useSettings()
  const activeCalendars = (settings.calendars || []).filter((cal) => cal.id)
  const src = activeCalendars.length > 0 ? buildCalendarUrl(activeCalendars) : null

  return (
    <Module
      label="Calendar"
      className="mod-calendar"
      link={{ label: 'Google Calendar', href: 'https://calendar.google.com' }}
    >
      {src ? (
        <div className="flex-1 min-h-0 w-full rounded-lg overflow-hidden">
          <iframe
            src={src}
            title="Google Calendar"
            className="w-full h-full border-0"
            style={{ minHeight: '240px' }}
          />
        </div>
      ) : (
        <p className="text-sm text-ink-3">
          Add a Google Calendar ID in settings to see your agenda here.
        </p>
      )}
    </Module>
  )
}

export default CalendarModule
