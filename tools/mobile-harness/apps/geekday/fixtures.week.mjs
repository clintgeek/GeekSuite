// Extra GraphQL stubs for the week spread (DOCS/GEEKDAY_SPEC.md §6).
// `extend(base)` gets the base OPS (fixtures.mjs) and returns ops to add or
// wrap; later keys win. Nothing is imported from fixtures.mjs (it imports
// this file).
//
// The week page sends `weeklyTasks(date: <Monday>, tzOffsetMinutes)` and
// `dailyTasks(date: <today>, tzOffsetMinutes)`, so every task is built FROM
// the request, as fixtures.mjs does: the week is right whatever day and zone
// the harness runs in. Week task ids start `w-`.
//
// Modes, from the page URL: ?__fixture=empty (nothing anywhere),
// ?__fixture=error (the gateway refuses the reads).

const DAY_MS = 86400000;

const TASK = {
  __typename: 'Task',
  signifier: '*',
  status: 'pending',
  priority: null,
  tags: [],
  dueDate: null,
  hasDueTime: false,
  private: false,
  recurrenceRule: null,
  seriesId: null,
  isSeriesMaster: false,
  completedAt: null,
  cancelledAt: null,
  createdAt: '2026-11-01T15:00:00.000Z',
};

const fixtureOf = (route) => {
  try {
    return new URL(route.request().frame().url()).searchParams.get('__fixture') || '';
  } catch {
    return '';
  }
};
const refuse = (message) => ({ __graphql: { data: null, errors: [{ message, extensions: { code: 'INTERNAL_SERVER_ERROR' } }] } });

const utcMidnight = (key) => new Date(`${key}T00:00:00.000Z`);
const keyPlus = (key, days) => new Date(utcMidnight(key).getTime() + days * DAY_MS).toISOString().slice(0, 10);
const dateOnly = (key, days = 0) => `${keyPlus(key, days)}T00:00:00.000Z`;
const timed = (key, offset, days, hour, minute = 0) =>
  new Date(utcMidnight(keyPlus(key, days)).getTime() + (hour * 60 + minute + offset) * 60000).toISOString();
/** Monday of the week a key falls in (the gateway snaps the same way). */
const mondayOf = (key) => keyPlus(key, -((utcMidnight(key).getUTCDay() + 6) % 7));

/** One week as `weeklyTasks` answers it. `mon` is its Monday; days are offsets from it (0 = Monday). */
function weekTasks({ date, tzOffsetMinutes = 0 }) {
  const mon = mondayOf(date || new Date().toISOString().slice(0, 10));
  const o = tzOffsetMinutes;
  return [
    { id: 'w-standup-0', content: 'Morning standup', dueDate: timed(mon, o, 0, 9), hasDueTime: true, seriesId: 's-standup', recurrenceRule: 'FREQ=WEEKLY' },
    { id: 'w-feed', content: 'Pay the feed store bill', dueDate: dateOnly(mon, 0), status: 'completed', completedAt: timed(mon, o, 0, 16) },
    { id: 'w-seed', content: 'Order seed catalogues for spring', dueDate: dateOnly(mon, 0) },
    { id: 'w-dentist', content: 'Dentist', dueDate: timed(mon, o, 1, 8, 30), hasDueTime: true },
    { id: 'w-coop', content: 'Fix the latch on the coop door before the next cold snap', dueDate: dateOnly(mon, 1), priority: 1 },
    { id: 'w-fence-1', content: 'Walk the north fence line', dueDate: dateOnly(mon, 2) },
    { id: 'w-fence-2', content: 'Call the co-op about T-posts', dueDate: timed(mon, o, 2, 10), hasDueTime: true },
    { id: 'w-fence-3', content: 'Pick up staples and a come-along', dueDate: dateOnly(mon, 2) },
    { id: 'w-fence-4', content: 'Sharpen the chainsaw', dueDate: dateOnly(mon, 2) },
    { id: 'w-fence-5', content: 'Clear the deadfall by the creek gate', dueDate: dateOnly(mon, 2) },
    { id: 'w-fence-6', content: 'Check the charger on the hot wire', dueDate: dateOnly(mon, 2) },
    { id: 'w-fence-7', content: 'Move the heifers to the back pasture', dueDate: dateOnly(mon, 2) },
    { id: 'w-fence-8', content: 'Water the greenhouse starts', dueDate: dateOnly(mon, 2), status: 'completed', completedAt: timed(mon, o, 2, 7) },
    { id: 'w-vet', content: 'Call the vet about Pepper', dueDate: timed(mon, o, 3, 14), hasDueTime: true },
    { id: 'w-pellets', content: 'Buy layer pellets', dueDate: dateOnly(mon, 3), priority: 1 },
    { id: 'w-review', content: 'Review the GeekDay tablet layout', dueDate: dateOnly(mon, 4), tags: ['geeksuite'] },
    { id: 'w-dinner', content: 'Dinner with the Hendersons', dueDate: timed(mon, o, 4, 18, 30), hasDueTime: true },
    { id: 'w-market', content: 'Farmers market, bring the egg cartons', dueDate: timed(mon, o, 5, 7), hasDueTime: true },
    { id: 'w-bread', content: 'Start the sourdough', dueDate: dateOnly(mon, 5) },
  ].map((t) => ({ ...TASK, ...t }));
}

