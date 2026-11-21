// GeekDay fixtures: one believable day (DOCS/GEEKDAY_SPEC.md).
//
// The page asks for a day by its key and the browser's UTC offset, so every
// task here is built FROM the request (`date`, `tzOffsetMinutes`): the list is
// right whatever day and zone the harness runs in.
//
// Modes, keyed on the page URL (the request's frame), so a scene reaches them
// with a plain deep link:
//   ?__fixture=empty    nothing planned, a blank page
//   ?__fixture=error    the gateway refuses every read (tasks and the page)
//   ?__fixture=nosave   reads work; saving the ink page fails
//   ?__fixture=noread   reads work; reading circled handwriting fails
import { json, sessionRoutes, graphqlRoute } from '../../lib/net.mjs';
import { extend as extendWeek } from './fixtures.week.mjs';
import { extend as extendInk } from './fixtures.ink.mjs';

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

const utcMidnight = (key) => new Date(`${key}T00:00:00.000Z`);
/** A date-only due date: UTC midnight of the day, `days` away from `key`. */
const dateOnly = (key, days = 0) => new Date(utcMidnight(key).getTime() + days * DAY_MS).toISOString();
/** A timed due date: `hour:minute` LOCAL on the day, for a browser `offset` minutes west of UTC. */
const timed = (key, offset, hour, minute = 0) =>
  new Date(utcMidnight(key).getTime() + (hour * 60 + minute + offset) * 60000).toISOString();

/** The day's list, as `dailyTasks` answers it: overdue, due that day, undated and done, mixed. */
function dayTasks({ date, tzOffsetMinutes = 0 }) {
  const key = date || new Date().toISOString().slice(0, 10);
  const o = tzOffsetMinutes;
  return [
    { id: 't-bill', content: 'Pay the feed store bill', dueDate: dateOnly(key, -2) },
    { id: 't-coop', content: 'Fix the latch on the coop door before the next cold snap', dueDate: dateOnly(key, -1), priority: 1 },
    { id: 't-standup', content: 'Morning standup', dueDate: timed(key, o, 9), hasDueTime: true, recurrenceRule: 'FREQ=WEEKLY', seriesId: 's-standup' },
    { id: 't-vet', content: 'Call the vet about Pepper', dueDate: timed(key, o, 14), hasDueTime: true },
    { id: 't-dinner', content: 'Dinner with the Hendersons', dueDate: timed(key, o, 18, 30), hasDueTime: true, tags: ['home'] },
    { id: 't-pellets', content: 'Buy layer pellets', dueDate: dateOnly(key), priority: 1 },
    { id: 't-review', content: 'Review the GeekDay tablet layout', dueDate: dateOnly(key), tags: ['geeksuite'] },
    { id: 't-someday', content: 'Order seed catalogues', dueDate: null },
    { id: 't-eggs', content: 'Collect eggs', dueDate: dateOnly(key), status: 'completed', completedAt: timed(key, o, 7, 15) },
  ].map((t) => ({ ...TASK, ...t }));
}

const fixtureOf = (route) => {
  try {
    return new URL(route.request().frame().url()).searchParams.get('__fixture') || '';
  } catch {
    return '';
  }
};

const refuse = (message, code = 'INTERNAL_SERVER_ERROR') => ({ __graphql: { data: null, errors: [{ message, extensions: { code } }] } });

let created = 0;
const byId = (vars, id) => dayTasks(vars).find((t) => t.id === id) || { ...TASK, id, content: 'Task' };

const BASE_OPS = {
  GetDayTasks: (vars, route) => {
    const mode = fixtureOf(route);
    if (mode === 'error') return refuse('upstream unavailable');
    if (mode === 'empty') return { dailyTasks: [] };
    return { dailyTasks: dayTasks(vars) };
  },
  SetDayTaskStatus: ({ id, status }) => {
    const today = new Date().toISOString().slice(0, 10);
    return { updateTaskStatus: { ...byId({ date: today }, id), status, completedAt: status === 'completed' ? new Date().toISOString() : null } };
  },
  MoveDayTask: ({ id, input }) => {
    const today = new Date().toISOString().slice(0, 10);
    const dueDate = input.hasDueTime || !input.dueDate ? input.dueDate : `${String(input.dueDate).slice(0, 10)}T00:00:00.000Z`;
    return { updateTask: { ...byId({ date: today }, id), dueDate, hasDueTime: Boolean(input.hasDueTime) } };
  },
  CreateDayTask: (vars) => {
    created += 1;
    const dateOnlyDue = typeof vars.dueDate === 'string' && vars.dueDate.length === 10;
    return {
      createTask: {
        ...TASK,
        id: `t-new-${created}`,
        content: vars.content,
        signifier: vars.signifier || '*',
        priority: vars.priority ?? null,
        tags: vars.tags || [],
        dueDate: dateOnlyDue ? `${vars.dueDate}T00:00:00.000Z` : vars.dueDate || null,
        hasDueTime: Boolean(vars.hasDueTime),
        createdAt: new Date().toISOString(),
      },
    };
  },
  // A blank page: the day's note is created on the first ink.
  FindDayNote: (_vars, route) => (fixtureOf(route) === 'error' ? refuse('upstream unavailable') : { notes: [] }),
  CreateDayNote: (vars, route) => {
    if (fixtureOf(route) === 'nosave') return refuse('upstream unavailable');
    const now = new Date().toISOString();
    return { createNote: { __typename: 'Note', id: 'note-day', title: vars.title, tags: vars.tags || [], createdAt: now, updatedAt: now } };
  },
  SaveDayNote: ({ id }, route) => {
    if (fixtureOf(route) === 'nosave') return refuse('upstream unavailable');
    return { updateNote: { __typename: 'Note', id, updatedAt: new Date().toISOString() } };
  },
  ReadCircledInk: (_vars, route) => {
    if (fixtureOf(route) === 'noread') return refuse('Handwriting conversion is unavailable right now.', 'AI_UNAVAILABLE');
    return { transcribeSketch: { __typename: 'SketchTranscript', text: '* call vet fri 2pm' } };
  },
};

// The week spread and the ink page add their own stubs; each may wrap a base op.
const withWeek = { ...BASE_OPS, ...extendWeek(BASE_OPS) };
const OPS = { ...withWeek, ...extendInk(withWeek) };

// Shared with the extension modules.
export { TASK, dayTasks, fixtureOf, refuse, dateOnly, timed };

export async function routes(ctx) {
  await sessionRoutes(ctx);
  await ctx.route('**/api/users/bootstrap', (r) =>
    json(r, {
      identity: { username: 'chef', email: 'chef@example.com' },
      profile: { displayName: 'Chef Crocker' },
      preferences: {},
      appPreferences: { geekday: {} },
    })
  );
  // The docked view's weather comes straight from the browser (lib/weather.js):
  // answer it here so a scene never depends on, or calls, the real services.
  await ctx.route('https://ipapi.co/**', (r) => json(r, { latitude: 34.1201, longitude: -93.0532, city: 'Arkadelphia', region: 'Arkansas' }));
  await ctx.route('https://api.open-meteo.com/**', (r) =>
    json(r, { current: { temperature_2m: 63.6, weather_code: 2 }, daily: { temperature_2m_max: [70.3], temperature_2m_min: [47.8] } })
  );
  await graphqlRoute(ctx, OPS);
}
