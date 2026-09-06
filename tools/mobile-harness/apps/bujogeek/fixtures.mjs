// BuJoGeek fixtures (MOBILE_UI_PLAN.md §4 bujogeek, M2).
//
// Every data call goes through /graphql as a named Apollo operation; the
// shared session routes cover the basegeek user-platform bootstrap so a
// missing session never blocks the render.
import { sessionRoutes, graphqlRoute } from '../../lib/net.mjs';

const now = new Date();
const at = (dayOffset, hour = 9, minute = 0) => {
  const d = new Date(now);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
};
const dayKey = (dayOffset) => {
  const d = new Date(now);
  d.setDate(d.getDate() + dayOffset);
  return d.toISOString().slice(0, 10);
};

// ── Fixtures ──────────────────────────────────────────────────────────────
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
  dueDate: at(0, 9),
  originalDate: at(0, 9),
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

// Today's log: a couple carried forward (aging tints), a few live, one done.
export const DAILY = [
  task({ content: 'Call the roofer back about the north valley', dueDate: at(-4, 9), originalDate: at(-4, 9), priority: 1, tags: ['house'] }),
  task({ content: 'Send the quarterly numbers to Dana', dueDate: at(-2, 9), tags: ['work'] }),
  task({ content: 'Write the retro notes', dueDate: at(0, 10, 30), note: 'Three things that worked, one that did not.', tags: ['work'] }),
  task({ content: 'Pick up the dry cleaning', dueDate: at(0, 17), signifier: '@' }),
  task({ content: 'Read a chapter of the Dune reread', dueDate: at(0, 21), signifier: '-', priority: 3, recurrenceRule: 'FREQ=DAILY' }),
  task({ content: 'Book the dentist', dueDate: at(0, 9), status: 'completed', completedAt: at(0, 11) }),
  task({ content: 'Argue with the insurance company', dueDate: at(0, 9), status: 'cancelled', cancelledAt: at(0, 12) }),
];

export const UPCOMING = [
  task({ content: 'Renew the passport', dueDate: at(2, 9), tags: ['admin'] }),
  task({ content: 'Dinner with the Hollands', dueDate: at(4, 19), signifier: '@' }),
  task({ content: 'Quarterly review with Dana', dueDate: at(6, 14), priority: 2, tags: ['work'] }),
];

export const BLOCKED = [
  task({
    content: 'File the permit amendment',
    status: 'blocked',
    blockedReason: 'waiting on the surveyor’s letter',
    blockedAt: at(-6, 10),
    dueDate: at(-1, 9),
    tags: ['house'],
  }),
];

// The month view: everything above plus a scatter across the month, so the
// grid and the phone's week strip both have marks to draw.
export const MONTHLY = [
  ...DAILY,
  ...UPCOMING,
  task({ content: 'Pay the water bill', dueDate: at(-9, 9), tags: ['admin'] }),
  task({ content: 'Service the mower', dueDate: at(-6, 9) }),
  task({ content: 'Draft the offsite agenda', dueDate: at(1, 11), tags: ['work'] }),
  task({ content: 'Swap the winter tyres', dueDate: at(9, 9) }),
  task({ content: 'Mum’s birthday', dueDate: at(12, 9), signifier: '@', priority: 1 }),
  task({ content: 'Close out the invoices', dueDate: at(-13, 9), status: 'completed', completedAt: at(-13, 15) }),
];

export const COLLECTION_TASKS = [
  task({ content: 'The Peripheral — Gibson', dueDate: null, collectionId: 'c1', signifier: '-' }),
  task({ content: 'Piranesi — Clarke', dueDate: null, collectionId: 'c1', signifier: '-', tags: ['fiction'] }),
  task({ content: 'The Dawn of Everything', dueDate: null, collectionId: 'c1', signifier: '-' }),
  task({ content: 'Station Eleven', dueDate: null, collectionId: 'c1', status: 'completed', completedAt: at(-20, 20) }),
];

export const COLLECTIONS = [
  { __typename: 'Collection', id: 'c1', name: 'Books to Read', description: 'The pile, honestly assessed.', archived: false, taskCount: 4, completedCount: 1, createdAt: at(-60, 9), updatedAt: at(-1, 9) },
  { __typename: 'Collection', id: 'c2', name: 'House — spring list', description: null, archived: false, taskCount: 9, completedCount: 4, createdAt: at(-40, 9), updatedAt: at(-2, 9) },
  { __typename: 'Collection', id: 'c3', name: 'Gift ideas', description: 'Before December, ideally.', archived: false, taskCount: 3, completedCount: 0, createdAt: at(-30, 9), updatedAt: at(-5, 9) },
];

export const HABITS = [
  { __typename: 'Habit', id: 'h1', name: 'Morning pages', daysOfWeek: [1, 2, 3, 4, 5], color: '#7A8B5A', archived: false, currentStreak: 6 },
  { __typename: 'Habit', id: 'h2', name: 'Walk the dog', daysOfWeek: [], color: '#B07A3C', archived: false, currentStreak: 21 },
  { __typename: 'Habit', id: 'h3', name: 'No screens after ten', daysOfWeek: [0, 1, 2, 3, 4], color: '#6098CC', archived: false, currentStreak: 2 },
];