/** What `dailyTasks(today)` adds for the eighth cell: overdue from before this week, and undated. */
function waitingTasks({ date }) {
  const today = date || new Date().toISOString().slice(0, 10);
  const mon = mondayOf(today);
  return [
    { id: 'w-taxes', content: 'File the quarterly estimate', dueDate: dateOnly(mon, -4) },
    { id: 'w-gutter', content: 'Clean the gutters on the barn', dueDate: dateOnly(mon, -9) },
    { id: 'w-someday', content: 'Look into a rain barrel', dueDate: null },
    { id: 'w-book', content: 'Return the library books', dueDate: null },
  ].map((t) => ({ ...TASK, ...t }));
}

const find = (id) => {
  const today = new Date().toISOString().slice(0, 10);
  return [...weekTasks({ date: today }), ...waitingTasks({ date: today })].find((t) => t.id === id) || { ...TASK, id, content: 'Task' };
};

// ── Ink pages: tldraw store snapshots with a few `draw` records ──────────
// A scribble is a zigzag of page points; the page is 1000 units wide.
function scribble(id, x, y, width, bumps) {
  const points = [];
  for (let i = 0; i <= bumps * 2; i += 1) points.push({ x: (width / (bumps * 2)) * i, y: i % 2 ? -18 : 14, z: 0.5 });
  return {
    id: `shape:${id}`,
    typeName: 'shape',
    type: 'draw',
    x,
    y,
    rotation: 0,
    index: 'a1',
    parentId: 'page:page',
    isLocked: false,
    opacity: 1,
    meta: {},
    props: { segments: [{ type: 'free', points }], color: 'black', fill: 'none', dash: 'draw', size: 'm', isComplete: true, isClosed: false, isPen: true, scale: 1 },
  };
}

function inkPage(lines) {
  const store = {
    'document:document': { id: 'document:document', typeName: 'document', gridSize: 10, name: '', meta: {} },
    'page:page': { id: 'page:page', typeName: 'page', name: 'Page 1', index: 'a1', meta: {} },
  };
  lines.forEach(([x, y, width, bumps], i) => {
    const shape = scribble(`s${i}`, x, y, width, bumps);
    store[shape.id] = shape;
  });
  return JSON.stringify({ document: { store, schema: { schemaVersion: 2, sequences: {} } }, session: {} });
}

// Which weekdays (0 = Monday) have a page, and what is on it.
const INK = {
  1: [[90, 110, 420, 7], [90, 220, 640, 10], [90, 330, 300, 5]],
  3: [[120, 90, 700, 12], [120, 200, 520, 9], [120, 310, 610, 10], [120, 420, 260, 4], [520, 560, 330, 6]],
};

function dayNote({ tag }) {
  const key = String(tag || '').replace(/^daily\//, '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return [];
  const weekday = (utcMidnight(key).getUTCDay() + 6) % 7;
  if (!INK[weekday]) return [];
  return [
    {
      __typename: 'Note',
      id: `note-${key}`,
      content: inkPage(INK[weekday]),
      archived: false,
      deletedAt: null,
      createdAt: `${key}T14:00:00.000Z`,
    },
  ];
}

export function extend(base) {
  return {
    GetWeekTasks: (vars, route) => {
      const mode = fixtureOf(route);
      if (mode === 'error') return refuse('upstream unavailable');
      if (mode === 'empty') return { weeklyTasks: [] };
      return { weeklyTasks: weekTasks(vars) };
    },
    GetUnscheduledTasks: (vars, route) => {
      const mode = fixtureOf(route);
      if (mode === 'error') return refuse('upstream unavailable');
      if (mode === 'empty') return { dailyTasks: [] };
      // As the gateway: today's list also holds what is due today, which the week's list has too.
      const today = vars.date || new Date().toISOString().slice(0, 10);
      const dueToday = weekTasks(vars).filter((t) => t.dueDate && t.dueDate.slice(0, 10) === today && !t.hasDueTime);
      return { dailyTasks: [...waitingTasks(vars), ...dueToday] };
    },
    FindWeekDayNote: (vars, route) => {
      const mode = fixtureOf(route);
      if (mode === 'error') return refuse('upstream unavailable');
      if (mode === 'empty') return { notes: [] };
      return { notes: dayNote(vars) };
    },
    // The week's own tasks answer as themselves; anything else is the day page's.
    SetDayTaskStatus: (vars, route) => {
      if (!String(vars.id).startsWith('w-')) return base.SetDayTaskStatus(vars, route);
      return { updateTaskStatus: { ...find(vars.id), status: vars.status, completedAt: vars.status === 'completed' ? new Date().toISOString() : null } };
    },
    MoveDayTask: (vars, route) => {
      if (!String(vars.id).startsWith('w-')) return base.MoveDayTask(vars, route);
      const { input } = vars;
      const dueDate = input.hasDueTime || !input.dueDate ? input.dueDate : `${String(input.dueDate).slice(0, 10)}T00:00:00.000Z`;
      return { updateTask: { ...find(vars.id), dueDate, hasDueTime: Boolean(input.hasDueTime) } };
    },
  };
}
