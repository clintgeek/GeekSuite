// The switchable modules on the console grid, in render order.
// `auth` modules only appear when signed in. A module with no data stays
// hidden even when switched on.
export const MODULES = [
  { id: 'today',   name: 'Today',   desc: 'Due, overdue, events, completed and blocked counts', auth: true },
  { id: 'habits',  name: 'Habits',  desc: 'Today’s habits with streaks', auth: true },
  { id: 'fitness', name: 'Fitness', desc: 'Calories against goal, meals, streak', auth: true },
  { id: 'notes',   name: 'Notes',   desc: 'Most recent notes with a snippet', auth: true },
  { id: 'reading', name: 'Reading', desc: 'Books on the reading shelf', auth: true },
  { id: 'week',    name: 'Week',    desc: 'Seven-day forecast', auth: false },
]

export const BACKDROPS = ['photo', 'void']
export const CLOCKS = ['12', '24']

export const DEFAULT_SETTINGS = {
  backdrop: 'photo',
  clock: '12',
  modules: Object.fromEntries(MODULES.map((m) => [m.id, true])),
}
