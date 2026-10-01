// NoteGeek fixtures (MOBILE_UI_PLAN.md M2). Every note operation goes
// through /graphql (apolloClient), keyed by GraphQL operation name; the
// session check goes through the shared session routes.
import { readFileSync } from 'node:fs';
import { sessionRoutes, graphqlRoute } from '../../lib/net.mjs';

// Full timestamps, not bare dates: a date-only ISO string parses as UTC
// midnight, which is "yesterday" evening in every zone west of Greenwich —
// and the list now groups by the writer's LOCAL day.
const now = new Date();
const hoursAgo = (h) => new Date(now.getTime() - h * 3600 * 1000).toISOString();
const daysAgo = (d) => hoursAgo(d * 24);

const note = (id, title, type, tags, content, updatedAt = hoursAgo(2), createdAt = daysAgo(20), pinned = false, pinnedAt = null) => ({
  __typename: 'Note',
  id, title, content, type, tags,
  isLocked: false,
  isEncrypted: false,
  pinned,
  pinnedAt,
  createdAt,
  updatedAt,
});

// A real snapshot, written by the sketch editor itself (tldraw 2.4, schema v2:
// three boxes, two arrows and a pen stroke), captured on 2026-09-26. The
// hand-written one it replaces had an invented schema header, so tldraw's
// migrations threw and the sketch scene showed tldraw's own error screen.
export const SKETCH_CONTENT = readFileSync(new URL('./sketch-snapshot.json', import.meta.url), 'utf8');

const mmNode = (id, label, x, y, isRoot = false) => ({
  id, type: 'mindmap', position: { x, y }, data: { label, isRoot }, dragHandle: '.drag-handle',
});
export const MINDMAP_CONTENT = JSON.stringify({
  nodes: [
    mmNode('0', 'GeekSuite', 100, 250, true),
    mmNode('1', 'NoteGeek', 350, 100),
    mmNode('2', 'BookGeek', 350, 200),
    mmNode('3', 'GameGeek', 350, 300),
    mmNode('4', 'FitnessGeek', 350, 400),
    mmNode('5', 'BaseGeek', 350, 500),
  ],
  edges: ['1', '2', '3', '4', '5'].map((t) => ({ id: `e0-${t}`, source: '0', target: t })),
});

export const CODE_CONTENT = JSON.stringify({
  language: 'javascript',
  code: [
    '// Debounce a function: run it once the calls stop.',
    'export function debounce(fn, wait = 200) {',
    '  let timer = null;',
    '  return (...args) => {',
    '    clearTimeout(timer);',
    '    timer = setTimeout(() => fn(...args), wait);',
    '  };',
    '}',
  ].join('\n'),
});

export const NOTE_N1 = note(
  'n1',
  'Q3 roadmap notes',
  'text',
  ['work', 'planning'],
  '<h2>Roadmap</h2><p>Draft agenda for the <strong>Q3 planning</strong> session — see the bullet list below and the linked doc.</p><ul><li>Ship the mobile pass</li><li>Close out CSRF hardening</li><li>Decide on flockgeek bottom nav</li></ul><p>Follow-ups land in a separate note once triaged.</p>',
  hoursAgo(2),
);

export const NOTE_CODE = note('n6', 'debounce.js', 'code', ['dev', 'dev/frontend'], CODE_CONTENT, hoursAgo(5));
export const NOTE_MINDMAP = note('n4', 'Mind map: GeekSuite apps', 'mindmap', ['meta'], MINDMAP_CONTENT, daysAgo(3));
export const NOTE_SKETCH = note('n3', 'Sketch: onboarding flow', 'handwritten', ['product'], SKETCH_CONTENT, daysAgo(1));

