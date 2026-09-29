// BuJoGeek fixtures — Phase 1 "stupid simple" + Red Pen (apps/bujogeek/DOCS/SIMPLE_PLAN.md).
//
// Every view reads one query, GetAllTasks, and slices it (utils/penViews.js),
// so ALL below is the whole corpus: a few carried over, today's list (timed,
// untimed, prioritised, an event), Anytime, the next fortnight, "Later", and a
// few days of Done. One blocked task and one subtask are in it too: those
// screens are gone and they must show as ordinary tasks.
//
// Mutations answer with the task they were asked about, changed, so ticking,
// moving and editing behave on screen as they do against the gateway.
import { sessionRoutes, graphqlRoute, json } from '../../lib/net.mjs';

const now = new Date();
const pad = (n) => String(n).padStart(2, '0');
const localKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const shifted = (dayOffset) => {
  const d = new Date(now);
  d.setDate(d.getDate() + dayOffset);
  return d;
};
// A timed due date: an instant at local hh:mm.
const at = (dayOffset, hour = 9, minute = 0) => {
  const d = shifted(dayOffset);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
};
// A date-only due date: UTC midnight of the LOCAL day (the gateway's rule).
const on = (dayOffset) => `${localKey(shifted(dayOffset))}T00:00:00.000Z`;

let taskSeq = 0;
const task = (over = {}) => ({
  __typename: 'Task',
  id: `t${++taskSeq}`,
  content: 'A task',
  signifier: '*',
  status: 'pending',
  priority: null,
  note: null,
  tags: [],
  dueDate: on(0),
  originalDate: on(0),
  migratedFrom: null,
  migratedTo: null,
  isBacklog: false,
  blockedReason: null,
  blockedAt: null,
  taskType: 'task',
  recurrencePattern: 'none',
  recurrenceRule: null,
  seriesId: null,
  isSeriesMaster: false,
  collectionId: null,
  completedAt: null,
  cancelledAt: null,
  createdAt: at(-3, 8),
  updatedAt: at(0, 8),
  parentTask: null,
  subtasks: [],
  ...over,
});

const done = (dayOffset, hour, over) => task({ status: 'completed', completedAt: at(dayOffset, hour), updatedAt: at(dayOffset, hour), ...over });

export const ALL = [
  // Carried over
  task({ content: 'Call the roofer back about the north valley', dueDate: on(-4), priority: 1, tags: ['house'] }),
  task({ content: 'Send the quarterly numbers to Dana', dueDate: on(-2), tags: ['work'] }),
  // A parked task from the retired Blocked shelf: an ordinary overdue task now.
  task({ content: 'File the permit amendment', status: 'blocked', blockedReason: 'waiting on the surveyor’s letter', blockedAt: at(-6, 10), dueDate: on(-1), tags: ['house'] }),

  // Today
  task({ content: 'Standup with the platform team', dueDate: at(0, 9, 30), signifier: '@', tags: ['work', 'meeting'] }),
  task({ content: 'Review Dana’s PR on the billing export', dueDate: on(0), priority: 1, tags: ['work', 'fd'] }),
  task({ content: 'Write the retro notes', dueDate: at(0, 14), priority: 2, note: 'Three things that worked, one that did not.', tags: ['work'] }),
  task({ content: 'Pick up the dry cleaning', dueDate: on(0) }),
  // The one subtask: shown as an ordinary task.
  task({ content: 'Ask the county about the setback', dueDate: on(0), priority: 3, tags: ['house'], parentTask: { __typename: 'Task', id: 't3', content: 'File the permit amendment', status: 'blocked' } }),
  done(0, 8, { content: 'Book the dentist', dueDate: on(0) }),
  done(0, 10, { content: 'Reply to the offsite thread', dueDate: on(0), tags: ['work'] }),

  // Anytime
  task({ content: 'Sharpen the mower blades', dueDate: null, tags: ['farmLife'] }),
  task({ content: 'Is the camping permit transferable', dueDate: null, signifier: '?', tags: ['camping'] }),
  task({ content: 'Look into pinning container DNS', dueDate: null, priority: 3, tags: ['geekSuite'] }),

  // The next fortnight
  task({ content: 'Draft the offsite agenda', dueDate: at(1, 11), priority: 2, tags: ['work'] }),
  task({ content: 'Renew the passport', dueDate: on(2), tags: ['admin'] }),
  task({ content: 'Dinner with the Hollands', dueDate: at(4, 19), signifier: '@' }),
  task({ content: 'Quarterly review with Dana', dueDate: at(6, 14), priority: 1, tags: ['work', 'manager'] }),
  task({ content: 'Swap the winter tyres', dueDate: on(9) }),
  task({ content: 'Mum’s birthday', dueDate: on(12), signifier: '@', priority: 1 }),

  // Later
  task({ content: 'Order seed potatoes', dueDate: on(25), tags: ['farmLife'] }),
  task({ content: 'File the Q4 estimated tax', dueDate: on(41), priority: 1, tags: ['admin'] }),

  // Done, earlier
  done(-1, 16, { content: 'Ship the invoice export', dueDate: on(-1), tags: ['work', 'fd'] }),
  done(-1, 11, { content: 'Order more chicken feed', dueDate: null, tags: ['farmLife'] }),
  done(-2, 15, { content: 'Close out the invoices', dueDate: on(-2), tags: ['work'] }),
  done(-5, 20, { content: 'Fix the flaky harness scene', dueDate: on(-5), tags: ['geekSuite'] }),
  task({ content: 'Argue with the insurance company', dueDate: on(-3), status: 'cancelled', cancelledAt: at(-3, 12), updatedAt: at(-3, 12) }),
];

export const TAGS = [
  { __typename: 'TagCount', tag: 'work', count: 12 },
  { __typename: 'TagCount', tag: 'house', count: 7 },
  { __typename: 'TagCount', tag: 'admin', count: 5 },
  { __typename: 'TagCount', tag: 'farmLife', count: 3 },
];

// The pins Chef chose, as the bootstrap returns them (appPreferences.bujogeek.pinnedTags).
export const PINNED = ['work', 'house'];

const byId = (id) => ALL.find((t) => t.id === id) || task({ id });

export const OPS = {
  GetAllTasks: { allTasks: ALL },
  GetTaskTags: { taskTags: TAGS },
  GetPushVapidKey: { pushVapidKey: null },
  UpdateTaskStatus: ({ id, status }) => ({
    updateTaskStatus: {
      ...byId(id),
      status,
      completedAt: status === 'completed' ? new Date().toISOString() : null,
      cancelledAt: status === 'cancelled' ? new Date().toISOString() : null,
    },
  }),
  UpdateTask: ({ id, input }) => ({ updateTask: { ...byId(id), ...input } }),
  CreateTask: (vars) => ({ createTask: task({ ...vars, id: `new${++taskSeq}` }) }),
  DeleteTask: () => ({ deleteTask: { __typename: 'DeleteResponse', success: true } }),
};

export async function routes(ctx) {
  await sessionRoutes(ctx);
  await ctx.route('**/api/users/bootstrap', (r) => json(r, {
    identity: { username: 'chef', email: 'chef@example.com' },
    profile: { displayName: 'Chef Crocker' },
    preferences: {},
    appPreferences: { bujogeek: { pinnedTags: PINNED } },
  }));
  await graphqlRoute(ctx, OPS);
}
