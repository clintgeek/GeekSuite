// NoteGeek — the M2 pilot surfaces (MOBILE_UI_PLAN.md), the Night 2 AI
// tag/link suggestion scene (R116/R126), the Lab Notebook pass (2026-09-26):
// the editor's ⋯ menu, the tag tree, one editor scene per non-text page
// type — and the Graphite pass (2026-09-29): one New (sheet on a phone, split
// button on desktop), the phone's Tags sheet, the markdown editor writing
// with its toolbar docked, the loud save states, and search with its marks.

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
// "Convert handwriting to text" (DOCS/HANDWRITING.md §2). The sketch is the
// real fixture snapshot, so the export is tldraw's own, in a real browser;
// only the gateway is stubbed. Every image the page sends is checked here:
// bare base64 PNG, under the gateway's ~8 MB ceiling. Sizes are printed so a
// run says what the export actually weighs.
const TRANSCRIPT = [
  'Onboarding flow',
  '',
  '[drawing: three boxes joined by arrows]',
  'sign up -> verify email -> first note',
  '- [ ] ask Heather about the [?] step',
].join('\n');
const COMPOSED = [
  '# Onboarding flow',
  '',
  'Three steps, in order.',
  '',
  '1. Sign up',
  '2. Verify email',
  '3. Write a first note',
  '',
  '## Open questions',
  '',
  '- [ ] Ask Heather about the unclear step',
].join('\n');

async function openSketchToTranscribe(page, h) {
  await page.route('**/api/users/bootstrap', (r) => json(r, {
    identity: { username: 'chef', email: 'chef@example.com' },
    profile: { displayName: 'Chef Crocker' },
    preferences: {},
    appPreferences: { notegeek: { suggestOnSave: false } },
  }));
  const sent = [];
  await graphqlRoute(page, {
    ...OPS,
    GetNoteById: { note: NOTE_SKETCH },
    UpdateNote: { updateNote: NOTE_SKETCH },
    TranscribeSketch: (vars) => {
      sent.push(vars);
      return { transcribeSketch: { text: TRANSCRIPT, provenance: { source: 'model', reason: null, model: 'openai/gpt-4.1-mini', provider: 'openrouter', cached: false, callsToday: 1, cap: 40 } } };
    },
    ComposeNote: {
      composeNote: {
        markdown: COMPOSED,
        stats: { inputChars: TRANSCRIPT.length, fragments: 3, chunks: 1, chunksFailed: 0, strategy: 'single', truncated: false, degenerate: false },
        provenance: { source: 'model', reason: null, model: 'openai/gpt-4.1-mini', provider: 'openrouter', cached: false, callsToday: 1, cap: 120 },
      },
    },
  });
  await page.goto(h.base + '/notes/n3/edit', { waitUntil: 'networkidle' });
  await h.settle(1800);
  return sent;
}

async function openTranscribeMenu(page, h) {
  await page.getByRole('button', { name: /more note actions/i }).first().click();
  await h.settle(400);
  const item = page.getByRole('menuitem', { name: /convert handwriting to text/i });
  if (!(await item.count())) throw new Error('⋯ menu has no "Convert handwriting to text" on a sketch');
  if (await item.getAttribute('aria-disabled') === 'true') throw new Error('"Convert handwriting to text" is disabled on a sketch with ink');
  return item;
}

