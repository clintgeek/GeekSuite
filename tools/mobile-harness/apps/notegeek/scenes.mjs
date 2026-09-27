// NoteGeek — the M2 pilot surfaces (MOBILE_UI_PLAN.md), the Night 2 AI
// tag/link suggestion scene (R116/R126), and the Lab Notebook pass
// (2026-09-26): the editor's ⋯ menu, the tag tree, and one editor scene per
// non-text page type (code, mind map, sketch).

// Page-scoped stubs for the scenes after '05-suggestions': switch the
// suggestion opt-in back off and answer GetNoteById with a given note.
// Fails when a rendered markdown table (or any wide block) sticks out past an
// ancestor that neither scrolls nor clips it. The page-wide overflow probe
// can't see this, because the editor's sheet contains its own content.
async function assertNoMarkdownOverflow(page) {
  const bad = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('table, pre, p')) {
      const r = el.getBoundingClientRect();
      if (!r.width) continue;
      for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
        const ox = getComputedStyle(a).overflowX;
        if (ox === 'auto' || ox === 'scroll') break; // contained: it scrolls
        const ar = a.getBoundingClientRect();
        if (ar.width && r.right > ar.right + 1) {
          out.push(`${el.tagName.toLowerCase()} right ${Math.round(r.right)} > ${a.tagName.toLowerCase()}.${(a.className || '').toString().split(' ')[0]} right ${Math.round(ar.right)}`);
          break;
        }
      }
    }
    return out;
  });
  if (bad.length) throw new Error('markdown overflows its column: ' + bad.slice(0, 3).join('; '));
}

async function openNote(page, h, noteFixture, path) {
  await page.route('**/api/users/bootstrap', (r) => json(r, {
    identity: { username: 'chef', email: 'chef@example.com' },
    profile: { displayName: 'Chef Crocker' },
    preferences: {},
    appPreferences: { notegeek: { suggestOnSave: false } },
  }));
  await graphqlRoute(page, { ...OPS, GetNoteById: { note: noteFixture } });
  await page.goto(h.base + path, { waitUntil: 'networkidle' });
  await h.settle(1400);
}
import { json, graphqlRoute } from '../../lib/net.mjs';
import { OPS, NOTE_SUGGESTIONS, NOTE_CODE, NOTE_MINDMAP, NOTE_SKETCH, NOTE_WIDE_TABLE } from './fixtures.mjs';