// A markdown note the size of Chef's real ones (most are markdown reference
// notes of a few hundred to a few thousand characters): headings, a list, a
// checklist, a link. The Graphite editor scenes write into it. Also the
// suite's one pinned fixture note (scenes 01p, 06p): it sits mid-list by
// `updatedAt` (daysAgo(1.2), not the newest), so a scene showing it at the
// top of a "Pinned" group actually demonstrates the pin, not just recency.
export const NOTE_MD = note('n2', 'Recipe: brown butter chocolate chip cookies', 'markdown', ['recipes'], [
  '# Cookies',
  '',
  'Brown the butter first, then **chill the dough** overnight. 350°F, 11 minutes, and pull them while the middles still look underdone.',
  '',
  '## Shopping',
  '',
  '- [x] dark chocolate, 70%',
  '- [ ] flaky salt',
  '- [ ] brown sugar',
  '',
  '## Notes',
  '',
  '- Two sheets at once runs the bottom one dark; rotate at 6 minutes.',
  '- The [original recipe](https://example.com/cookies) halves cleanly.',
  '',
  '> Rest the dough at least 12 hours. 36 is better.',
].join('\n'), daysAgo(1.2), daysAgo(20), true, hoursAgo(3));

// Search results: the gateway's `searchNotes` shape (`_id`, `snippet`).
export const SEARCH_RESULTS = [
  { __typename: 'SearchSnippet', _id: 'n2', title: 'Recipe: brown butter chocolate chip cookies', type: 'markdown', tags: ['recipes'], isLocked: false, isEncrypted: false, createdAt: daysAgo(20), updatedAt: daysAgo(1.2), score: 3, snippet: 'Brown the butter first, then chill the dough overnight.', message: null, matchedBy: 'keyword', why: null },
  { __typename: 'SearchSnippet', _id: 'n7', title: 'Nginx wildcard cert renewal', type: 'markdown', tags: ['dev', 'dev/infra'], isLocked: false, isEncrypted: false, createdAt: daysAgo(20), updatedAt: daysAgo(5), score: 1, snippet: 'Run certbot, then brown-bag the reload until nginx -t passes.', message: null, matchedBy: 'keyword', why: null },
];

// Hybrid search (DOCS/CONTEXT.md §11): "fix the garage" — one note with the
// words (marked), then two the local embeddings found by meaning (no marks,
// a quiet "similar", and the passage that matched). Scene 14h.
export const HYBRID_RESULTS = [
  { __typename: 'SearchSnippet', _id: 'h1', title: 'Garage shelving plan', type: 'markdown', tags: ['house/garage'], isLocked: false, isEncrypted: false, createdAt: daysAgo(20), updatedAt: daysAgo(3), score: 0.0164, snippet: 'Four uprights, 18in deep. Fix the brackets to the garage studs.', message: null, matchedBy: 'both', why: 'Four uprights, 18in deep. Fix the brackets to the garage studs.' },
  { __typename: 'SearchSnippet', _id: 'h2', title: 'Kitchen tap washer', type: 'text', tags: ['house/kitchen', 'finance'], isLocked: false, isEncrypted: false, createdAt: daysAgo(20), updatedAt: daysAgo(9), score: 0.0129, snippet: 'Replace the washer, not the tap. About £4.', message: null, matchedBy: 'meaning', why: 'Replace the washer, not the tap. About £4.' },
  { __typename: 'SearchSnippet', _id: 'h3', title: 'House insurance renewal', type: 'markdown', tags: ['house'], isLocked: false, isEncrypted: false, createdAt: daysAgo(20), updatedAt: daysAgo(14), score: 0.0127, snippet: 'Renews in October. Compare two quotes first.', message: null, matchedBy: 'meaning', why: 'Renews in October. Compare two quotes first.' },
];

// Related notes (local embeddings) for the Q3 roadmap note — scenes 17a/17b.
export const RELATED_TO_N1 = [
  { __typename: 'SimilarNote', id: 'n5', title: 'Standup snippets', type: 'text', updatedAt: hoursAgo(7), score: 0.71, snippet: 'Nothing blocking. Pairing on the sidebar tree after lunch.' },
  { __typename: 'SimilarNote', id: 'np', title: 'Deploy checklist', type: 'markdown', updatedAt: hoursAgo(1), score: 0.69, snippet: 'A Watchtower deploy never picks up new .env.production vars.' },
  { __typename: 'SimilarNote', id: 'n4', title: 'Mind map: GeekSuite apps', type: 'mindmap', updatedAt: daysAgo(3), score: 0.67, snippet: null },
];