async function reviewTranscript(page, h) {
  const sent = await openSketchToTranscribe(page, h);
  await (await openTranscribeMenu(page, h)).click();
  const box = page.getByRole('textbox', { name: 'Transcript' });
  await box.waitFor({ timeout: 20000 });
  if (sent.length !== 1) throw new Error(`expected one transcribeSketch call, saw ${sent.length}`);
  const { image, mediaType } = sent[0];
  if (mediaType !== 'image/png') throw new Error(`sent mediaType ${mediaType}`);
  if (!/^iVBORw0KGgo/.test(image)) throw new Error('sent image is not bare base64 PNG');
  if (image.length > 8 * 1024 * 1024) throw new Error(`sent image is ${image.length} base64 chars, over the gateway ceiling`);
  const bytes = Math.floor(image.length * 3 / 4) - (image.endsWith('==') ? 2 : image.endsWith('=') ? 1 : 0);
  console.log(`  [sketch export] ${h.viewport}: ${bytes} bytes PNG (${image.length} base64 chars)`);
  if ((await box.inputValue()) !== TRANSCRIPT) throw new Error('the review box does not hold the transcript');
  await h.settle(600);
  // The page and the transcript must not overlap (on a phone they stack; a
  // squeezed grid once ran the image caption into the Transcript label).
  const caption = await page.getByText('What the model saw').boundingBox();
  const field = await page.locator('.MuiTextField-root').filter({ has: box }).boundingBox();
  if (caption && field && h.isPhone && caption.y + caption.height > field.y) {
    throw new Error(`the page caption (bottom ${Math.round(caption.y + caption.height)}) overlaps the transcript (top ${Math.round(field.y)})`);
  }
  return box;
}

import { fileURLToPath } from 'node:url';
import { json, graphqlRoute } from '../../lib/net.mjs';
import { OPS, NOTE_SUGGESTIONS, NOTE_CODE, NOTE_MINDMAP, NOTE_SKETCH, NOTE_WIDE_TABLE, NOTE_MD, SEARCH_RESULTS } from './fixtures.mjs';

// ── Photo of a page (DOCS/HANDWRITING.md §3) ────────────────────────────────
//
// Two real notebook-page JPEGs (make-photo-fixtures.cjs): page 1 upright and
// slightly skewed, page 2 stored on its side with EXIF orientation 6, the way
// a phone saves a portrait shot. They go through the page's real preparation
// in Chromium (createImageBitmap, canvas, JPEG 0.85); only the gateway is
// stubbed. The photo sketch note the page creates is captured from its
// CreateNote call and then OPENED, so the snapshot tldraw loads is the one the
// page actually built, not a fixture.
const PHOTO_FILES = ['photo-page-1.jpg', 'photo-page-2-exif6.jpg'].map((f) => fileURLToPath(new URL(`./${f}`, import.meta.url)));
const PHOTO_READINGS = [
  'Kitchen plan\n- tiles: grey, matte\n- lights over the island\n-> ask Heather re: budget\n[ ] measure the window\n[x] call the plumber',
  'Page two\norder: 40 tiles + 10%\ngrout colour: ash\nring Mike on Tues\n- [?] the extractor',
];
const PROV = { source: 'model', reason: null, model: 'openai/gpt-4.1-mini', provider: 'openrouter', cached: false, callsToday: 1, cap: 40 };
const photoNote = (id, title, type, content, tags = []) => ({
  __typename: 'Note', id, title, content, type, tags,
  isLocked: false, isEncrypted: false,
  createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
});
const b64Bytes = (s) => Math.floor(s.length * 3 / 4) - (s.endsWith('==') ? 2 : s.endsWith('=') ? 1 : 0);

async function bootstrapChef(page) {
  await page.route('**/api/users/bootstrap', (r) => json(r, {
    identity: { username: 'chef', email: 'chef@example.com' },
    profile: { displayName: 'Chef Crocker' },
    preferences: {},
    appPreferences: { notegeek: { suggestOnSave: false } },
  }));
}

async function stubPhotoGateway(page) {
  const calls = { transcribe: [], create: [] };
  await graphqlRoute(page, {
    ...OPS,
    TranscribeSketch: (vars) => {
      calls.transcribe.push(vars);
      return { transcribeSketch: { text: PHOTO_READINGS[calls.transcribe.length - 1] ?? 'more writing', provenance: PROV } };
    },
    CreateNote: (vars) => {
      calls.create.push(vars);
      const id = vars.type === 'handwritten' ? 'photo1' : 'md1';
      return { createNote: photoNote(id, vars.title, vars.type, vars.content, vars.tags || []) };
    },
  });
  return calls;
}

const readButton = (page, n) => page.getByRole('button', { name: n > 1 ? `Read ${n} pages` : 'Read the page' });

