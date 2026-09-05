// NoteGeek fixtures (MOBILE_UI_PLAN.md M2). Every note operation goes
// through /graphql (apolloClient), keyed by GraphQL operation name; the
// session check goes through the shared session routes.
import { sessionRoutes, graphqlRoute } from '../../lib/net.mjs';

const today = new Date();
const iso = (d) => d.toISOString().slice(0, 10);
const daysAgo = (n) => { const d = new Date(today); d.setDate(d.getDate() - n); return iso(d); };

const note = (id, title, type, tags, content) => ({
  __typename: 'Note',
  id, title, content, type, tags,
  isLocked: false,
  isEncrypted: false,
  createdAt: daysAgo(20),
  updatedAt: daysAgo(0),
});

export const NOTE_N1 = note(
  'n1',
  'Q3 roadmap notes',
  'text',
  ['work', 'planning'],
  '<h2>Roadmap</h2><p>Draft agenda for the <strong>Q3 planning</strong> session — see the bullet list below and the linked doc.</p><ul><li>Ship the mobile pass</li><li>Close out CSRF hardening</li><li>Decide on flockgeek bottom nav</li></ul><p>Follow-ups land in a separate note once triaged.</p>',
);

export const NOTES = [
  NOTE_N1,
  note('n2', 'Recipe: brown butter chocolate chip cookies', 'markdown', ['recipes'], '# Cookies\n\nBrown the butter first.'),
  note('n3', 'Sketch: onboarding flow', 'handwritten', ['product'], ''),
  note('n4', 'Mind map: GeekSuite apps', 'mindmap', ['meta'], '{}'),
  note('n5', 'Standup snippets', 'text', ['work'], '<p>Nothing blocking.</p>'),
  note('n6', 'snippet.js', 'code', ['dev'], 'export const x = 1;'),
];

export const TAGS = ['work', 'planning', 'recipes', 'product', 'meta', 'dev'];

export const OPS = {
  GetNotes: { notes: NOTES },
  GetNoteById: { note: NOTE_N1 },
  GetNoteTags: { noteTags: TAGS },
  CreateNote: { createNote: note('new1', 'Untitled Note', 'text', [], '') },
  UpdateNote: { updateNote: NOTE_N1 },
  DeleteNote: { deleteNote: true },
  RenameTag: { renameTag: true },
  DeleteTag: { deleteTag: true },
  SearchNotes: { searchNotes: [] },
  GetFolders: { folders: [] },
};

export async function routes(ctx, { base, scheme, viewport } = {}) {
  await sessionRoutes(ctx);
  await graphqlRoute(ctx, OPS);
}