export const HABIT_LOGS = [
  { __typename: 'HabitLog', id: 'hl1', habitId: 'h1', date: dayKey(-1) },
  { __typename: 'HabitLog', id: 'hl2', habitId: 'h1', date: dayKey(-2) },
  { __typename: 'HabitLog', id: 'hl3', habitId: 'h2', date: dayKey(0) },
  { __typename: 'HabitLog', id: 'hl4', habitId: 'h2', date: dayKey(-1) },
  { __typename: 'HabitLog', id: 'hl5', habitId: 'h3', date: dayKey(-1) },
];

export const TAGS = [
  { __typename: 'TagCount', tag: 'work', count: 12 },
  { __typename: 'TagCount', tag: 'house', count: 7 },
  { __typename: 'TagCount', tag: 'admin', count: 5 },
  { __typename: 'TagCount', tag: 'fiction', count: 3 },
];

export const TEMPLATES = [
  { __typename: 'Template', id: 'tpl1', name: 'Morning standup', description: 'The three questions.', type: 'daily', content: 'Yesterday: {{yesterday}}\nToday: {{today}}\nBlockers', isDefault: false, isPublic: false, tags: ['work'], variables: [], createdAt: at(-30, 9), updatedAt: at(-30, 9), createdBy: 'u1' },
];

// The AI weekly review draft (DOCS/AI_IDEAS.md #1, Night 2 R114). Opt-in —
// `appPreferences.bujogeek.aiReviewDraft` — so no existing scene renders it;
// used only by scenes.mjs's page-scoped '11-review-draft' scene, which seeds
// the preference and this response through its own `page.route()` overrides
// rather than the context-wide `routes()` below, so the other ten scenes
// (none of which visit /review) are untouched.
export const REVIEW_DRAFT = {
  __typename: 'ReviewDraftResult',
  facts: {
    __typename: 'ReviewFacts',
    weekStart: dayKey(-4),
    weekEnd: dayKey(2),
    counts: { __typename: 'ReviewCounts', completed: 11, carriedForward: 3, blocked: 1, cancelled: 1, created: 14 },
    habits: [
      { __typename: 'ReviewHabitFact', name: 'Morning pages', streak: 6, daysDone: 5, daysScheduled: 5 },
      { __typename: 'ReviewHabitFact', name: 'Walk the dog', streak: 21, daysDone: 7, daysScheduled: 7 },
    ],
    overdue: [
      { __typename: 'ReviewTaskFact', title: 'Call the roofer back about the north valley', collection: null, dueDate: at(-4, 9), daysOverdue: 4 },
    ],
    blocked: [
      { __typename: 'ReviewBlockedFact', title: 'File the permit amendment', collection: 'House — spring list', reason: 'waiting on the surveyor’s letter', blockedSince: at(-6, 10) },
    ],
  },
  draft: {
    __typename: 'ReviewDraft',
    summary: 'You closed out eleven tasks this week and kept both habits alive. The quarterly numbers went out on time, and the house paperwork is the one thread still hanging.',
    wins: ['Sent the quarterly numbers to Dana', 'Kept the morning pages streak alive'],
    carryForward: [
      { __typename: 'ReviewCarryForward', title: 'Call the roofer back about the north valley', reason: 'four days overdue' },
      { __typename: 'ReviewCarryForward', title: 'File the permit amendment', reason: 'still blocked on the surveyor’s letter' },
    ],
    suggestedFocus: 'Close the loop on the house paperwork before it piles up again.',
  },
  provenance: {
    __typename: 'AIProvenance',
    source: 'model', reason: null, model: 'llama-3.1-8b-instant', provider: 'groq', cached: false, callsToday: 1, cap: 10,
  },
};

export const OPS = {
  GetDailyTasks: { dailyTasks: DAILY },
  GetWeeklyTasks: { weeklyTasks: MONTHLY },
  GetMonthlyTasks: { monthlyTasks: MONTHLY },
  GetBlockedTasks: { blockedTasks: BLOCKED },
  GetAllTasks: { allTasks: MONTHLY },
  GetTasks: { tasks: MONTHLY },
  GetTasksByTag: { tasksByTag: MONTHLY.slice(0, 4) },
  GetTaskTags: { taskTags: TAGS },
  GetCollections: { collections: COLLECTIONS },
  GetCollection: {
    collection: { ...COLLECTIONS[0], tasks: COLLECTION_TASKS },
  },
  GetHabits: { habits: HABITS },
  GetHabitLogs: { habitLogs: HABIT_LOGS },
  GetTemplates: { templates: TEMPLATES },
  GetJournalEntries: { journalEntries: [] },
  GetPushVapidKey: { pushVapidKey: null },
};

export async function routes(ctx) {
  await sessionRoutes(ctx);
  await graphqlRoute(ctx, OPS);
}
