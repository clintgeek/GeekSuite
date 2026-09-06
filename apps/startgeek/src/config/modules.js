// The switchable blocks on the console, in render order.
// `auth` blocks only appear when signed in. A block with no data stays
// hidden even when switched on.
export const MODULES = [
  { id: 'weather', name: 'Weather', desc: 'Today at a glance; click for details and the week', auth: false },
  { id: 'today',   name: 'Tasks',   desc: 'Due today, events, and overdue', auth: true },
  { id: 'calendar', name: 'Calendar', desc: 'Google Calendar agenda feed', auth: true },
  { id: 'fitness', name: 'Fitness', desc: 'Calories against goal, meals, streak', auth: true },
  { id: 'reading', name: 'Reading', desc: 'The book you are on', auth: true },
]

export const BACKDROPS = ['photo', 'void']
export const CLOCKS = ['12', '24']
export const DEFAULT_CALENDAR_COLOR = '#2952A3'

export const DEFAULT_SETTINGS = {
  backdrop: 'photo',
  clock: '12',
  // `??` in the command box asks aiGeek. Opt-in, off until Chef says so.
  ask: false,
  // The morning brief in the hero: three sentences, once a day, after 5am.
  // Same opt-in discipline as `ask` — off until asked for.
  brief: false,
  modules: Object.fromEntries(MODULES.map((m) => [m.id, true])),
  calendars: [],
}
