// NoteGeek — the M2 pilot surfaces (MOBILE_UI_PLAN.md), plus the Night 2 AI
// tag/link suggestion scene (R116/R126).
import { json, graphqlRoute } from '../../lib/net.mjs';
import { OPS, NOTE_SUGGESTIONS } from './fixtures.mjs';

export const scenes = [
  // Home (QuickCaptureHome) — bottom nav visible with mono labels + ink-stamp.
  { name: '01-home', goto: '/', wait: 1200 },
  // Notes list — bottom nav still visible, "Notes" tab active.
  { name: '02-notes-list', goto: '/notes', wait: 1200 },
  // Editor route — an existing text note, so the sticky bar shows
  // Back + Save + Delete (a new note has no Delete). Toolbar + sticky bar.
  { name: '03-editor', goto: '/notes/n1/edit', wait: 1200 },
  {
    // Delete confirm — GeekDialog mode="window".
    name: '04-delete-dialog',
    goto: '/notes/n1/edit',
    wait: 1200,
    viewports: ['phone'],
    async setup(page, h) {
      const deleteBtn = page.getByRole('button', { name: /^delete$/i }).first();
      if (!(await deleteBtn.count())) {
        h.log('no "Delete" button found at', h.viewport, h.scheme);
        return false;
      }
      await deleteBtn.click();
      await h.settle(500);
    },
    teardown: (page, h) => h.esc(400),
  },
  {
    // Tag & link suggestions (DOCS/AI_IDEAS.md #3, Night 2 R116). The opt-in
    // (`appPreferences.notegeek.suggestOnSave`) and `suggestForNote` are
    // stubbed at the PAGE level, not in fixtures.mjs's context-wide routes(),
    // so scenes 01-04 above (which include this same /notes/n1/edit route)
    // are unaffected. Must stay the LAST scene in the file.
    //
    // No click is needed: the strip also fires ~1.5s after the writer pauses
    // on the title (`SuggestionStrip.jsx`), and n1 already has a title on
    // load, so the settle below is enough to trigger it.
    name: '05-suggestions',
    async setup(page, h) {
      await page.route('**/api/users/bootstrap', (r) => json(r, {
        identity: { username: 'chef', email: 'chef@example.com' },
        profile: { displayName: 'Chef Crocker' },
        preferences: {},
        appPreferences: { notegeek: { suggestOnSave: true } },
      }));
      await graphqlRoute(page, { ...OPS, SuggestForNote: { suggestForNote: NOTE_SUGGESTIONS } });

      await page.goto(h.base + '/notes/n1/edit', { waitUntil: 'networkidle' });
      await h.settle(2400);
    },
  },
];

// Known, ticketed violations. Each one should die when the app is fixed —
// an empty list is the goal, not a permanent parking lot.
export const waivers = [];
