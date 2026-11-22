/**
 * Note templates (DOCS/TEMPLATES_SPEC.md N1–N4): a new note that starts with
 * a title, tags and headings instead of a blank page.
 *
 * Pure data and string building — no React, no storage, no network. The New
 * surfaces list these (components/new/TemplateList.jsx) and link to
 * `/notes/new?template=<id>`; the editor seeds its form from
 * `buildNoteFromTemplate` exactly as it seeds `?title=`: on screen, NOT
 * dirty, so nothing is created or drafted until the writer edits or saves.
 *
 * Every template is a Markdown note. Markdown is the app's default new note,
 * its source is a plain textarea (a template is readable and editable as it
 * stands), and its preview renders everything used here through remark-gfm:
 * headings, bullet and numbered lists, `- [ ]` task boxes and tables. Rich
 * text is TipTap HTML and is no longer offered as a new type.
 *
 * Rules for a body, held by `__tests__/utils/noteTemplates.test.jsx`:
 *   - only headings, lists, task boxes, bold and (once) a table;
 *   - a task box always has words after it: `- [ ] ` on its own is not a
 *     task item in GFM and would print the brackets;
 *   - no `#word` anywhere: the save reads those as inline tags.
 *
 * Dates (N4) are the LOCAL calendar day the template was opened, read from
 * the Date's own local fields — the same rule as `localDateString` in
 * `@geeksuite/utils`, which this app does not depend on. Never
 * `toISOString()`: at 11 pm in Chicago that is already tomorrow.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const asDate = (now) => (now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date());

/** "Nov 20, 2026" — the local calendar day of `now`. */
export function templateDay(now = new Date()) {
  const d = asDate(now);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

/** The Monday of `now`'s local week, as "Nov 16, 2026". */
export function templateWeekStart(now = new Date()) {
  const d = asDate(now);
  const sinceMonday = (d.getDay() + 6) % 7;
  // Local fields in, local fields out: the Date constructor rolls a day of
  // the month below 1 into the month before, and no DST shift can move noon.
  return templateDay(new Date(d.getFullYear(), d.getMonth(), d.getDate() - sinceMonday, 12));
}

const lines = (...rows) => `${rows.join('\n')}\n`;

/**
 * The template the New surfaces hand to the 1:1 person picker instead of
 * opening as a typed note (DOCS/ONE_ON_ONE_SPEC.md req 1). Its Markdown body
 * is still what `/notes/new?template=one-to-one` opens.
 */
export const ONE_ON_ONE_TEMPLATE = 'one-to-one';

export const NOTE_TEMPLATES = [
  {
    id: 'meeting',
    label: 'Meeting notes',
    description: 'Attendees, agenda, decisions and action items',
    tags: ['meeting'],
    title: (now) => `Meeting — ${templateDay(now)}`,
    body: (now) => lines(
      `**Date:** ${templateDay(now)}`,
      '',
      '## Attendees',
      '',
      '- ',
      '',
      '## Agenda',
      '',
      '1. ',
      '',
      '## Notes',
      '',
      '- ',
      '',
      '## Decisions',
      '',
      '- ',
      '',
      '## Action items',
      '',
      '- [ ] Action — owner, due date',
      '- [ ] Action — owner, due date',
    ),
  },
  {
    id: 'one-to-one',
    label: '1:1',
    description: 'Pick a person: a handwritten page with what is still open',
    tags: ['one-to-one'],
    title: (now) => `One-to-one — ${templateDay(now)}`,
    body: (now) => lines(
      `**Date:** ${templateDay(now)}`,
      '',
      '## Wins since last time',
      '',
      '- ',
      '',
      '## Blockers',
      '',
      '- ',
      '',
      '## Feedback for them',
      '',
      '- ',
      '',
      '## Feedback for me',
      '',
      '- ',
      '',
      '## Career and growth',
      '',
      '- ',
      '',
      '## Actions',
      '',
      '- [ ] Mine — what, by when',
      '- [ ] Theirs — what, by when',
    ),
  },
  {
    id: 'weekly-review',
    label: 'Weekly review',
    description: 'Done, slipped, next week’s three, open loops',
    tags: ['review'],
    title: (now) => `Weekly review — week of ${templateWeekStart(now)}`,
    body: (now) => lines(
      `**Week of:** ${templateWeekStart(now)}`,
      '',
      '## What got done',
      '',
      '- ',
      '',
      '## What slipped, and why',
      '',
      '- ',
      '',
      '## Next week’s three',
      '',
      '1. ',
      '2. ',
      '3. ',
      '',
      '## Open loops',
      '',
      '- [ ] Something still waiting on me or on someone else',
      '',
      '## Keep, stop, start',
      '',
      '- **Keep:** ',
      '- **Stop:** ',
      '- **Start:** ',
    ),
  },
  {
    id: 'project-brief',
    label: 'Project brief',
    description: 'Problem, goal, non-goals, plan, risks, done-when',
    tags: ['project'],
    title: () => 'Project brief — ',
    body: () => lines(
      '## Problem',
      '',
      'What is wrong or missing today, and for whom.',
      '',
      '## Goal',
      '',
      'The one outcome that makes this worth doing.',
      '',
      '## Non-goals',
      '',
      '- ',
      '',
      '## Plan',
      '',
      '1. ',
      '',
      '## Risks',
      '',
      '- ',
      '',
      '## Done when',
      '',
      '- [ ] A result someone else could check',
    ),
  },
  {
    id: 'decision-record',
    label: 'Decision record',
    description: 'Context, options compared, the decision, consequences',
    tags: ['decision'],
    title: () => 'Decision — ',
    body: (now) => lines(
      `**Date:** ${templateDay(now)}`,
      '',
      '## Context',
      '',
      'What forced the question, and what is fixed.',
      '',
      '## Options considered',
      '',
      '| Option | For | Against |',
      '| --- | --- | --- |',
      '| A |  |  |',
      '| B |  |  |',
      '| Do nothing |  |  |',
      '',
      '## Decision',
      '',
      'What was chosen, and the reason that tipped it.',
      '',
      '## Consequences',
      '',
      '- ',
    ),
  },
  {
    id: 'troubleshooting',
    label: 'Troubleshooting log',
    description: 'Symptom, what changed, checks tried, root cause, fix',
    tags: ['troubleshooting'],
    title: (now) => `Troubleshooting — ${templateDay(now)} — `,
    body: (now) => lines(
      '## Symptom',
      '',
      'What is wrong, on which machine or service, and the exact error.',
      '',
      '## When it started',
      '',
      `Noticed ${templateDay(now)}. Last known good: `,
      '',
      '## What changed',
      '',
      '- ',
      '',
      '## Checks tried',
      '',
      '- [ ] Logs for the service',
      '- [ ] Disk, memory and load',
      '- [ ] Network, DNS and certificates',
      '- [ ] Restarted the service',
      '',
      '## Root cause',
      '',
      '',
      '## Fix',
      '',
      '',
      '## How to prevent it',
      '',
      '- ',
    ),
  },
  {
    id: 'packing-list',
    label: 'Packing list',
    description: 'Documents, clothes, electronics, toiletries, leaving the house',
    tags: ['packing'],
    title: () => 'Packing — ',
    body: () => lines(
      '## Documents',
      '',
      '- [ ] ID or passport',
      '- [ ] Tickets and bookings',
      '- [ ] Cards and some cash',
      '- [ ] Insurance details',
      '',
      '## Clothes',
      '',
      '- [ ] Tops',
      '- [ ] Trousers or shorts',
      '- [ ] Underwear and socks',
      '- [ ] Shoes',
      '- [ ] Jacket or rain layer',
      '- [ ] Sleepwear',
      '',
      '## Electronics',
      '',
      '- [ ] Phone and charger',
      '- [ ] Laptop or tablet and charger',
      '- [ ] Headphones',
      '- [ ] Power bank',
      '',
      '## Toiletries',
      '',
      '- [ ] Toothbrush and toothpaste',
      '- [ ] Deodorant',
      '- [ ] Medication',
      '- [ ] Razor',
      '',
      '## Before leaving the house',
      '',
      '- [ ] Windows and doors locked',
      '- [ ] Stove and heating off or turned down',
      '- [ ] Bins out, fridge checked',
      '- [ ] Keys, wallet, phone',
    ),
  },
  {
    id: 'recipe',
    label: 'Recipe',
    description: 'Servings, time, ingredients, method, notes',
    tags: ['recipe'],
    title: () => 'Recipe — ',
    body: () => lines(
      '- **Serves:** ',
      '- **Prep time:** ',
      '- **Cook time:** ',
      '',
      '## Ingredients',
      '',
      '- ',
      '',
      '## Method',
      '',
      '1. ',
      '',
      '## Notes',
      '',
      '- ',
    ),
  },
];

/** The template with this id, or null (an unknown id is a plain new note). */
export function getNoteTemplate(id) {
  if (typeof id !== 'string' || !id) return null;
  return NOTE_TEMPLATES.find((t) => t.id === id) || null;
}

/** Where picking a template goes: the ordinary new-note route. */
export const noteTemplatePath = (id) => `/notes/new?template=${encodeURIComponent(id)}`;

/**
 * What the editor is seeded with for a template opened at `now`:
 * `{ title, content, tags, type }`, or null for an unknown id.
 */
export function buildNoteFromTemplate(id, now = new Date()) {
  const template = getNoteTemplate(id);
  if (!template) return null;
  return {
    title: template.title(now),
    content: template.body(now),
    tags: [...template.tags],
    type: 'markdown',
  };
}