export const scenes = [
  // Home (QuickCaptureHome) — bottom nav visible with mono labels + ink-stamp.
  { name: '01-home', goto: '/', wait: 1200 },
  {
    // Home with a thought typed: Capture in its enabled state, which must
    // read nothing like the empty (disabled) one in '01-home'.
    name: '01c-home-capture',
    goto: '/',
    wait: 1200,
    async setup(page, h) {
      await page.getByLabel('Quick capture').fill('call the roofer about the quote');
      await h.settle(300);
    },
  },
  // Notes list — bottom nav still visible, "Notes" tab active.
  { name: '02-notes-list', goto: '/notes', wait: 1200 },
  // Editor route — an existing text note, so the sticky bar shows
  // Back + Save + Delete (a new note has no Delete). Toolbar + sticky bar.
  { name: '03-editor', goto: '/notes/n1/edit', wait: 1200 },
  // The read-only viewer (/notes/:id for a text note) — the frame no longer
  // scrolls on single-note routes, so the viewer brings its own scroller.
  { name: '03v-viewer', goto: '/notes/n1', wait: 1200 },
  {
    // The navigation drawer with the tag tree. It takes the rest of the
    // sidebar's height; the LAST tag must be reachable by scrolling.
    name: '03t-tag-drawer',
    goto: '/notes',
    wait: 1200,
    viewports: ['phone'],
    async setup(page, h) {
      const menu = page.getByRole('button', { name: /open (navigation|menu)|menu/i }).first();
      if (!(await menu.count())) throw new Error('no navigation menu button');
      await menu.click();
      await h.settle(500);
      const last = page.getByRole('link', { name: /zettel/i }).first();
      if (!(await last.count())) throw new Error('last tag "zettel" not rendered in the drawer');
      await last.scrollIntoViewIfNeeded();
      await h.settle(300);
    },
    teardown: (page, h) => h.esc(400),
  },
  {
    // The pen's colour and size on a phone (2026-09-27). tldraw's style panel
    // is hidden there, so this popup is the only way to change the pen.
    name: '03p-sketch-pen',
    goto: '/notes/new?type=handwritten',
    wait: 2500,
    viewports: ['phone'],
    async setup(page, h) {
      await h.settle(800);
      await page.getByRole('button', { name: 'Pen colour and size' }).click();
      await h.settle(500);
      if (!(await page.getByRole('dialog', { name: 'Pen colour and size' }).count())) throw new Error('pen picker did not open');
      if (!(await page.getByRole('button', { name: 'Size: Small' }).count())) throw new Error('size choices missing');
    },
    teardown: (page, h) => h.esc(400),
  },
  {
    // A NEW sketch note on a phone (2026-09-26). The mobile drawing toolbar
    // called useEditor() from outside <Tldraw>, and EditorErrorBoundary caught
    // the throw, so this crashed for Chef without any uncaught page error. It
    // has to be asserted on screen: no fallback, and the phone toolbar present.
    name: '03s-sketch-new',
    goto: '/notes/new?type=handwritten',
    wait: 2500,
    async setup(page, h) {
      await h.settle(800);
      if (await page.getByText(/editor failed to load/i).count()) {
        throw new Error('sketch editor crashed: EditorErrorBoundary fallback is showing');
      }
      if (await page.locator('.tl-error-boundary').count()) throw new Error("tldraw rendered its own error screen");
      if (!(await page.locator('.tl-container').count())) throw new Error('tldraw canvas did not render');
      if (h.viewport === 'phone' && !(await page.getByRole('button', { name: /^write$/i }).count())) {
        throw new Error('phone drawing toolbar (Write) did not render');
      }
    },
  },
  {
    // A wide markdown table in the viewer (/notes/:id).
    name: '11-markdown-wide-table',
    async setup(page, h) {
      await openNote(page, h, NOTE_WIDE_TABLE, '/notes/nw');
      if (!(await page.locator('table').count())) throw new Error('the table did not render');
      await assertNoMarkdownOverflow(page);
    },
  },
  {
    // The same note in the editor's preview.
    name: '11b-markdown-wide-preview',
    async setup(page, h) {
      await openNote(page, h, NOTE_WIDE_TABLE, '/notes/nw/edit');
      await page.getByRole('button', { name: 'preview mode' }).click();
      await h.settle(500);
      if (!(await page.locator('table').count())) throw new Error('the preview table did not render');
      await assertNoMarkdownOverflow(page);
      // Split (desktop only) puts source and preview side by side in the
      // same column, the tightest fit of all.
      const split = page.getByRole('button', { name: 'split mode' });
      if (await split.count()) {
        await split.click();
        await h.settle(500);
        await assertNoMarkdownOverflow(page);
      }
    },
  },
  {
    // Delete confirm — GeekDialog mode="window". Delete lives in the editor's
    // ⋯ menu since the Lab Notebook pass.
    name: '04-delete-dialog',
    goto: '/notes/n1/edit',
    wait: 1200,
    viewports: ['phone'],
    async setup(page, h) {
      const more = page.getByRole('button', { name: /more note actions/i }).first();
      if (!(await more.count())) throw new Error('no "More note actions" button');
      await more.click();
      await h.settle(300);
      await page.getByRole('menuitem', { name: /delete note/i }).first().click();
      await h.settle(500);
    },
    teardown: (page, h) => h.esc(400),
  },
  {
    // The editor's ⋯ menu: Save now, Version history, Compose, Delete.
    name: '06-editor-menu',
    goto: '/notes/n1/edit',
    wait: 1200,
    async setup(page, h) {
      const more = page.getByRole('button', { name: /more note actions/i }).first();
      if (!(await more.count())) throw new Error('no "More note actions" button');
      await more.click();
      await h.settle(400);
      if (!(await page.getByRole('menuitem', { name: /version history/i }).count())) {
        throw new Error('⋯ menu has no Version history item');
      }
    },
    teardown: (page, h) => h.esc(400),
  },
  {
    // The Tags tree with counts, on a nested tag route: its ancestor is
    // open, the row is selected. On a phone it is the drawer.
    name: '07-tag-tree',
    goto: '/tags/dev%2Ffrontend',
    wait: 1200,
    async setup(page, h) {
      if (h.isPhone) {
        const menu = page.getByRole('button', { name: /open (navigation|menu)|menu/i }).first();
        if (!(await menu.count())) throw new Error('no navigation menu button');
        await menu.click();
        await h.settle(500);
      }
      const collapse = page.getByRole('button', { name: /^collapse dev$/i }).first();
      if (!(await collapse.count())) throw new Error('tag "dev" has no expanded chevron');
      await collapse.scrollIntoViewIfNeeded();
      // Collapse one branch so the scene shows both chevron states.
      const work = page.getByRole('button', { name: /^collapse work$/i }).first();
      if (await work.count()) {
        await work.click();
        await h.settle(200);
      }
    },
    teardown: async (page, h) => {
      // Leave the next scene with the default (expanded) tree.
      await page.evaluate(() => { try { localStorage.removeItem('notegeek.tagTree.collapsed'); } catch { /* ignore */ } });
      if (h.isPhone) await h.esc(400);
    },
  },
  {
    // Tag & link suggestions (DOCS/AI_IDEAS.md #3, Night 2 R116). The opt-in
    // (`appPreferences.notegeek.suggestOnSave`) and `suggestForNote` are
    // stubbed at the PAGE level, not in fixtures.mjs's context-wide routes(),
    // so scenes 01-04 above (which include this same /notes/n1/edit route)
    // are unaffected. Must come after every scene that uses the context-wide
    // routes: the page-scoped scenes below it re-stub bootstrap themselves.
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
  {
    // A code note: the same page, a slim language strip, a growing code sheet.
    name: '08-editor-code',
    async setup(page, h) {
      await openNote(page, h, NOTE_CODE, '/notes/n6/edit');
    },
  },
  {
    // A mind map (view mode, as opened from a list): the page head over a
    // full-bleed canvas. Desktop only for now: on a phone, ReactFlow's own
    // nodes (22px tall) and zoom controls (26px) are under the 44px floor —
    // a pre-existing canvas finding in MindMapEditor, not page chrome, and
    // not something to waive quietly (see the Lab Notebook report).
    name: '09-editor-mindmap',
    viewports: ['desktop'],
    async setup(page, h) {
      await openNote(page, h, NOTE_MINDMAP, '/notes/n4');
    },
  },
  {
    // A sketch: the page head over tldraw's canvas, which must not scroll.
    // Desktop only until the phone crash in HandwrittenEditor's
    // MobileDrawingToolbar (useEditor() outside <Tldraw>) is fixed on main —
    // then add 'phone' back. The assertion below is what would have caught
    // it: the error boundary renders, but no page error is ever thrown.
    name: '10-editor-sketch',
    async setup(page, h) {
      await openNote(page, h, NOTE_SKETCH, '/notes/n3');
      if (await page.getByText(/something went wrong/i).count()) {
        throw new Error('sketch note rendered the error boundary');
      }
      // tldraw has its own error screen ("Something's gone wrong", Refresh
      // Page), and a bad snapshot lands there, not in ours.
      if (await page.locator('.tl-error-boundary').count()) {
        throw new Error('tldraw rendered its own error screen');
      }
    },
  },
];

// Known, ticketed violations. Each one should die when the app is fixed —
// an empty list is the goal, not a permanent parking lot.
export const waivers = [
  {
    // tldraw's own style panel (desktop): its opacity slider thumb has no
    // accessible name. That's third-party markup inside <Tldraw>; labelling it
    // from outside would mean patching tldraw's DOM after every render. Scoped
    // to this rule, this element and the sketch scene only. Drop it when
    // tldraw labels the thumb.
    rule: 'aria-input-field-name',
    match: 'tlui-slider__thumb',
    scenes: ['03s-sketch-new', '10-editor-sketch'],
    reason: 'tldraw 2.4 style-panel slider thumb is unlabelled (third-party UI)',
  },
];