// Spread across the recency buckets: Today, Yesterday, This week, and two
// older months — the notes list groups by them.
// A markdown note with a table far wider than the ~70ch column, plus a long
// unbroken URL. Wide tables ran out past the sheet's right edge (Chef,
// 2026-09-27); scenes 11 and 11b guard it.
const WIDE_ROW = (label) => `| ${label} | ` + Array.from({ length: 9 }, (_, i) => `${label} value ${i + 1}`).join(' | ') + ' |';
export const NOTE_WIDE_TABLE = note('nw', 'Quarterly numbers', 'markdown', ['finance'], [
  '## Quarterly numbers',
  '',
  '| Metric | ' + Array.from({ length: 9 }, (_, i) => `Column heading ${i + 1}`).join(' | ') + ' |',
  '|' + ' --- |'.repeat(10),
  WIDE_ROW('Revenue'),
  WIDE_ROW('Costs'),
  WIDE_ROW('Margin'),
  '',
  'Source: https://example.com/reports/2026/q3/an-extremely-long-unbroken-path-segment-that-should-wrap-not-overflow',
].join('\n'), daysAgo(20));

// Print / Save as PDF (scenes 14a/14v, DOCS/CONTEXT.md §8): a table, a code
// block with a line far wider than the page, a quote, and a link whose URL
// should follow it on paper.
export const NOTE_PRINT = note('np', 'Deploy checklist', 'markdown', ['dev', 'dev/infra'], [
  '# Deploy checklist',
  '',
  'Push to main and let Watchtower roll it out; see the [runbook](https://example.com/runbook) for the rest.',
  '',
  '| Step | Command | Owner |',
  '| --- | --- | --- |',
  '| Build | `pnpm build` | CI |',
  '| Check | `nginx -t` | Chef |',
  '| Reload | `nginx -s reload` | Chef |',
  '',
  '```sh',
  'docker compose -f /mnt/Media/Docker/notegeek/docker-compose.yml up -d --force-recreate --no-deps notegeek && docker logs -f notegeek',
  '```',
  '',
  '> A Watchtower deploy never picks up new .env.production vars.',
  '',
  '- [x] tests green',
  '- [ ] harness green',
].join('\n'), hoursAgo(1));

// Tagged under `house` — the nested-tag scenes (16a-16c).
export const HOUSE_NOTES = [
  note('h1', 'Garage shelving plan', 'markdown', ['house/garage'], 'Four uprights, 18in deep. Buy brackets #house/garage and ask about the #fff paint.', daysAgo(3)),
  note('h2', 'Kitchen tap washer', 'text', ['house/kitchen', 'finance'], '<p>Replace the washer, not the tap. About £4.</p>', daysAgo(9)),
  note('h3', 'House insurance renewal', 'markdown', ['house'], 'Renews in October. Compare two quotes first.', daysAgo(14)),
];

export const NOTES = [
  NOTE_N1,
  NOTE_CODE,
  note('n5', 'Standup snippets', 'text', ['work', 'work/meetings'], '<p>Nothing blocking. Pairing on the sidebar tree after lunch; ask about the tag counts query.</p>', hoursAgo(7)),
  NOTE_SKETCH,
  NOTE_MD,
  NOTE_MINDMAP,
  note('n7', 'Nginx wildcard cert renewal', 'markdown', ['dev', 'dev/infra'], '## Renewal\n\nRun certbot with the DNS plugin, then `nginx -t` and reload.', daysAgo(5)),
  note('n8', 'Garden bed layout', 'handwritten', ['garden'], '', daysAgo(40)),
  note('n9', 'Reading list', 'text', ['reading'], '<p>The Pragmatic Programmer, A Philosophy of Software Design, Thinking in Systems.</p>', daysAgo(75)),
  // Nested tags (2026-09-30): `house` is a notebook with two notebooks in it.
  // The parent view (/tags/house) lists all three; the rows name the sub-tag.
  ...HOUSE_NOTES,
];