async function waitEnabled(locator, timeout = 30000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if ((await locator.count()) && (await locator.isEnabled())) return;
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('timed out waiting for an enabled button');
}

async function openPhotoTray(page, h) {
  await bootstrapChef(page);
  const calls = await stubPhotoGateway(page);
  await page.goto(h.base + '/notes/photo', { waitUntil: 'networkidle' });
  await h.settle(800);
  await page.locator('input[data-photo-input="files"]').setInputFiles(PHOTO_FILES);
  await waitEnabled(readButton(page, 2));
  const dims = await page.getByText(/^\d+×\d+ · \d+ KB$/).allTextContents();
  if (dims.length !== 2) throw new Error(`expected two prepared pages, saw ${dims.length}`);
  const [w2, h2] = dims[1].split(' ')[0].split('×').map(Number);
  // EXIF honoured: page 2 is stored 1600×1200 with orientation 6; upright it
  // is portrait. Landscape here means the flag was ignored.
  if (!(w2 < h2)) throw new Error(`page 2 prepared as ${w2}×${h2}: the EXIF orientation was not applied`);
  console.log(`  [photo tray] ${h.viewport}: ${dims.join(' | ')}`);
  return calls;
}

async function reviewPhotos(page, h) {
  const calls = await openPhotoTray(page, h);
  await readButton(page, 2).click();
  const box = page.getByRole('textbox', { name: 'Transcript' });
  await box.waitFor({ timeout: 20000 });
  if (calls.transcribe.length !== 2) throw new Error(`expected two transcribeSketch calls, saw ${calls.transcribe.length}`);
  for (const [i, v] of calls.transcribe.entries()) {
    if (v.source !== 'photo') throw new Error(`page ${i + 1} sent source ${v.source}`);
    if (v.mediaType !== 'image/jpeg' || !/^\/9j\//.test(v.image)) throw new Error(`page ${i + 1} is not bare base64 JPEG`);
    if (v.image.length > 8 * 1024 * 1024) throw new Error(`page ${i + 1} is over the gateway ceiling`);
  }
  console.log(`  [photo pages] ${h.viewport}: ${calls.transcribe.map((v) => `${b64Bytes(v.image)} bytes JPEG`).join(', ')}`);
  const expected = `--- page 1 ---\n${PHOTO_READINGS[0]}\n\n--- page 2 ---\n${PHOTO_READINGS[1]}`;
  if ((await box.inputValue()) !== expected) throw new Error('the transcript is not both pages, in order, with markers');
  const strip = page.getByRole('group', { name: 'The pages that were read' });
  if ((await strip.getByRole('img').count()) !== 2) throw new Error('the review does not show both pages');
  await h.settle(600);
  return { calls, box };
}

async function savePhotos(page, h) {
  const { calls } = await reviewPhotos(page, h);
  await page.getByRole('button', { name: 'Keep as plain text' }).click();
  await page.waitForURL(/\/notes\/md1$/, { timeout: 20000 });
  const [photo, md] = calls.create;
  if (calls.create.length !== 2 || photo?.type !== 'handwritten' || md?.type !== 'markdown') {
    throw new Error(`expected a photo sketch note then a markdown note, saw ${calls.create.map((c) => c.type).join(', ')}`);
  }
  if (!md.content.startsWith(`From photos: [${photo.title}](/notes/photo1)`)) throw new Error('the markdown note does not link back to the photo note');
  const content = JSON.parse(photo.content);
  const images = Object.values(content.store).filter((r) => r.typeName === 'shape' && r.type === 'image');
  if (images.length !== 2) throw new Error(`the photo note has ${images.length} image shapes`);
  console.log(`  [photo snapshot] ${h.viewport}: 2 pages -> ${photo.content.length} chars`);
  return { photo, md };
}

// The phone has no drawer (Graphite): the tag tree opens from the Notes
// page's Tags button, as a sheet.
async function openPhoneTags(page, h) {
  const tags = page.getByRole('button', { name: /^tags$/i }).first();
  if (!(await tags.count())) throw new Error('the notes page has no Tags button on a phone');
  await tags.click();
  await h.settle(600);
  if (!(await page.getByRole('dialog', { name: /tags/i }).count())) throw new Error('the Tags sheet did not open');
}

// No greeting, no "Continue" cards, and a note row in the first screen.
async function assertHomeIsNotes(page, h) {
  if (await page.getByText(/good (morning|afternoon|evening)/i).count()) throw new Error('home still has the greeting');
  if (await page.getByText(/continue where you left off/i).count()) throw new Error('home still has the Continue cards');
  if (await page.locator('.type-stamp').count()) throw new Error('a Lab Notebook type stamp is still rendered');
  const first = await page.locator('[data-note-row]').first().boundingBox();
  const vh = page.viewportSize().height;
  if (!first || first.y + first.height > vh) throw new Error(`the first note row is not on the first screen (${first ? Math.round(first.y) : 'none'} of ${vh})`);
}

export const scenes = [
  // Home (QuickCaptureHome): the capture box and the notes, nothing else.
  // The first note must be on the first screen of a phone.
  {
    name: '01-home',
    goto: '/',
    wait: 1200,
    async setup(page, h) {
      await assertHomeIsNotes(page, h);
    },
  },
  {
    // One New. Phone: the tab bar's New opens a sheet — a note, a photo, a
    // sketch — with code and mind map under More (opened here). Desktop:
    // the top bar's split button menu.
    name: '01n-new',
    goto: '/',
    wait: 1200,
    async setup(page, h) {
      if (h.isPhone) {
        await page.locator('[data-geek-bottom-nav-item="new"]').click();
        await h.settle(600);
        const sheet = page.getByRole('dialog', { name: /new/i });
        if (!(await sheet.count())) throw new Error('New did not open its sheet');
        for (const k of ['markdown', 'photo', 'handwritten']) {
          if (!(await sheet.locator(`[data-new-entry="${k}"]`).count())) throw new Error(`the New sheet has no ${k} entry`);
        }
        if (await sheet.locator('[data-new-entry="text"]').count()) throw new Error('the New sheet still offers rich text');
        await sheet.getByRole('button', { name: /more/i }).click();
        await h.settle(500);
        if (!(await sheet.locator('[data-new-entry="code"]').isVisible())) throw new Error('More did not show Code');
      } else {
        await page.getByRole('button', { name: 'More kinds of note' }).click();
        await h.settle(400);
        for (const k of ['photo', 'handwritten', 'code', 'mindmap']) {
          if (!(await page.locator(`[role="menu"] [data-new-entry="${k}"]`).count())) throw new Error(`the New menu has no ${k}`);
        }
      }
    },
    teardown: (page, h) => h.esc(400),
  },
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
  {
    // A pinned note (NOTE_MD, "Recipe: ...") gets its own quiet "Pinned"
    // group above "Recent" — and must not also show up inside Recent.
    name: '01p-home-pinned',
    goto: '/',
    wait: 1200,
    async setup(page, h) {
      const pinnedHeading = page.getByRole('heading', { name: 'Pinned' });
      if (!(await pinnedHeading.count())) throw new Error('home has no "Pinned" heading with a pinned note present');
      const pinnedRow = page.locator('[data-note-row]').filter({ has: page.getByRole('img', { name: 'Pinned' }) });
      if (!(await pinnedRow.count())) throw new Error('no note row under "Pinned" carries the pin glyph');
      const recentHeading = page.getByRole('heading', { name: 'Recent' });
      if (await recentHeading.count()) {
        const recentSection = page.locator('section', { has: recentHeading });
        if (await recentSection.getByText('Recipe: brown butter chocolate chip cookies').count()) {
          throw new Error('the pinned note is repeated inside "Recent"');
        }
      }
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
    // The phone's Tags sheet (Graphite: there is no drawer). The LAST tag
    // must be reachable by scrolling.
    name: '03t-tag-sheet',
    goto: '/notes',
    wait: 1200,
    viewports: ['phone'],
    async setup(page, h) {
      if (await page.getByRole('button', { name: /open (navigation|menu)/i }).count()) throw new Error('the phone still has a hamburger');
      await openPhoneTags(page, h);
      const last = page.getByRole('link', { name: /zettel/i }).first();
      if (!(await last.count())) throw new Error('last tag "zettel" not rendered in the Tags sheet');
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
    // The same ⋯ menu on the pinned fixture note (NOTE_MD): the item reads
    // "Unpin", not "Pin".
    name: '06p-editor-menu-unpin',
    async setup(page, h) {
      await openNote(page, h, NOTE_MD, '/notes/n2/edit');
      const more = page.getByRole('button', { name: /more note actions/i }).first();
      if (!(await more.count())) throw new Error('no "More note actions" button');
      await more.click();
      await h.settle(400);
      if (!(await page.getByRole('menuitem', { name: /^unpin$/i }).count())) {
        throw new Error('⋯ menu has no "Unpin" for a pinned note');
      }
      if (await page.getByRole('menuitem', { name: /^pin$/i }).count()) {
        throw new Error('⋯ menu shows "Pin" on an already-pinned note');
      }
    },
    teardown: (page, h) => h.esc(400),
  },
  {
    // The Tags tree with counts, on a nested tag route: its ancestor is
    // open, the row is highlighted. On a phone it is the Tags sheet.
    name: '07-tag-tree',
    goto: '/tags/dev%2Ffrontend',
    wait: 1200,
    async setup(page, h) {
      if (h.isPhone) await openPhoneTags(page, h);
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
    // A markdown note (the default type, and most of Chef's notes) being
    // written. Phone: the caret is in the body, so the suite top bar has
    // tucked away and the formatting toolbar is docked at the bottom.
    // Desktop: the same toolbar, inline and sticky.
    name: '03m-editor-markdown',
    async setup(page, h) {
      await openNote(page, h, NOTE_MD, '/notes/n2/edit');
      const body = page.getByRole('textbox', { name: 'Note body' });
      await body.click();
      await body.press('End');
      await h.settle(600);
      const bar = page.getByRole('toolbar', { name: 'Markdown formatting' });
      const docked = await bar.getAttribute('data-editor-toolbar');
      if (h.isPhone) {
        if (docked !== 'docked') throw new Error(`phone toolbar is ${docked}, not docked`);
        const box = await bar.boundingBox();
        const vh = page.viewportSize().height;
        if (!box || Math.abs(box.y + box.height - vh) > 40) throw new Error(`docked toolbar is not at the bottom (${box && Math.round(box.y + box.height)} of ${vh})`);
        if (await page.locator('header.MuiAppBar-root').count()) throw new Error('the top bar did not tuck away while writing');
      } else if (docked !== 'inline') {
        throw new Error(`desktop toolbar is ${docked}, not inline`);
      }
      if (!(await page.getByRole('status').filter({ hasText: /saved|editing/ }).count())) throw new Error('no quiet save status');
      if (await page.locator('[data-save-alert]').count()) throw new Error('a save alert is showing while all is fine');
    },
  },
  {
    // A save that fails: the loud state — error ink, a Retry — in the head
    // row, where the quiet status never sits.
    name: '03f-save-failed',
    async setup(page, h) {
      await bootstrapChef(page);
      await graphqlRoute(page, { ...OPS, GetNoteById: { note: NOTE_MD }, UpdateNote: { updateNote: null } });
      await page.goto(h.base + '/notes/n2/edit', { waitUntil: 'networkidle' });
      await h.settle(1200);
      const title = page.getByLabel('Note title');
      await title.click();
      await title.press('End');
      await title.type(' (v2)');
      await page.keyboard.press('Control+s');
      await h.settle(1200);
      if (!(await page.locator('[data-save-alert="error"]').count())) throw new Error('a failed save raised no alert');
      if (!(await page.getByRole('button', { name: 'Retry' }).count())) throw new Error('the save alert has no Retry');
      await title.blur();
      await h.settle(1500);
    },
  },
  {
    // Offline with unsaved edits, on a phone, while writing: the docked
    // toolbar carries the alert, because the note's head has scrolled away.
    name: '03o-offline-unsaved',
    viewports: ['phone'],
    async setup(page, h) {
      await openNote(page, h, NOTE_MD, '/notes/n2/edit');
      await page.context().setOffline(true);
      const body = page.getByRole('textbox', { name: 'Note body' });
      await body.click();
      await body.press('End');
      await body.type('\n- [ ] eggs');
      await h.settle(800);
      const bar = page.getByRole('toolbar', { name: 'Markdown formatting' });
      if (!(await bar.locator('[data-save-alert="offline"]').count())) throw new Error('offline with unsaved edits did not show in the docked toolbar');
    },
    teardown: async (page, h) => {
      await page.context().setOffline(false);
      await h.settle(200);
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
  {
    // The ⋯ menu on a sketch with ink: "Convert handwriting to text" enabled.
    name: '12a-sketch-menu',
    async setup(page, h) {
      await openSketchToTranscribe(page, h);
      await openTranscribeMenu(page, h);
    },
    teardown: (page, h) => h.esc(400),
  },
  {
    // The review step: the page as sent beside an editable transcript.
    name: '12b-sketch-review',
    async setup(page, h) {
      await reviewTranscript(page, h);
    },
    teardown: (page, h) => h.esc(400),
  },
  {
    // "Compose it": the corrected transcript handed to Compose, which offers
    // a new note only (no "Replace this note": the sketch is the original).
    name: '12c-sketch-compose',
    async setup(page, h) {
      const box = await reviewTranscript(page, h);
      await box.fill(TRANSCRIPT.replace('[?]', 'welcome'));
      await page.getByRole('button', { name: 'Compose it' }).click();
      await page.getByRole('button', { name: /save as a new note/i }).waitFor({ timeout: 20000 });
      if (await page.getByRole('button', { name: /replace this note/i }).count()) {
        throw new Error('Compose offered "Replace this note" from a sketch');
      }
      if (!(await page.getByRole('button', { name: 'Back to transcript' }).count())) {
        throw new Error('Compose from a sketch has no "Back to transcript"');
      }
      await h.settle(500);
    },
    teardown: (page, h) => h.esc(400),
  },
  {
    // The way in: the camera in Home's capture box, which opens the (empty)
    // page tray. (The New sheet / menu entries are checked in '01n-new'.)
    // /notes/new itself is now straight into a Markdown note, no picker.
    name: '13a-photo-entry',
    async setup(page, h) {
      await bootstrapChef(page);
      await graphqlRoute(page, OPS);
      await page.goto(h.base + '/notes/new', { waitUntil: 'networkidle' });
      await h.settle(600);
      if (await page.getByText(/what are you writing/i).count()) throw new Error('/notes/new still shows the type picker');
      if (!(await page.getByRole('textbox', { name: 'Note body' }).count())) throw new Error('/notes/new did not open a markdown note');
      await page.goto(h.base + '/', { waitUntil: 'networkidle' });
      await h.settle(800);
      await page.getByRole('button', { name: 'New note from a photo of a page' }).click();
      await page.waitForURL(/\/notes\/photo$/);
      await h.settle(600);
    },
  },
  {
    // The page tray: two photos, each upright (page 2 via its EXIF flag),
    // with rotate / move / remove, the count and the size meter.
    name: '13b-photo-tray',
    async setup(page, h) {
      await openPhotoTray(page, h);
      await h.settle(400);
    },
  },
  {
    // The review step with two pages: the strip beside one transcript, with
    // page markers. Two calls, source photo, in page order.
    name: '13c-photo-review',
    async setup(page, h) {
      await reviewPhotos(page, h);
    },
    teardown: (page, h) => h.esc(400),
  },
  {
    // The photo sketch note the page created, opened: tldraw must load the
    // snapshot the page built (no error screen, ours or tldraw's) and draw
    // both pages as images. Phone only: on desktop tldraw's style panel
    // brings the unlabelled-slider waiver with it, and the load is the same.
    name: '13d-photo-note',
    viewports: ['phone'],
    async setup(page, h) {
      const { photo } = await savePhotos(page, h);
      await graphqlRoute(page, { ...OPS, GetNoteById: { note: photoNote('photo1', photo.title, 'handwritten', photo.content, photo.tags) } });
      await page.goto(h.base + '/notes/photo1', { waitUntil: 'networkidle' });
      await h.settle(1800);
      if (await page.getByText(/something went wrong|failed to load/i).count()) throw new Error('the photo note rendered our error boundary');
      if (await page.locator('.tl-error-boundary').count()) throw new Error('tldraw rendered its own error screen for the photo note');
      if (await page.locator('.tl-shape-error-boundary').count()) throw new Error('tldraw could not render a photo page (shape error fallback)');
      const drawn = await page.locator('.tl-shape:not(.tl-shape-background)[data-shape-type="image"]').count();
      if (drawn !== 2) throw new Error(`tldraw drew ${drawn} image shapes, expected 2`);
      const loaded = await page.evaluate(() => [...document.querySelectorAll('.tl-shape:not(.tl-shape-background)[data-shape-type="image"] img')].filter((i) => i.complete && i.naturalWidth > 0).length);
      console.log(`  [photo note] ${h.viewport}: ${drawn} image shapes, ${loaded} decoded`);
    },
  },
  {
    // The Markdown note it made: first line links back to the photos.
    name: '13e-photo-markdown',
    async setup(page, h) {
      const { md } = await savePhotos(page, h);
      await graphqlRoute(page, { ...OPS, GetNoteById: { note: photoNote('md1', md.title, 'markdown', md.content, md.tags) } });
      await page.goto(h.base + '/notes/md1', { waitUntil: 'networkidle' });
      await h.settle(1200);
      if (!(await page.getByRole('link', { name: /^Photos · / }).count())) throw new Error('the markdown note has no link back to the photos');
    },
  },
  {
    // What real-sized photos weigh: eight 4000×3000 camera-like JPEGs (made
    // in the page: lit paper, ruled lines, ink, sensor noise) through the
    // page's own preparation. Prints bytes per prepared page and the
    // snapshot estimate; if eight fit, reads and saves them and prints the
    // exact snapshot. Synthetic, so the numbers are a guide, not a promise.
    name: '13f-photo-size',
    viewports: ['phone'],
    async setup(page, h) {
      await bootstrapChef(page);
      const calls = await stubPhotoGateway(page);
      await page.goto(h.base + '/notes/photo', { waitUntil: 'networkidle' });
      await h.settle(600);
      await page.evaluate(async () => {
        const make = async (seed) => {
          let x = seed;
          const rand = () => ((x = (x * 1103515245 + 12345) >>> 0) / 4294967296);
          const c = document.createElement('canvas');
          c.width = 4000; c.height = 3000;
          const ctx = c.getContext('2d');
          const g = ctx.createRadialGradient(1900, 1400, 300, 2000, 1500, 2700);
          g.addColorStop(0, '#f6f1e6'); g.addColorStop(1, '#b9b09f');
          ctx.fillStyle = g; ctx.fillRect(0, 0, 4000, 3000);
          ctx.strokeStyle = '#9db8d9'; ctx.lineWidth = 4;
          for (let y = 330; y < 3000; y += 92) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(4000, y + 18); ctx.stroke(); }
          ctx.strokeStyle = '#1d2b5c'; ctx.lineWidth = 7; ctx.lineCap = 'round';
          for (let line = 0; line < 24; line += 1) {
            let px = 420; const py = 310 + line * 92;
            ctx.beginPath(); ctx.moveTo(px, py);
            while (px < 3500) {
              const nx = px + 30 + rand() * 60;
              ctx.bezierCurveTo(px + 10, py - 60 * rand(), nx - 10, py + 20 * rand(), nx, py - 10 + 20 * rand());
              px = nx;
              if (rand() < 0.12) { px += 40; ctx.moveTo(px, py); }
            }
            ctx.stroke();
          }
          const img = ctx.getImageData(0, 0, 4000, 3000);
          const d = img.data;
          for (let i = 0; i < d.length; i += 4) {
            const n = (rand() + rand() - 1) * 10;
            d[i] += n; d[i + 1] += n; d[i + 2] += n;
          }
          ctx.putImageData(img, 0, 0);
          return new Promise((r) => c.toBlob(r, 'image/jpeg', 0.92));
        };
        const a = await make(7);
        const b = await make(11);
        window.__photoSourceBytes = [a.size, b.size];
        const dt = new DataTransfer();
        for (let i = 0; i < 8; i += 1) dt.items.add(new File([i % 2 ? b : a], `camera-${i + 1}.jpg`, { type: 'image/jpeg' }));
        const input = document.querySelector('input[data-photo-input="files"]');
        input.files = dt.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      });
      const deadline = Date.now() + 90000;
      while ((await page.getByText(/^\d+×\d+ · /).count()) < 8) {
        if (Date.now() > deadline) throw new Error('the eight pages were not prepared in time');
        await h.settle(300);
      }
      const sources = await page.evaluate(() => window.__photoSourceBytes);
      const dims = await page.getByText(/^\d+×\d+ · /).allTextContents();
      const meter = await page.getByText(/^8 of 8 pages · /).textContent();
      console.log(`  [photo size] camera JPEGs ${sources.join(' / ')} bytes -> prepared ${[...new Set(dims)].join(' / ')}; ${meter}`);
      const read = readButton(page, 8);
      if (await read.isEnabled()) {
        await read.click();
        await page.getByRole('textbox', { name: 'Transcript' }).waitFor({ timeout: 60000 });
        const bytes = calls.transcribe.map((v) => b64Bytes(v.image));
        console.log(`  [photo size] 8 pages sent: ${bytes.join(', ')} bytes`);
        await page.getByRole('button', { name: 'Keep as plain text' }).click();
        await page.waitForURL(/\/notes\/md1$/, { timeout: 30000 });
        // Let the new note's page finish arriving before the a11y pass: measured
        // straight after the navigation, its date caption was caught mid-fade
        // (4.42:1; the token is 5.03:1 at rest). 2026-09-27.
        await h.settle(1200);
        console.log(`  [photo size] 8-page snapshot: ${calls.create[0].content.length} chars`);
      } else {
        const why = await page.getByText(/too big for one note/).textContent();
        console.log(`  [photo size] 8 pages refused before anything was read or created: ${why}`);
        if (calls.transcribe.length || calls.create.length) throw new Error('the size guard let a call through');
      }
    },
  },
  {
    // Search: the phone's Search tab (the only path to it there), results
    // with the query under a pass of highlighter.
    name: '14-search',
    async setup(page, h) {
      await bootstrapChef(page);
      await graphqlRoute(page, { ...OPS, SearchNotes: { searchNotes: SEARCH_RESULTS } });
      await page.goto(h.base + '/', { waitUntil: 'networkidle' });
      await h.settle(800);
      if (h.isPhone) {
        if (await page.locator('header').getByRole('button', { name: /search/i }).count()) throw new Error('the phone top bar still has a search button');
        await page.locator('[data-geek-bottom-nav-item="search"]').click();
      } else {
        await page.goto(h.base + '/search', { waitUntil: 'networkidle' });
      }
      await h.settle(600);
      await page.getByPlaceholder(/search titles/i).fill('brown');
      await page.getByText(/2 results/).waitFor({ timeout: 10000 });
      await h.settle(600);
      if ((await page.locator('mark').count()) < 2) throw new Error('search hits are not marked');
      await page.getByPlaceholder(/search titles/i).blur();
      await h.settle(300);
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
  {
    // tldraw's image shape (a photo sketch note's pages, HANDWRITING.md §3)
    // renders <img class="tl-image"> with no alt. 2.4.6 has no alt-text prop
    // for images, and a replacement `image` shape util is refused
    // ("defined more than once"), so the only fix from outside is patching
    // tldraw's DOM — the same call as the slider above. Scoped to this rule,
    // this element and the photo-note scene. Drop it on tldraw 3, whose image
    // shape has `altText`.
    rule: 'image-alt',
    match: 'tl-image',
    scenes: ['13d-photo-note'],
    reason: 'tldraw 2.4 image shape <img> has no alt and no way to set one (third-party UI)',
  },
];