// Enough tags (with a nested path) that the sidebar's tree must scroll — the
// last ones sat hidden below a 40vh cap until 2026-09-24.
export const TAGS = [
  'dev', 'dev/frontend', 'dev/infra', 'finance', 'garden', 'health', 'house', 'house/garage', 'house/kitchen', 'meta', 'planning',
  'product', 'reading', 'recipes', 'travel', 'work', 'work/meetings', 'writing', 'zettel',
];

// Tag & link suggestions (DOCS/AI_IDEAS.md #3, Night 2 R116). Opt-in —
// `appPreferences.notegeek.suggestOnSave` — so no existing scene renders the
// strip; used only by scenes.mjs's page-scoped '05-suggestions' scene.
export const NOTE_SUGGESTIONS = {
  __typename: 'NoteSuggestions',
  tags: [
    { __typename: 'SuggestedTag', tag: 'work', score: 0.82 },
    { __typename: 'SuggestedTag', tag: 'planning', score: 0.71 },
    { __typename: 'SuggestedTag', tag: 'meta', score: 0.44 },
  ],
  related: [
    { __typename: 'RelatedNote', id: 'n5', title: 'Standup snippets', score: 0.63, why: 'shares the "work" tag' },
    { __typename: 'RelatedNote', id: 'n2', title: 'Recipe: brown butter chocolate chip cookies', score: 0.31, why: 'similar title terms' },
  ],
  provenance: {
    __typename: 'AIProvenance',
    source: 'model', reason: null, model: 'llama-3.1-8b-instant', provider: 'groq', cached: false, callsToday: 2, cap: 30,
  },
};

// The sidebar's per-tag counts come from `notes { id tags }`: every fixture
// note plus a few tag-only ones so each listed tag has a believable count.
const extraTagged = [
  ['c1', ['dev', 'dev/frontend']], ['c2', ['dev/frontend']], ['c3', ['dev/infra']],
  ['c4', ['finance']], ['c5', ['health']], ['c6', ['writing']], ['c7', ['writing', 'zettel']],
  ['c8', ['travel']], ['c9', ['work/meetings']], ['c10', ['planning']],
];
export const TAG_COUNT_NOTES = [
  ...NOTES.map(({ id, tags }) => ({ __typename: 'Note', id, tags })),
  ...extraTagged.map(([id, tags]) => ({ __typename: 'Note', id, tags })),
];

// The gateway's nested-tag rules, just enough for the stubs: `under` is the
// tag itself or anything beneath it.
const inSubtree = (t, root) => t === root || t.startsWith(`${root}/`);

export const OPS = {
  GetNotes: (vars) => ({
    notes: vars?.under ? NOTES.filter((n) => n.tags.some((t) => inSubtree(t, vars.under))) : NOTES,
  }),
  NoteTagUsage: (vars) => {
    const hit = TAG_COUNT_NOTES.filter((n) => n.tags.some((t) => inSubtree(t, vars.tag)));
    const sub = new Set(hit.flatMap((n) => n.tags).filter((t) => t !== vars.tag && inSubtree(t, vars.tag)));
    return { noteTagUsage: { __typename: 'TagUsage', notes: hit.length, subTags: sub.size } };
  },
  GetNoteTagCounts: { notes: TAG_COUNT_NOTES },
  GetNoteById: { note: NOTE_N1 },
  GetNoteTags: { noteTags: TAGS },
  CreateNote: { createNote: note('new1', 'Untitled Note', 'text', [], '') },
  UpdateNote: { updateNote: NOTE_N1 },
  DeleteNote: { deleteNote: true },
  RenameTag: { renameTag: true },
  DeleteTag: { deleteTag: true },
  SearchNotes: { searchNotes: [] },
  // Empty by default, so the scenes before 17a show no Related section.
  RelatedNotes: { relatedNotes: [] },
  SetNotePinned: (vars) => ({
    setNotePinned: { __typename: 'Note', id: vars.id, pinned: vars.pinned, pinnedAt: vars.pinned ? now.toISOString() : null },
  }),
};

export async function routes(ctx, { base, scheme, viewport } = {}) {
  await sessionRoutes(ctx);
  await graphqlRoute(ctx, OPS);
}
