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
    // Not read yet (the default fixture sketch is): a sketch whose stored
    // reading is current is shown that reading instead of being sent again
    // (AUTO_TRANSCRIBE_SPEC.md §5), and these scenes are about the sending.
    SketchTranscript: () => ({ sketchTranscript: transcriptState({ status: 'waiting', current: false, text: null, model: null, provider: null, source: null, at: null }) }),
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
import { OPS, ARCHIVED, DELETED, NOTES, conflictAnswer, transcriptState, notesPage, listRow, NOTE_COMPOSED, NOTE_SUGGESTIONS, NOTE_CODE, NOTE_MINDMAP, NOTE_SKETCH, NOTE_WIDE_TABLE, NOTE_MD, NOTE_PRINT, SEARCH_RESULTS, HYBRID_RESULTS, BEST_MATCH_RESULTS, NEAR_TIE_RESULTS, RELATED_TO_N1, NOTE_N1, NOTE_LINKED, NOTE_LINKED_LINKS, BACKLINKS_TO_NL, NOTE_SPIDERS, FOLD_IN_INPUT, FOLD_IN_PROPOSAL, SPIDERS_FOLDED, SPIDERS_SEARCH } from './fixtures.mjs';

// ── Fold-in helpers (scenes 19a-19e) ────────────────────────────────────────
// The gateway is stubbed with the proposal the real model made for this note
// (fixtures.mjs). Every call is recorded so a scene can say nothing was
// written before Apply, and that Apply sent back only what it should.
async function stubFoldIn(page, extra = {}) {
  const calls = { preview: [], apply: [], search: [], create: [] };
  let folded = false;
  await graphqlRoute(page, {
    ...OPS,
    GetNoteById: () => ({ note: folded ? { ...NOTE_SPIDERS, content: SPIDERS_FOLDED, updatedAt: new Date().toISOString() } : NOTE_SPIDERS }),
    FoldInPreview: (vars) => { calls.preview.push(vars); return { foldInPreview: FOLD_IN_PROPOSAL }; },
    FoldInApply: (vars) => {
      calls.apply.push(vars);
      folded = true;
      return { foldInApply: { __typename: 'FoldInResult', note: { ...NOTE_SPIDERS, content: SPIDERS_FOLDED, updatedAt: new Date().toISOString() }, versionId: 'v-fold', applied: vars.operations.length } };
    },
    SearchNotes: (vars) => { calls.search.push(vars); return { searchNotes: SPIDERS_SEARCH }; },
    CreateNote: (vars) => { calls.create.push(vars); return OPS.CreateNote(vars); },
    ...extra,
  });
  return calls;
}

async function openSpidersEditor(page, h) {
  await bootstrapChef(page);
  const calls = await stubFoldIn(page);
  await page.goto(h.base + '/notes/ns/edit', { waitUntil: 'networkidle' });
  await h.settle(1200);
  return calls;
}

async function openFoldIn(page, h) {
  await page.getByRole('button', { name: /more note actions/i }).first().click();
  await h.settle(400);
  const item = page.getByRole('menuitem', { name: 'Fold in new info' });
  if (!(await item.count())) throw new Error('the ⋯ menu has no "Fold in new info" on a markdown note');
  await item.click();
  await page.getByRole('dialog', { name: /fold in new info/i }).waitFor({ timeout: 5000 });
  await h.settle(500);
}

/** The sheet's primary action must be on screen, not under the fold. */
async function assertActionsOnScreen(page, h, name) {
  const btn = page.getByRole('button', { name });
  const box = await btn.boundingBox();
  const vp = page.viewportSize();
  if (!box) throw new Error(`"${name}" is not visible`);
  if (box.y + box.height > vp.height + 1 || box.y < 0) throw new Error(`"${name}" is off screen (y ${Math.round(box.y)}, viewport ${vp.height})`);
}

async function stubShareFold(page) {
  await bootstrapChef(page);
  return stubFoldIn(page);
}

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
    // The photo sketch note goes through its own document, CreatePhotoNote,
    // carrying the reviewed reading (C6, 2026-11-15); the text note through
    // the ordinary CreateNote. Both land in `calls.create`, in order, with
    // the operation that sent them.
    CreatePhotoNote: (vars) => {
      calls.create.push({ ...vars, op: 'CreatePhotoNote' });
      return { createNote: photoNote('photo1', vars.title, vars.type, vars.content, vars.tags || []) };
    },
    CreateNote: (vars) => {
      calls.create.push({ ...vars, op: 'CreateNote' });
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
  if (photo.op !== 'CreatePhotoNote') throw new Error(`the photo note was created by ${photo.op}, not CreatePhotoNote`);
  // C6: the reviewed reading rides WITH the create, so the photo note is
  // searchable even if nothing after it succeeds.
  if (!String(photo.transcriptText || '').includes('Kitchen plan')) throw new Error('the photo note was created without its reviewed reading (transcriptText)');
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

// NoteGeek's own layout split since the tablet wave (2026-11-16): the phone
// has the bottom bar, a tablet (portrait 800 AND touch landscape 1280) has
// the rail, a desktop the sidebar. `h.isPhone` is true on a portrait tablet
// (the harness's 900px rule), so NoteGeek's scenes branch on these instead.
const phoneLayout = (h) => h.viewport === 'phone';
const railLayout = (h) => h.viewport === 'tablet';
const desktopLayout = (h) => h.viewport === 'desktop';

// The tag tree: the phone's Tags sheet (from the Notes page), the tablet's
// Tags sheet (from the rail), or — on a desktop — already in the sidebar.
async function openTags(page, h) {
  if (phoneLayout(h)) return openPhoneTags(page, h);
  if (!railLayout(h)) return undefined;
  const item = page.locator('[data-geek-nav-rail-item="tags"]');
  if (!(await item.count())) throw new Error('the tablet rail has no Tags item');
  await item.click();
  await h.settle(600);
  if (!(await page.getByRole('dialog', { name: /tags/i }).count())) throw new Error('the rail\'s Tags sheet did not open');
  return undefined;
}
// Bottom bar on a phone, rail on a tablet.
const navItem = (page, id) => page.locator(`[data-geek-bottom-nav-item="${id}"], [data-geek-nav-rail-item="${id}"]`).first();

// No greeting, no "Continue" cards, and a note row in the first screen.
async function assertHomeIsNotes(page, h) {
  if (await page.getByText(/good (morning|afternoon|evening)/i).count()) throw new Error('home still has the greeting');
  if (await page.getByText(/continue where you left off/i).count()) throw new Error('home still has the Continue cards');
  if (await page.locator('.type-stamp').count()) throw new Error('a Lab Notebook type stamp is still rendered');
  const first = await page.locator('[data-note-row]').first().boundingBox();
  const vh = page.viewportSize().height;
  if (!first || first.y + first.height > vh) throw new Error(`the first note row is not on the first screen (${first ? Math.round(first.y) : 'none'} of ${vh})`);
}

// Print / Save as PDF (DOCS/CONTEXT.md §8). `window.print` is replaced with
// a recorder (a real dialog would hang a headless run); it notes the title
// and what the print view held at that moment, then fires `afterprint` the
// way the browser does when the dialog closes.
async function stubPrint(page) {
  await page.evaluate(() => {
    window.__printed = [];
    window.print = () => {
      const root = document.querySelector('body > .ng-print-root');
      window.__printed.push({
        title: document.title,
        text: root?.textContent || '',
        tables: root?.querySelectorAll('table').length || 0,
        imgs: [...(root?.querySelectorAll('img') || [])].map((i) => ({ complete: i.complete, w: i.naturalWidth })),
      });
      setTimeout(() => window.dispatchEvent(new Event('afterprint')), 0);
    };
  });
}

async function printedOnce(page, h, before) {
  await page.waitForFunction(() => window.__printed.length > 0, null, { timeout: 20000 });
  await h.settle(200);
  const [printed] = await page.evaluate(() => window.__printed);
  if (await page.title() !== before) throw new Error(`document.title was not restored after printing (${await page.title()})`);
  return printed;
}

async function printFromMenu(page, h) {
  await stubPrint(page);
  const before = await page.title();
  await page.getByRole('button', { name: /more note actions/i }).first().click();
  await h.settle(400);
  const item = page.getByRole('menuitem', { name: /print or save as pdf/i });
  if (!(await item.count())) throw new Error('⋯ menu has no "Print or save as PDF"');
  await item.click();
  return printedOnce(page, h, before);
}

// Markdown import (DOCS/CONTEXT.md §9). CreateNote answers with the note it
// was asked for, and every call's variables are kept for the scene to check.
async function stubImportCreates(page) {
  const created = [];
  await graphqlRoute(page, {
    ...OPS,
    CreateNote: (vars) => {
      created.push(vars);
      return {
        createNote: {
          __typename: 'Note', id: `imp${created.length}`, title: vars.title, content: vars.content,
          type: vars.type, tags: vars.tags || [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        },
      };
    },
    GetNoteById: (vars) => {
      const v = created[Number(String(vars.id).replace('imp', '')) - 1];
      return {
        note: v ? {
          __typename: 'Note', id: vars.id, title: v.title, content: v.content, type: v.type, tags: [],
          isLocked: false, isEncrypted: false, pinned: false, pinnedAt: null,
          createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        } : null,
      };
    },
  });
  return created;
}

// A drag of files over the window, the way the OS hands it to the page.
async function dragFiles(page, type, files) {
  await page.evaluate(({ type, files }) => {
    const dt = new DataTransfer();
    for (const f of files) dt.items.add(new File([f.body], f.name, { type: f.type || '' }));
    const target = document.elementFromPoint(innerWidth / 2, innerHeight / 2) || document.body;
    target.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt }));
  }, { type, files });
}

// In print media the note's paper copy is all there is; on screen it is not there at all.
async function assertPrintMedia(page) {
  const read = () => page.evaluate(() => ({
    view: getComputedStyle(document.querySelector('body > .ng-print-root')).display,
    app: getComputedStyle(document.getElementById('root')).display,
  }));
  const onScreen = await read();
  await page.emulateMedia({ media: 'print' });
  const onPaper = await read();
  await page.emulateMedia({ media: null });
  if (onScreen.view !== 'none') throw new Error('the print view shows on screen');
  if (onPaper.view === 'none' || onPaper.app !== 'none') throw new Error(`print media: view ${onPaper.view}, app ${onPaper.app}`);
}

// ── Select mode, Compose from several notes, Archive (scenes 20a-20f) ───────
// DOCS/COMPOSE_MANY_AND_ARCHIVE_SPEC.md §5. Every call is recorded so a scene
// can say what was (and was not) sent. Registered on the PAGE, last, so it
// wins over routes earlier scenes left behind.
async function stubSelect(page, extra = {}) {
  const calls = { compose: [], create: [], archive: [], restore: [] };
  await graphqlRoute(page, {
    ...OPS,
    ComposeNotes: (vars) => { calls.compose.push(vars); return OPS.ComposeNotes; },
    CreateNote: (vars) => { calls.create.push(vars); return { createNote: NOTE_COMPOSED }; },
    ArchiveNotes: (vars) => { calls.archive.push(vars); return OPS.ArchiveNotes(vars); },
    RestoreNotes: (vars) => { calls.restore.push(vars); return OPS.RestoreNotes(vars); },
    ...extra,
  });
  return calls;
}

const rowFor = (page, title) => page.locator('[data-note-row]').filter({ hasText: title }).first();

// A held finger (~700 ms, no movement) — the phone's way in.
async function longPress(page, locator) {
  const b = await locator.boundingBox();
  if (!b) throw new Error('nothing to long-press');
  await page.mouse.move(b.x + b.width / 2, b.y + Math.min(20, b.height / 2));
  await page.mouse.down();
  await page.waitForTimeout(700);
  await page.mouse.up();
}

// Into select mode with three notes picked: the roadmap, the standup notes
// and the sketch (which Compose will skip). Phone: long-press the first row.
// Desktop: the header's Select button.
async function selectThree(page, h) {
  if (phoneLayout(h)) {
    await longPress(page, rowFor(page, 'Q3 roadmap notes'));
  } else {
    await page.getByRole('button', { name: 'Select', exact: true }).click();
    await page.getByRole('checkbox', { name: /Q3 roadmap notes/ }).click();
  }
  await h.settle(300);
  if (/\/notes\/n1/.test(page.url())) throw new Error('the long press opened the note');
  const first = page.getByRole('checkbox', { name: /Q3 roadmap notes/ });
  if ((await first.getAttribute('aria-checked')) !== 'true') throw new Error('the first row is not selected after entering select mode');
  await page.getByRole('checkbox', { name: /Standup snippets/ }).click();
  await page.getByRole('checkbox', { name: /Sketch: onboarding flow/ }).click();
  await h.settle(300);
  if (!(await page.getByText('3 selected').count())) throw new Error('the header does not read "3 selected"');
}

async function assertBarInThumbZone(page, h) {
  const bar = page.getByRole('toolbar', { name: 'Selected notes' });
  const b = await bar.boundingBox();
  if (!b) throw new Error('no action bar in select mode');
  const vh = page.viewportSize().height;
  if (phoneLayout(h)) {
    const nav = await page.locator('[data-geek-bottom-nav]').boundingBox();
    if (!nav) throw new Error('the tab bar is gone in select mode');
    if (b.y + b.height > nav.y + 1) throw new Error(`the action bar (bottom ${Math.round(b.y + b.height)}) overlaps the tab bar (top ${Math.round(nav.y)})`);
  } else if (b.y + b.height < vh - 2) {
    throw new Error(`the action bar is not at the bottom (bottom ${Math.round(b.y + b.height)} of ${vh})`);
  }
}

async function openComposeMany(page, h, calls) {
  await page.goto(h.base + '/notes', { waitUntil: 'networkidle' });
  await h.settle(1000);
  await selectThree(page, h);
  await page.getByRole('button', { name: 'Compose 3 notes' }).click();
  await page.getByRole('heading', { name: 'Shipping' }).waitFor({ timeout: 10000 });
  await h.settle(500);
  if (calls.compose.length !== 1) throw new Error(`composeNotes called ${calls.compose.length} times`);
  // The fixture notes share a createdAt, so only the set is checked here;
  // oldest-first ordering is unit-tested (composeMany.test.jsx).
  const sent = [...calls.compose[0].noteIds].sort().join(',');
  if (sent !== 'n1,n3,n5') throw new Error(`composeNotes sent ${sent}`);
}

// The editor mirrors unsaved work to IndexedDB (utils/draftStore.js) and
// offers it back the next time the note is opened. One browser context serves
// every scene of a viewport, so a scene that leaves an edit unsaved (the
// failed save, the offline one, anything typed and abandoned) would put a
// "Restore unsaved changes" banner on whichever later scene opens that note.
// Every scene therefore ends by forgetting the device's drafts.
//
// The app must be gone first: a dirty editor writes its draft again on
// `pagehide`, so clearing while it is still on screen is undone by the very
// navigation that starts the next scene. The detour is a blank same-origin
// page served by the harness (every scene navigates for itself, so none
// depends on where the last one stopped).
const BLANK = '/__harness_blank';
const blankRouted = new WeakSet();
async function clearDrafts(page, h) {
  try {
    if (!blankRouted.has(page)) {
      blankRouted.add(page);
      await page.route(`**${BLANK}`, (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>blank</title>' }));
    }
    await page.goto(h.base + BLANK, { waitUntil: 'load' });
    await page.evaluate(() => new Promise((resolve) => {
      const req = indexedDB.deleteDatabase('notegeek-drafts');
      req.onsuccess = req.onerror = () => resolve();
      // Still held by the page that just left: the delete completes as soon
      // as that connection closes, ahead of the next page's open().
      req.onblocked = () => resolve();
    }));
  } catch (err) {
    // A scene must not fail on its cleanup, but a cleanup that silently does
    // nothing is how a leftover draft shows up three scenes later.
    console.log(`  [drafts] could not clear the device drafts: ${String(err.message || err).split('\n')[0]}`);
  }
}
const withCleanDrafts = (scene) => ({
  ...scene,
  // The runner skips teardown for a scene whose setup threw, and a failed
  // scene is exactly the one that leaves an edit behind.
  ...(scene.setup ? {
    async setup(page, h) {
      try {
        return await scene.setup(page, h);
      } catch (err) {
        await clearDrafts(page, h);
        throw err;
      }
    },
  } : {}),
  async teardown(page, h) {
    try {
      if (scene.teardown) await scene.teardown(page, h);
    } finally {
      await clearDrafts(page, h);
    }
  },
});

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
      if (!desktopLayout(h)) {
        await navItem(page, 'new').click();
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
    // The pen's colour and size (2026-09-27, phone; every size since
    // 2026-11-14). tldraw's style panel is hidden, so this popup is the only
    // way to change the pen.
    name: '03p-sketch-pen',
    goto: '/notes/new?type=handwritten',
    wait: 2500,
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
    // The pen diagnostic (2026-11-14): unlinked, but a screen all the same.
    name: '90-labs-pen',
    goto: '/labs/pen',
    wait: 800,
  },
  {
    // Sketch paper (2026-11-14): the Paper menu, then Warm paper + Lined, so
    // the screenshot shows the ruled page behind the toolbar.
    name: '03q-sketch-paper',
    goto: '/notes/new?type=handwritten',
    wait: 2500,
    async setup(page, h) {
      await h.settle(800);
      await page.getByRole('button', { name: 'Paper', exact: true }).click();
      await h.settle(400);
      const menu = page.getByRole('dialog', { name: 'Paper' });
      if (!(await menu.count())) throw new Error('paper menu did not open');
      await menu.getByRole('button', { name: 'Paper: Warm paper' }).click();
      await menu.getByRole('button', { name: 'Lines: Lined' }).click();
      await h.settle(300);
      const bg = await page.locator('.tl-background').first().evaluate((el) => getComputedStyle(el).backgroundColor);
      if (bg !== 'rgb(244, 238, 223)') throw new Error(`paper is ${bg}, not warm`);
    },
    teardown: async (page, h) => {
      await h.esc(300);
      await page.evaluate(() => localStorage.removeItem('notegeek:sketchPaper'));
    },
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
      if (!desktopLayout(h)) await openTags(page, h);
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
      if (!desktopLayout(h)) await h.esc(400);
    },
  },
  {
    // Nested tags (2026-09-30): the PARENT view. /tags/house lists everything
    // under house — its own note and both sub-tags' — with the sub-tag named
    // on each row, a breadcrumb back up, and a row of sub-tags to go down.
    name: '16a-tag-parent-view',
    goto: '/tags/house',
    wait: 1200,
    async setup(page, h) {
      for (const title of ['Garage shelving plan', 'Kitchen tap washer', 'House insurance renewal']) {
        if (!(await page.locator('[data-note-row]').filter({ hasText: title }).count())) {
          throw new Error(`the house view does not list "${title}" (under: not applied?)`);
        }
      }
      const garageRow = page.locator('[data-note-row]').filter({ hasText: 'Garage shelving plan' });
      if (!/garage/.test(await garageRow.innerText())) throw new Error('the row does not name its sub-tag');
      const sub = page.getByRole('navigation', { name: 'Sub-tags of house' });
      if (!(await sub.count())) throw new Error('no sub-tag row on the parent view');
      for (const name of [/^garage\s*\d+$/, /^kitchen\s*\d+$/]) {
        if (!(await sub.getByRole('link', { name }).count())) throw new Error(`sub-tag link ${name} missing`);
      }
      if (!(await page.getByRole('heading', { level: 1, name: 'house' }).count())) throw new Error('no "house" heading');
    },
  },
  {
    // Rename or move, from the tag tree's ⋯ (the Tags sheet on a phone). The
    // helper says the sub-tags come along; a move into its own descendant is
    // refused in the dialog before anything is sent.
    name: '16b-tag-rename-dialog',
    goto: '/tags/house',
    wait: 1200,
    async setup(page, h) {
      if (!desktopLayout(h)) await openTags(page, h);
      await page.getByRole('button', { name: 'Tag options for house' }).first().click();
      await h.settle(300);
      await page.getByRole('menuitem', { name: /rename or move/i }).click();
      await h.settle(500);
      const field = page.getByRole('textbox', { name: 'Tag path' });
      if (!(await field.count())) throw new Error('the rename dialog did not open');
      await field.fill('house/garage');
      await h.settle(200);
      if (!(await page.getByText("#house can't move inside itself.").count())) throw new Error('no refusal for a move into its own descendant');
      await field.fill('home/house');
      await h.settle(300);
      if (!(await page.getByText(/sub-tags and their notes come along/i).count())) throw new Error('the helper text is missing');
      // Spec A8: what the rename touches, archived notes included.
      const touched = 'Changes #house and its 2 sub-tags on 3 notes (and 1 archived).';
      if (!(await page.getByText(touched).count())) throw new Error(`the rename dialog does not say "${touched}"`);
    },
    teardown: async (page, h) => {
      await h.esc(400);
      if (!desktopLayout(h)) await h.esc(400);
    },
  },
  {
    // Delete, as a real dialog with the blast radius from noteTagUsage.
    name: '16c-tag-delete-dialog',
    goto: '/tags/house',
    wait: 1200,
    async setup(page, h) {
      if (!desktopLayout(h)) await openTags(page, h);
      await page.getByRole('button', { name: 'Tag options for house' }).first().click();
      await h.settle(300);
      await page.getByRole('menuitem', { name: /delete tag/i }).click();
      await h.settle(800);
      const text = 'Removes #house and its 2 sub-tags from 3 notes (and 1 archived). The notes stay.';
      if (!(await page.getByText(text).count())) throw new Error(`the delete dialog does not say "${text}"`);
    },
    teardown: async (page, h) => {
      await h.esc(400);
      if (!desktopLayout(h)) await h.esc(400);
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
      if (phoneLayout(h)) {
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
      // A saved sketch opens to be READ (2026-11-15): on the hand tool (a
      // stray touch pans, it does not scribble), with the whole drawing in view.
      const bar = page.getByRole('toolbar', { name: 'Drawing tools' });
      if (await bar.count()) {
        if ((await bar.getByRole('button', { name: 'Move', exact: true }).getAttribute('aria-pressed')) !== 'true') {
          throw new Error('a saved sketch did not open on the hand (Move) tool');
        }
      }
      const fit = await page.evaluate(() => {
        const box = document.querySelector('.tl-container')?.getBoundingClientRect();
        const shapes = [...document.querySelectorAll('.tl-shape')].map((el) => el.getBoundingClientRect()).filter((r) => r.width && r.height);
        if (!box || !shapes.length) return null;
        return { total: shapes.length, inside: shapes.filter((r) => r.left >= box.left - 1 && r.right <= box.right + 1 && r.top >= box.top - 1 && r.bottom <= box.bottom + 1).length };
      });
      if (!fit) throw new Error('the sketch drew no shapes');
      if (fit.inside !== fit.total) throw new Error(`fit-to-content: only ${fit.inside} of ${fit.total} shapes are inside the canvas`);
    },
  },
  {
    // The sketch's status line, tapped (review 2.11): the detail that used to
    // be a hover tooltip, with "View text".
    name: '10t-sketch-transcript-status',
    async setup(page, h) {
      await openNote(page, h, NOTE_SKETCH, '/notes/n3/edit');
      const status = page.locator('[data-transcript-status="searchable"]');
      if (!(await status.count())) throw new Error('a read sketch does not say it is searchable');
      await status.click();
      await h.settle(400);
      if (!(await page.getByRole('button', { name: 'View text' }).count())) throw new Error('the status detail has no "View text"');
    },
    teardown: (page, h) => h.esc(400),
  },
  {
    // "View text": the reading itself (full screen on a phone).
    name: '10u-sketch-transcript-text',
    async setup(page, h) {
      await openNote(page, h, NOTE_SKETCH, '/notes/n3/edit');
      await page.locator('[data-transcript-status="searchable"]').click();
      await page.getByRole('button', { name: 'View text' }).click();
      await page.getByRole('dialog', { name: /The handwriting, as read/ }).waitFor({ timeout: 5000 });
      await h.settle(500);
    },
    teardown: (page, h) => h.esc(400),
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
    // "Send tasks to TodoGeek" (DOCS/BUJO_HANDWRITING.md): the page read as a
    // bullet journal. The stubbed transcript has one journal line, with a
    // word the model could not read, so the row shows its "Check the [?]".
    name: '12d-sketch-send-tasks',
    async setup(page, h) {
      await openSketchToTranscribe(page, h);
      await page.getByRole('button', { name: /more note actions/i }).first().click();
      await h.settle(400);
      const item = page.getByRole('menuitem', { name: /send tasks to todogeek/i });
      if (!(await item.count())) throw new Error('⋯ menu has no "Send tasks to TodoGeek" on a sketch');
      await item.click();
      const row = page.getByRole('checkbox', { name: /Task: ask Heather/ });
      await row.waitFor({ timeout: 20000 });
      if (!(await row.isChecked())) throw new Error('an open task line is not ticked by default');
      if (!(await page.getByText('Check the [?]').count())) throw new Error('the unreadable word is not flagged');
      if (!(await page.getByRole('button', { name: 'Send 1 to TodoGeek' }).count())) throw new Error('no Send button for the ticked line');
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
      await graphqlRoute(page, {
        ...OPS,
        GetNoteById: { note: photoNote('photo1', photo.title, 'handwritten', photo.content, photo.tags) },
        // Photo pages are never read automatically (the gateway says `off`);
        // their reviewed reading went in with the create.
        SketchTranscript: () => ({ sketchTranscript: transcriptState({ status: 'off', current: false, text: null, model: null, provider: null, source: null, at: null }) }),
      });
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
      if (!desktopLayout(h)) {
        if (await page.locator('header').getByRole('button', { name: /search/i }).count()) throw new Error('the top bar still has a search button');
        await navItem(page, 'search').click();
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
  {
    // Hybrid search (DOCS/CONTEXT.md §11): the note with the typed words
    // first, marked; then notes found by meaning, unmarked, each with a quiet
    // "similar" and the passage that matched. Results update as you type.
    name: '14h-search-hybrid',
    async setup(page, h) {
      await bootstrapChef(page);
      let searches = 0;
      let keywordOnly = 0;
      await graphqlRoute(page, {
        ...OPS,
        SearchNotes: (vars) => {
          searches += 1;
          if (vars.hybrid !== true) keywordOnly += 1;
          return { searchNotes: HYBRID_RESULTS };
        },
      });
      await page.goto(h.base + '/search', { waitUntil: 'networkidle' });
      await h.settle(600);
      const box = page.getByPlaceholder(/search titles/i);
      await box.pressSequentially('fix the garage', { delay: 40 });
      await page.getByText(/3 results · 2 similar/).waitFor({ timeout: 10000 });
      await h.settle(600);
      if (searches < 1) throw new Error('typing did not search');
      if (keywordOnly) throw new Error('a search did not ask for hybrid results');
      if ((await page.locator('[data-match="meaning"]').count()) !== 2) throw new Error('meaning hits are not marked "similar"');
      const meaningRow = page.locator('[data-note-row]').filter({ has: page.locator('[data-match="meaning"]') }).first();
      if (await meaningRow.locator('mark').count()) throw new Error('a meaning hit has highlighted words');
      if (!(await page.locator('[data-note-row]').first().locator('mark').count())) throw new Error('the keyword hit is not highlighted');
      await box.blur();
      await h.settle(300);
    },
  },
  {
    // Best match (DOCS/CONTEXT.md §11): the gateway named one clear answer.
    // It sits first in its own "Best match" region — highlighter label, the
    // matched passage at up to four lines — and the rest follow under the
    // quieter "Also related".
    name: '14i-search-best-match',
    async setup(page, h) {
      await bootstrapChef(page);
      await graphqlRoute(page, { ...OPS, SearchNotes: { searchNotes: BEST_MATCH_RESULTS } });
      await page.goto(h.base + '/search?q=' + encodeURIComponent('what pills do I take every day'), { waitUntil: 'networkidle' });
      const best = page.getByRole('region', { name: 'Best match' });
      await best.waitFor({ timeout: 10000 });
      await h.settle(600);
      const also = page.getByRole('region', { name: 'Also related' });
      if ((await also.count()) !== 1) throw new Error('no "Also related" region');
      if ((await best.getByRole('link').count()) !== 1) throw new Error('the best-match block should hold exactly one note');
      if (!(await best.getByText('Meds and supplements').count())) throw new Error('wrong note in the best-match block');
      if ((await also.getByRole('link').count()) !== 2) throw new Error('the other two results are not under "Also related"');
      const [bBox, aBox, rowBox] = await Promise.all([best.boundingBox(), also.boundingBox(), best.getByRole('link').boundingBox()]);
      if (!(bBox && aBox && bBox.y < aBox.y)) throw new Error('best match is not above the rest');
      if (rowBox.height < 44) throw new Error(`best-match row is ${rowBox.height}px tall, under 44`);
      await page.getByPlaceholder(/search titles/i).blur();
      await h.settle(300);
    },
  },
  {
    // Near-tie: three good answers, none clearly first — no best match, so
    // the page is the plain list it always was: no headings, no block.
    name: '14j-search-near-tie',
    async setup(page, h) {
      await bootstrapChef(page);
      await graphqlRoute(page, { ...OPS, SearchNotes: { searchNotes: NEAR_TIE_RESULTS } });
      await page.goto(h.base + '/search?q=' + encodeURIComponent('how do I log into the server'), { waitUntil: 'networkidle' });
      await page.getByText(/3 results · 1 similar/).waitFor({ timeout: 10000 });
      await h.settle(600);
      if (await page.locator('[data-search-best]').count()) throw new Error('a near-tie got a best-match block');
      if (await page.getByRole('heading', { name: /Also related|Best match/ }).count()) throw new Error('a near-tie got section headings');
      if ((await page.locator('[data-note-row]').count()) !== 3) throw new Error('rows missing');
      await page.getByPlaceholder(/search titles/i).blur();
      await h.settle(300);
    },
  },
  {
    // Related notes under the read-only viewer: own query, quiet list,
    // 44px rows. Scrolled into view for the screenshot.
    name: '17a-related-viewer',
    async setup(page, h) {
      await page.route('**/api/users/bootstrap', (r) => json(r, {
        identity: { username: 'chef', email: 'chef@example.com' },
        profile: { displayName: 'Chef Crocker' },
        preferences: {},
        appPreferences: { notegeek: { suggestOnSave: false } },
      }));
      await graphqlRoute(page, {
        ...OPS,
        GetNoteById: { note: NOTE_N1 },
        RelatedNotes: (vars) => ({ relatedNotes: vars.noteId === 'n1' ? RELATED_TO_N1 : [] }),
      });
      await page.goto(h.base + '/notes/n1', { waitUntil: 'networkidle' });
      await h.settle(1200);
      const section = page.locator('[data-related-notes]');
      await section.waitFor({ timeout: 10000 });
      if (!(await section.getByRole('heading', { name: 'Related notes' }).count())) throw new Error('no "Related notes" heading');
      if ((await section.getByRole('link').count()) !== 3) throw new Error('related rows missing');
      await section.scrollIntoViewIfNeeded();
      await h.settle(400);
    },
  },
  {
    // The same section at the foot of the editor (markdown note n2), after
    // the body; absent on canvases.
    name: '17b-related-editor',
    async setup(page, h) {
      await page.route('**/api/users/bootstrap', (r) => json(r, {
        identity: { username: 'chef', email: 'chef@example.com' },
        profile: { displayName: 'Chef Crocker' },
        preferences: {},
        appPreferences: { notegeek: { suggestOnSave: false } },
      }));
      await graphqlRoute(page, {
        ...OPS,
        GetNoteById: { note: NOTE_MD },
        RelatedNotes: { relatedNotes: RELATED_TO_N1.slice(0, 2) },
      });
      await page.goto(h.base + '/notes/n2/edit', { waitUntil: 'networkidle' });
      await h.settle(1400);
      const section = page.locator('[data-related-notes]');
      await section.waitFor({ timeout: 10000 });
      await section.scrollIntoViewIfNeeded();
      await h.settle(400);
    },
  },
  {
    // The [[ picker: typing `[[garage` in the markdown editor lists matching
    // titles (prefix first). Phone: docked above the formatting toolbar,
    // which is docked above the keyboard; desktop: under the caret. ↓ moves
    // the highlight; the screenshot is the open picker.
    name: '18a-link-picker',
    async setup(page, h) {
      await openNote(page, h, NOTE_MD, '/notes/n2/edit');
      const body = page.getByRole('textbox', { name: 'Note body' });
      await body.click();
      await page.keyboard.press('Control+End');
      await page.keyboard.type('\n\nSee [[garage', { delay: 40 });
      const list = page.getByRole('listbox', { name: 'Link to a note' });
      await list.waitFor({ timeout: 10000 });
      await h.settle(400);
      const opts = list.getByRole('option');
      if ((await opts.count()) < 2) throw new Error('the picker did not list matching titles');
      if (!/garage/i.test(await opts.first().innerText())) throw new Error('prefix match is not first');
      if (!(await body.getAttribute('aria-activedescendant'))) throw new Error('the textarea does not point at the active row');
      const box = await page.locator('[data-wikilink-picker]').boundingBox();
      const vp = page.viewportSize();
      if (!box || box.y < 0 || box.y + box.height > vp.height + 1) throw new Error(`the picker runs off-screen (${ JSON.stringify(box) })`);
      await page.keyboard.press('ArrowDown');
      await h.settle(200);
    },
  },
  {
    // Choosing from the picker writes [[Title]] and closes it.
    name: '18b-link-inserted',
    async setup(page, h) {
      await openNote(page, h, NOTE_MD, '/notes/n2/edit');
      const body = page.getByRole('textbox', { name: 'Note body' });
      await body.click();
      await page.keyboard.press('Control+End');
      await page.keyboard.type('\n\nSee [[garage', { delay: 40 });
      const list = page.getByRole('listbox', { name: 'Link to a note' });
      await list.getByRole('option', { name: 'Garage shelving plan' }).waitFor({ timeout: 10000 });
      await page.keyboard.press('Enter');
      await h.settle(300);
      if (await page.getByRole('listbox', { name: 'Link to a note' }).count()) throw new Error('the picker stayed open');
      const value = await body.inputValue();
      if (!/See \[\[Garage shelving plan\]\]$/.test(value)) throw new Error(`not inserted: …${ value.slice(-40) }`);
      await body.blur();
      await h.settle(300);
    },
  },
  {
    // Rendered [[links]] in the viewer: a resolved one is an ink link to the
    // note, an unresolved one is quieter and dashed (tap to create it). Below
    // the note: "Linked from" (the linking sentence) above "Related notes".
    name: '18c-links-viewer',
    async setup(page, h) {
      await page.route('**/api/users/bootstrap', (r) => json(r, {
        identity: { username: 'chef', email: 'chef@example.com' },
        profile: { displayName: 'Chef Crocker' },
        preferences: {},
        appPreferences: { notegeek: { suggestOnSave: false } },
      }));
      await graphqlRoute(page, {
        ...OPS,
        GetNoteById: { note: NOTE_LINKED },
        NoteLinks: { note: { __typename: 'Note', id: 'nl', links: NOTE_LINKED_LINKS } },
        Backlinks: { backlinks: BACKLINKS_TO_NL },
        RelatedNotes: { relatedNotes: RELATED_TO_N1.slice(0, 2) },
      });
      await page.goto(h.base + '/notes/nl', { waitUntil: 'networkidle' });
      await h.settle(1200);
      const resolved = page.locator('a[data-wikilink="resolved"]');
      await resolved.waitFor({ timeout: 10000 });
      if ((await resolved.getAttribute('href')) !== '/notes/h1') throw new Error('resolved link does not go to the note');
      if ((await resolved.innerText()) !== 'the shelving plan') throw new Error('alias text not shown');
      const missing = page.locator('a[data-wikilink="missing"]');
      if ((await missing.getAttribute('href')) !== '/notes/new?title=Opener%20manual') throw new Error('unresolved link does not offer to create the note');
      const linked = page.locator('[data-linked-from]');
      const related = page.locator('[data-related-notes]');
      await linked.waitFor({ timeout: 10000 });
      await related.waitFor({ timeout: 10000 });
      const [ly, ry] = [await linked.boundingBox(), await related.boundingBox()];
      if (!(ly && ry && ly.y < ry.y)) throw new Error('"Linked from" is not above "Related notes"');
      if (!(await linked.getByRole('heading', { name: 'Linked from' }).count())) throw new Error('no "Linked from" heading');
      if (!desktopLayout(h)) await linked.scrollIntoViewIfNeeded();
      await h.settle(400);
    },
  },
  {
    // An unresolved [[Opener manual]]: tapping it opens a new note with that
    // title already in place (not saved until you write).
    name: '18d-link-create',
    async setup(page, h) {
      await page.route('**/api/users/bootstrap', (r) => json(r, {
        identity: { username: 'chef', email: 'chef@example.com' },
        profile: { displayName: 'Chef Crocker' },
        preferences: {},
        appPreferences: { notegeek: { suggestOnSave: false } },
      }));
      let creates = 0;
      await graphqlRoute(page, {
        ...OPS,
        GetNoteById: { note: NOTE_LINKED },
        NoteLinks: { note: { __typename: 'Note', id: 'nl', links: NOTE_LINKED_LINKS } },
        CreateNote: (vars) => { creates += 1; return OPS.CreateNote(vars); },
      });
      await page.goto(h.base + '/notes/nl', { waitUntil: 'networkidle' });
      await h.settle(1000);
      await page.locator('a[data-wikilink="missing"]').click();
      await page.waitForURL(/\/notes\/new\?title=Opener%20manual/, { timeout: 10000 });
      await h.settle(1200);
      const title = page.getByRole('textbox', { name: 'Note title' });
      if ((await title.inputValue()) !== 'Opener manual') throw new Error('the new note did not get the link\'s title');
      if (creates) throw new Error('a note was saved before anything was written');
    },
  },
  {
    // Print / Save as PDF from the ⋯ menu on a markdown note: the dialog
    // opens with the note's title as the document title (the PDF's suggested
    // filename), the paper copy holds the rendered table and the link's URL,
    // and print media shows only it. The screenshot is the ⋯ menu.
    name: '14a-print-markdown',
    async setup(page, h) {
      await openNote(page, h, NOTE_PRINT, '/notes/np/edit');
      const printed = await printFromMenu(page, h);
      if (printed.title !== 'Deploy checklist') throw new Error(`printed with document.title "${printed.title}"`);
      if (!printed.tables) throw new Error('the paper copy has no table');
      if (!printed.text.includes('https://example.com/runbook')) throw new Error('the link URL is not printed after the link');
      await assertPrintMedia(page);
      await page.getByRole('button', { name: /more note actions/i }).first().click();
      await h.settle(400);
    },
    teardown: (page, h) => h.esc(400),
  },
  {
    // The read-only viewer (/notes/:id) prints too, from its own button.
    name: '14v-print-viewer',
    async setup(page, h) {
      await openNote(page, h, NOTE_PRINT, '/notes/np');
      await stubPrint(page);
      const before = await page.title();
      await page.getByRole('button', { name: 'Print or save as PDF' }).first().click();
      const printed = await printedOnce(page, h, before);
      if (printed.title !== 'Deploy checklist') throw new Error(`viewer printed with document.title "${printed.title}"`);
      await assertPrintMedia(page);
    },
  },
  {
    // A sketch prints as an image of its ink: exported by tldraw just before
    // the dialog, and loaded by the time it opens.
    name: '14b-print-sketch',
    async setup(page, h) {
      await openNote(page, h, NOTE_SKETCH, '/notes/n3/edit');
      const printed = await printFromMenu(page, h);
      if (printed.imgs.length !== 1) throw new Error(`the sketch printed ${printed.imgs.length} images`);
      if (!printed.imgs[0].complete || !printed.imgs[0].w) throw new Error('the sketch image had not loaded when the dialog opened');
      console.log(`  [sketch print] ${h.viewport}: ${printed.imgs[0].w}px wide`);
      await assertPrintMedia(page);
    },
  },
  {
    // "Import a Markdown file" from New (the phone's sheet; desktop's menu):
    // the real file chooser, one .md picked, one Markdown note made — titled
    // from its heading, heading out of the body — and opened.
    name: '15a-import-picker',
    goto: '/',
    wait: 1200,
    async setup(page, h) {
      const created = await stubImportCreates(page);
      let entry;
      if (!desktopLayout(h)) {
        await navItem(page, 'new').click();
        await h.settle(600);
        entry = page.getByRole('dialog', { name: /new/i }).getByRole('button', { name: /import a markdown file/i });
      } else {
        await page.getByRole('button', { name: 'More kinds of note' }).click();
        await h.settle(400);
        entry = page.getByRole('menuitem', { name: /import markdown files/i });
      }
      if (!(await entry.count())) throw new Error('New offers no Markdown import');
      const [chooser] = await Promise.all([page.waitForEvent('filechooser', { timeout: 10000 }), entry.click()]);
      if (!chooser.isMultiple()) throw new Error('the import picker takes one file only');
      await chooser.setFiles({ name: 'Lisbon trip.md', mimeType: 'application/octet-stream', buffer: Buffer.from('# Lisbon trip\n\n- Day one: Alfama\n- Day two: Belém\n') });
      await page.waitForURL(/\/notes\/imp1$/, { timeout: 10000 });
      await h.settle(900);
      if (created.length !== 1) throw new Error(`expected one createNote, saw ${created.length}`);
      const v = created[0];
      if (v.type !== 'markdown' || v.title !== 'Lisbon trip' || v.content.startsWith('#')) {
        throw new Error(`created ${JSON.stringify(v).slice(0, 160)}`);
      }
    },
  },
  {
    // Files dragged over the notes list: the drop zone covers the page.
    name: '15b-import-dropzone',
    goto: '/notes',
    wait: 1200,
    async setup(page, h) {
      await dragFiles(page, 'dragenter', [{ name: 'a.md', body: '# A' }]);
      await h.settle(300);
      if (!(await page.locator('[data-import-dropzone]').isVisible())) throw new Error('no drop zone while files are over the page');
    },
    async teardown(page, h) {
      await dragFiles(page, 'dragleave', []);
      await h.settle(200);
    },
  },
  {
    // Two .md and a .png dropped: two notes, the picture skipped with a
    // toast, and the list stays put saying how many landed.
    name: '15c-import-drop',
    goto: '/notes',
    wait: 1200,
    async setup(page, h) {
      const created = await stubImportCreates(page);
      await dragFiles(page, 'dragenter', [{ name: 'a.md', body: '' }]);
      await dragFiles(page, 'drop', [
        { name: 'Standup.md', body: '# Standup\n\nNothing blocking.' },
        { name: 'photo.png', body: 'x', type: 'image/png' },
        { name: 'ideas.txt', body: 'one\ntwo' },
      ]);
      await page.getByText('Imported 2 notes.').waitFor({ timeout: 10000 });
      if (created.map((c) => c.title).join('|') !== 'Standup|ideas') throw new Error(`created ${created.map((c) => c.title)}`);
      if (!/\/notes$/.test(page.url())) throw new Error(`a multi-file drop navigated to ${page.url()}`);
      if (await page.locator('[data-import-dropzone]').count()) throw new Error('the drop zone stayed up after the drop');
    },
  },
  // ── Fold in new info (DOCS/CONTEXT.md §13) ─────────────────────────────
  {
    // The ⋯ menu's "Fold in new info" on a markdown note opens the sheet;
    // the new info typed in. On a phone it is full height and its actions
    // sit inside the screen.
    name: '19a-foldin-input',
    async setup(page, h) {
      const calls = await openSpidersEditor(page, h);
      await openFoldIn(page, h);
      await page.getByRole('textbox', { name: 'New info' }).fill(FOLD_IN_INPUT);
      await h.settle(400);
      await assertActionsOnScreen(page, h, 'Propose changes');
      if (calls.preview.length) throw new Error('a proposal was asked for before Propose');
    },
    teardown: (page, h) => h.esc(500),
  },
  {
    // The proposal: three change cards in note order (a correction struck
    // through beside the new text, a list item, a table row), the dropped
    // suggestion disclosed, the unplaced line kept with Copy, Apply 3.
    name: '19b-foldin-proposal',
    async setup(page, h) {
      const calls = await openSpidersEditor(page, h);
      await openFoldIn(page, h);
      await page.getByRole('textbox', { name: 'New info' }).fill(FOLD_IN_INPUT);
      await page.getByRole('button', { name: 'Propose changes' }).click();
      const list = page.getByRole('list', { name: 'Proposed changes' });
      await list.waitFor({ timeout: 10000 });
      await h.settle(600);
      if (calls.preview.length !== 1 || calls.preview[0].noteId !== 'ns') throw new Error(`preview calls ${JSON.stringify(calls.preview)}`);
      const kinds = await list.locator('[data-foldin-card]').evaluateAll((els) => els.map((e) => e.dataset.foldinCard));
      if (kinds.join(',') !== 'replace_text,append_to_list,add_table_row') throw new Error(`cards in order ${kinds}`);
      if ((await list.locator('del').first().textContent()) !== 'orange hourglass underneath') throw new Error('the correction does not strike the old text');
      if (!(await page.getByText("1 suggestion didn't match the note and was left out.", { exact: false }).count())) throw new Error('the dropped suggestion is not disclosed');
      if (!(await page.locator('[data-foldin-unplaced]').getByText('Saw one on the mailbox at 7am').count())) throw new Error('the unplaced line is missing');
      await assertActionsOnScreen(page, h, 'Apply 3 changes');
      if (calls.apply.length) throw new Error('applied before Apply');
    },
    teardown: (page, h) => h.esc(500),
  },
  {
    // "Preview the whole note": the note as it would be, the additions on a
    // pass of highlighter and the removed words struck.
    name: '19c-foldin-whole',
    async setup(page, h) {
      await openSpidersEditor(page, h);
      await openFoldIn(page, h);
      await page.getByRole('textbox', { name: 'New info' }).fill(FOLD_IN_INPUT);
      await page.getByRole('button', { name: 'Propose changes' }).click();
      await page.getByRole('list', { name: 'Proposed changes' }).waitFor({ timeout: 10000 });
      await page.getByRole('checkbox', { name: 'Preview the whole note' }).check();
      const region = page.getByRole('region', { name: 'The whole note with the changes' });
      await region.waitFor({ timeout: 5000 });
      if ((await region.locator('ins').count()) !== 3) throw new Error(`whole preview has ${await region.locator('ins').count()} insertions`);
      if ((await region.locator('del').count()) !== 1) throw new Error('whole preview strikes nothing');
      await h.settle(400);
    },
    teardown: (page, h) => h.esc(500),
  },
  {
    // Share -> NoteGeek, "Add to an existing note": the hybrid search's best
    // Markdown hit first ("Looks like it belongs in: Spiders"), a rich-text
    // hit not offered, and a title search below.
    name: '19d-share-existing',
    async setup(page, h) {
      const calls = await stubShareFold(page);
      await page.goto(`${h.base}/share?text=${encodeURIComponent(FOLD_IN_INPUT)}`, { waitUntil: 'networkidle' });
      await h.settle(1200);
      const best = page.getByRole('button', { name: 'Looks like it belongs in: Spiders' });
      if (!(await best.count())) throw new Error('no "Looks like it belongs in: Spiders"');
      if (!calls.search.length || calls.search[0].hybrid !== true) throw new Error(`search calls ${JSON.stringify(calls.search)}`);
      if (await page.getByText('Q3 roadmap notes').count()) throw new Error('a rich-text note is offered as a fold target');
      if (!(await page.getByRole('button', { name: 'Save as a new note' }).count())) throw new Error('Save as a new note is missing');
      if (calls.create.length) throw new Error('the share created a note on arrival');
    },
  },
  {
    // ...picked, proposed and applied: the viewer opens on the folded note
    // and the toast says how many changes, with Undo.
    name: '19e-share-foldin-applied',
    async setup(page, h) {
      const calls = await stubShareFold(page);
      await page.goto(`${h.base}/share?text=${encodeURIComponent(FOLD_IN_INPUT)}`, { waitUntil: 'networkidle' });
      await h.settle(1000);
      await page.getByRole('button', { name: 'Looks like it belongs in: Spiders' }).click();
      const box = page.getByRole('textbox', { name: 'New info' });
      await box.waitFor({ timeout: 5000 });
      if ((await box.inputValue()) !== FOLD_IN_INPUT) throw new Error('the sheet was not prefilled with the share');
      await page.getByRole('button', { name: 'Propose changes' }).click();
      await page.getByRole('list', { name: 'Proposed changes' }).waitFor({ timeout: 10000 });
      await page.getByRole('button', { name: 'Apply 3 changes' }).click();
      await page.waitForURL(/\/notes\/ns$/, { timeout: 10000 });
      await page.getByText('Folded in 3 changes.').waitFor({ timeout: 5000 });
      if (!(await page.getByRole('button', { name: 'Undo' }).count())) throw new Error('the toast has no Undo');
      if (calls.apply.length !== 1 || calls.apply[0].operations.length !== 3) throw new Error(`apply calls ${JSON.stringify(calls.apply).slice(0, 200)}`);
      if (calls.apply[0].operations.some((op) => 'id' in op || 'start' in op || 'location' in op)) throw new Error('apply sent the gateway annotations back');
      try {
        await page.getByRole('cell', { name: 'Mailbox' }).waitFor({ timeout: 8000 });
      } catch {
        const body = (await page.locator('main, body').first().innerText()).slice(0, 400).replace(/\s+/g, ' ');
        throw new Error(`the viewer does not show the folded-in table row (url ${page.url()}; page: ${body})`);
      }
      await h.settle(300);
    },
  },

  // ── Select mode, Compose from several notes, Archive (spec §5) ─────────
  {
    // Select mode in All notes: three picked (one a sketch). Each row a
    // checkbox, "3 selected" + Cancel up top, the action bar above the tab
    // bar with "Compose 3 notes" and the skip count, and Archive.
    name: '20a-select-mode',
    async setup(page, h) {
      await stubSelect(page);
      await page.goto(h.base + '/notes', { waitUntil: 'networkidle' });
      await h.settle(1000);
      await selectThree(page, h);
      const bar = page.getByRole('toolbar', { name: 'Selected notes' });
      if (await bar.getByRole('button', { name: 'Compose 3 notes' }).isDisabled()) throw new Error('Compose 3 notes is disabled');
      if (await bar.getByRole('button', { name: 'Archive' }).isDisabled()) throw new Error('Archive is disabled');
      if (!(await bar.getByText(/^1 will be skipped/).count())) throw new Error('the bar does not say the sketch will be skipped');
      if (!(await page.getByRole('button', { name: 'Cancel' }).count())) throw new Error('no Cancel in select mode');
      await assertBarInThumbZone(page, h);
    },
    teardown: (page, h) => h.esc(400),
  },
  {
    // Compose 3 notes -> the draft, with the left-out sketch named above it,
    // and Save as a new note (no Replace).
    name: '20b-compose-many-draft',
    async setup(page, h) {
      const calls = await stubSelect(page);
      await openComposeMany(page, h, calls);
      if (!(await page.getByText('1 note left out: Sketch: onboarding flow (a sketch)').count())) throw new Error('the skipped sketch is not named');
      if (await page.getByRole('button', { name: /replace/i }).count()) throw new Error('compose-many offers Replace');
      if (calls.create.length) throw new Error('a note was created before Save');
    },
    teardown: (page, h) => h.esc(500),
  },
  {
    // Saved -> "Saved. Archive the 2 source notes?" — two, not three: the
    // sketch was not composed, so it is not offered. Nothing archived yet.
    name: '20c-compose-many-offer',
    async setup(page, h) {
      const calls = await stubSelect(page);
      await openComposeMany(page, h, calls);
      await page.getByRole('button', { name: 'Save as a new note' }).click();
      await page.getByRole('dialog', { name: 'Saved. Archive the 2 source notes?' }).waitFor({ timeout: 8000 });
      await h.settle(400);
      if (calls.create.length !== 1) throw new Error(`createNote called ${calls.create.length} times`);
      const v = calls.create[0];
      if (v.title !== 'Q3 planning and standups' || v.type !== 'markdown' || (v.tags || []).length) throw new Error(`created ${JSON.stringify({ title: v.title, type: v.type, tags: v.tags })}`);
      if (calls.archive.length) throw new Error('archived before being asked');
    },
    teardown: (page, h) => h.esc(500),
  },
  {
    // Archive them -> only the two used notes archived, the new note opens,
    // and the toast says so with Undo.
    name: '20d-compose-many-archived',
    async setup(page, h) {
      const calls = await stubSelect(page, { GetNoteById: { note: NOTE_COMPOSED } });
      await openComposeMany(page, h, calls);
      await page.getByRole('button', { name: 'Save as a new note' }).click();
      await page.getByRole('button', { name: 'Archive them' }).click();
      await page.waitForURL(/\/notes\/cm1$/, { timeout: 10000 });
      await page.getByText('Archived 2 notes').waitFor({ timeout: 5000 });
      if (!(await page.getByRole('button', { name: 'Undo' }).count())) throw new Error('the toast has no Undo');
      if (calls.archive.length !== 1 || [...calls.archive[0].ids].sort().join(',') !== 'n1,n5') throw new Error(`archived ${JSON.stringify(calls.archive)}`);
      await h.settle(400);
    },
  },
  {
    // The Archived view (reached from the Tags panel), in select mode with
    // one picked: Restore, and nothing else, in the bar.
    name: '20e-archived-view',
    async setup(page, h) {
      await stubSelect(page);
      await page.goto(h.base + '/notes', { waitUntil: 'networkidle' });
      await h.settle(800);
      if (!desktopLayout(h)) await openTags(page, h);
      await page.getByRole('link', { name: 'Archived' }).click();
      await page.waitForURL(/\/archived$/, { timeout: 8000 });
      await page.getByText(ARCHIVED[0].title).waitFor({ timeout: 8000 });
      await h.settle(600);
      if (phoneLayout(h)) {
        await longPress(page, rowFor(page, 'Spring garden plan'));
      } else {
        await page.getByRole('button', { name: 'Select', exact: true }).click();
        await page.getByRole('checkbox', { name: /Spring garden plan/ }).click();
      }
      await h.settle(400);
      const bar = page.getByRole('toolbar', { name: 'Selected notes' });
      if (!(await bar.getByRole('button', { name: 'Restore' }).count())) throw new Error('the Archived bar has no Restore');
      if (await bar.getByRole('button', { name: /Compose|Archive/ }).count()) throw new Error('the Archived bar offers Compose or Archive');
      await assertBarInThumbZone(page, h);
    },
    teardown: (page, h) => h.esc(400),
  },
  {
    // An archived note opened directly: the viewer's "Archived <date> ·
    // Restore" banner, and Restore (not Archive) in its actions.
    name: '20f-archived-banner',
    async setup(page, h) {
      await stubSelect(page, { GetNoteById: { note: ARCHIVED[0] } });
      await page.goto(h.base + '/notes/xa1', { waitUntil: 'networkidle' });
      await h.settle(1000);
      const banner = page.locator('[data-archived-banner]');
      if (!(await banner.count())) throw new Error('no archived banner');
      if (!(await banner.getByRole('button', { name: 'Restore' }).count())) throw new Error('the banner has no Restore');
      if (!(await page.getByRole('button', { name: 'Restore from archive' }).count())) throw new Error('the viewer still offers Archive');
    },
  },

  // ── Save safety, conflicts, soft delete (2026-11-15, review 2026-11) ──────
  {
    // "Unsaved changes on this device · Discard · Restore" (1.2). Made the way
    // it really happens: an edit the server never acknowledged (the save
    // answers nothing), then the page is reloaded. The device copy is offered
    // back; restoring it puts the typed line on screen again.
    name: '21a-restore-draft-banner',
    async setup(page, h) {
      await bootstrapChef(page);
      await graphqlRoute(page, { ...OPS, GetNoteById: { note: NOTE_MD }, UpdateNote: { updateNote: null } });
      await page.goto(h.base + '/notes/n2/edit', { waitUntil: 'networkidle' });
      await h.settle(1200);
      if (await page.locator('[data-restore-draft]').count()) throw new Error('a draft was offered before anything was typed (a leftover from another scene?)');
      const body = page.getByRole('textbox', { name: 'Note body' });
      await body.click();
      await body.press('Control+End');
      await body.type('\n- [ ] vanilla, the real kind');
      await h.settle(1500); // the device copy is written 500 ms after the last key
      await page.reload({ waitUntil: 'networkidle' });
      await h.settle(1400);
      const banner = page.locator('[data-restore-draft]');
      if (!(await banner.count())) throw new Error('the unsaved edit was not offered back after a reload');
      for (const name of ['Restore unsaved changes', 'Discard']) {
        if (!(await banner.getByRole('button', { name }).count())) throw new Error(`the banner has no "${name}"`);
      }
      if ((await page.getByRole('textbox', { name: 'Note body' }).inputValue()).includes('vanilla')) throw new Error('the draft was applied without asking');
      // The sentence reads as a sentence. On a phone it was squeezed to one
      // word a line beside the two buttons (eight lines); the buttons now
      // drop under it.
      const lines = await banner.locator('p').first().evaluate((el) => {
        const cs = getComputedStyle(el);
        return Math.round((el.getBoundingClientRect().height - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)) / parseFloat(cs.lineHeight));
      });
      if (lines > 2) throw new Error(`the banner's sentence wraps to ${lines} lines`);
      const discard = await banner.getByRole('button', { name: 'Discard' }).boundingBox();
      const restore = await banner.getByRole('button', { name: 'Restore unsaved changes' }).boundingBox();
      if (Math.abs(discard.y - restore.y) > 2) throw new Error('Discard and Restore are on different lines of the banner');
      // Off the field, so the phone's formatting bar is not docked over the shot.
      await page.locator(':focus').evaluate((el) => el.blur()).catch(() => {});
      await h.settle(400);
    },
    teardown: async (page, h) => {
      await page.locator('[data-restore-draft]').getByRole('button', { name: 'Restore unsaved changes' }).click();
      await h.settle(400);
      if (!(await page.getByRole('textbox', { name: 'Note body' }).inputValue()).includes('vanilla, the real kind')) {
        throw new Error('Restore did not put the unsaved line back');
      }
    },
  },
  {
    // "This note changed on another device" (1.4, C3): the gateway refuses the
    // save with extensions.code CONFLICT and its own copy. The dialog cannot
    // be dismissed (Escape, backdrop) and no button is focused: Enter must not
    // pick a side. The refused save carried the version it was made against.
    name: '21b-conflict-dialog',
    async setup(page, h) {
      await bootstrapChef(page);
      const saves = [];
      const theirs = { ...NOTE_MD, title: 'Recipe: brown butter cookies (Heather\'s tweaks)', content: `${NOTE_MD.content}\n\n- Heather: 340°F in the new oven.`, updatedAt: new Date(Date.now() - 4 * 60000).toISOString() };
      await graphqlRoute(page, {
        ...OPS,
        GetNoteById: { note: NOTE_MD },
        UpdateNote: (vars) => { saves.push(vars); return conflictAnswer(theirs); },
      });
      await page.goto(h.base + '/notes/n2/edit', { waitUntil: 'networkidle' });
      await h.settle(1200);
      const title = page.getByLabel('Note title');
      await title.click();
      await title.press('End');
      await title.type(' (v2)');
      await page.keyboard.press('Control+s');
      const dialog = page.getByRole('dialog', { name: 'This note changed on another device' });
      await dialog.waitFor({ timeout: 10000 });
      await h.settle(600);
      if (!saves.length) throw new Error('no updateNote was sent');
      if (new Date(saves[0].baseUpdatedAt).getTime() !== new Date(NOTE_MD.updatedAt).getTime()) {
        throw new Error(`the save did not carry the version it was made against (baseUpdatedAt ${saves[0].baseUpdatedAt})`);
      }
      for (const name of ['Keep mine', 'Keep both', 'Use theirs']) {
        if (!(await dialog.getByRole('button', { name }).count())) throw new Error(`the conflict dialog has no "${name}"`);
      }
      const focused = await page.evaluate(() => (document.activeElement?.closest('button') ? document.activeElement.textContent : ''));
      if (focused) throw new Error(`"${focused}" is focused: Enter would pick a side`);
      await page.keyboard.press('Escape');
      await h.settle(300);
      if (!(await dialog.count())) throw new Error('Escape dismissed the conflict dialog');
      const before = saves.length;
      await h.settle(2600); // longer than the autosave delay
      if (saves.length !== before) throw new Error('autosave kept saving while the conflict was open');
    },
    teardown: async (page, h) => {
      await page.getByRole('button', { name: 'Use theirs' }).click();
      await h.settle(500);
      if (await page.getByRole('dialog', { name: 'This note changed on another device' }).count()) throw new Error('"Use theirs" did not close the dialog');
      if (!/Heather's tweaks/.test(await page.getByLabel('Note title').inputValue())) throw new Error('"Use theirs" did not show their copy');
    },
  },
  {
    // Recently deleted (/deleted, C4): three notes waiting out their 30 days,
    // each with Restore and Delete forever. One has a title far wider than a
    // phone, one is a sketch with no words.
    name: '21c-recently-deleted',
    goto: '/deleted',
    wait: 1200,
    async setup(page, h) {
      const rows = page.locator('[data-deleted-row]');
      if ((await rows.count()) !== DELETED.length) throw new Error(`expected ${DELETED.length} deleted notes, saw ${await rows.count()}`);
      const first = rows.first();
      if (!/Old standup template/.test(await first.innerText())) throw new Error('the most recently deleted note is not first');
      for (const name of ['Restore', 'Delete forever']) {
        if (!(await first.getByRole('button', { name }).count())) throw new Error(`a deleted row has no "${name}"`);
      }
      if (!(await page.getByRole('heading', { level: 1, name: /Recently deleted/ }).count())) throw new Error('no "Recently deleted" heading');
      // The two actions stay together on one line, in every row.
      for (let i = 0; i < DELETED.length; i += 1) {
        const a = await rows.nth(i).getByRole('button', { name: 'Delete forever' }).boundingBox();
        const b = await rows.nth(i).getByRole('button', { name: 'Restore' }).boundingBox();
        if (Math.abs(a.y - b.y) > 2) throw new Error(`row ${i + 1}: Restore (y ${Math.round(b.y)}) is not beside Delete forever (y ${Math.round(a.y)})`);
      }
    },
  },
  {
    // "Delete forever?": the one irreversible act, so it asks, with Cancel
    // focused (Enter cancels).
    name: '21d-delete-forever-dialog',
    goto: '/deleted',
    wait: 1200,
    async setup(page, h) {
      await page.locator('[data-deleted-row]').first().getByRole('button', { name: 'Delete forever' }).click();
      const dialog = page.getByRole('dialog', { name: 'Delete forever?' });
      await dialog.waitFor({ timeout: 5000 });
      await h.settle(500);
      const focused = await page.evaluate(() => document.activeElement?.textContent || '');
      if (!/cancel/i.test(focused)) throw new Error(`"${focused}" is focused in "Delete forever?", not Cancel`);
    },
    teardown: (page, h) => h.esc(400),
  },
  {
    // Recently deleted, empty.
    name: '21e-recently-deleted-empty',
    async setup(page, h) {
      await graphqlRoute(page, { ...OPS, DeletedNotes: { deletedNotes: [] } });
      await page.goto(h.base + '/deleted', { waitUntil: 'networkidle' });
      await h.settle(1000);
      if (!(await page.getByText('Nothing deleted').count())) throw new Error('no empty state on an empty Recently deleted');
    },
  },
  {
    // A deleted note opened by id (a [[link]], a bookmark, Back): the
    // "Deleted <date> · Restore" banner.
    name: '21f-deleted-banner',
    async setup(page, h) {
      await bootstrapChef(page);
      await graphqlRoute(page, { ...OPS, GetNoteById: { note: DELETED[0] } });
      await page.goto(h.base + '/notes/xd1', { waitUntil: 'networkidle' });
      await h.settle(1200);
      const banner = page.locator('[data-deleted-banner]');
      if (!(await banner.count())) throw new Error('a deleted note opened by id shows no "Deleted" banner');
      if (!(await banner.getByRole('button', { name: 'Restore' }).count())) throw new Error('the deleted banner has no Restore');
    },
  },
  {
    // Delete is undoable (1.19): the confirm (Cancel focused, so Enter never
    // deletes), then home with the "Note deleted · Undo" toast. The note has
    // left the lists; Undo sends restoreNote for it.
    name: '21g-delete-undo-toast',
    async setup(page, h) {
      await bootstrapChef(page);
      const calls = { del: [], restore: [] };
      const left = () => NOTES.filter((n) => !calls.del.includes(n.id) || calls.restore.includes(n.id));
      await graphqlRoute(page, {
        ...OPS,
        GetNoteById: { note: NOTE_N1 },
        GetNotes: (vars) => ({ notes: notesPage(left(), { ...vars, first: vars?.limit || 200 }).notesPage.notes }),
        GetNotesPage: (vars) => notesPage(left(), vars),
        DeleteNote: (vars) => { calls.del.push(vars.id); return { deleteNote: true }; },
        RestoreNote: (vars) => { calls.restore.push(vars.id); return { restoreNote: { ...listRow(NOTE_N1), deletedAt: null } }; },
      });
      await page.goto(h.base + '/notes/n1/edit', { waitUntil: 'networkidle' });
      await h.settle(1200);
      await page.getByRole('button', { name: /more note actions/i }).first().click();
      await h.settle(300);
      await page.getByRole('menuitem', { name: /delete note/i }).first().click();
      const dialog = page.getByRole('dialog', { name: 'Delete Note' });
      await dialog.waitFor({ timeout: 5000 });
      await h.settle(400);
      const focused = await page.evaluate(() => document.activeElement?.textContent || '');
      if (!/cancel/i.test(focused)) throw new Error(`"${focused}" is focused in the delete confirm, not Cancel`);
      await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
      const undo = page.getByRole('button', { name: 'Undo' });
      await undo.waitFor({ timeout: 8000 });
      await h.settle(900);
      if (calls.del.join() !== 'n1') throw new Error(`deleteNote sent for "${calls.del.join()}"`);
      if (!(await page.getByText('Note deleted').count())) throw new Error('no "Note deleted" toast');
      if (new URL(page.url()).pathname !== '/') throw new Error(`after a delete the page is ${new URL(page.url()).pathname}, not home`);
      if (await page.locator('[data-note-row]').filter({ hasText: 'Q3 roadmap notes' }).count()) throw new Error('the deleted note is still listed on home');
      if (!(await undo.isVisible())) throw new Error('the Undo toast is gone before the shot');
    },
    teardown: async (page, h) => {
      await page.getByRole('button', { name: 'Undo' }).click();
      await page.getByText('Note restored').waitFor({ timeout: 8000 });
      await h.settle(600);
      if (!(await page.locator('[data-note-row]').filter({ hasText: 'Q3 roadmap notes' }).count())) throw new Error('Undo did not bring the note back to home');
    },
  },

  // ── The sketch bar (2026-11-15) ───────────────────────────────────────────
  {
    // The bar's More popover. On a phone the short bar keeps Move, Write,
    // Eraser, the pen, Paper, Undo, More and Fullscreen; everything else
    // (Select, Redo, Highlighter, shapes, text, image, zoom) is in More, with
    // Share as image, Finger draws and where the bar sits. On desktop the bar
    // is full and More holds only the last three.
    name: '22a-sketch-more',
    goto: '/notes/new?type=handwritten',
    wait: 2500,
    async setup(page, h) {
      await h.settle(800);
      const bar = page.getByRole('toolbar', { name: 'Drawing tools' });
      if (!(await bar.count())) throw new Error('no drawing toolbar on a new sketch');
      const isFull = (await bar.getAttribute('data-bar-full')) === 'true';
      if (h.viewport === 'phone' && isFull) throw new Error('a phone got the full bar');
      if (!isFull) {
        for (const name of ['Move', 'Write', 'Eraser', 'Pen colour and size', 'Undo', 'More', 'Fullscreen']) {
          if (!(await bar.getByRole('button', { name, exact: true }).count())) throw new Error(`the short bar has no "${name}"`);
        }
        const box = await bar.boundingBox();
        if (box.x < 0 || box.x + box.width > page.viewportSize().width + 1) throw new Error(`the short bar is wider than the screen (${Math.round(box.x)}..${Math.round(box.x + box.width)})`);
      }
      // Every button of the bar is inside the bar, and so on the screen. The
      // short bar's eight buttons used to be 386px in a 374px bar: Fullscreen
      // hung off the right edge of a 390px phone (2026-11-15).
      const spill = await bar.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return [...el.querySelectorAll('button')]
          .map((b) => ({ name: b.getAttribute('aria-label'), q: b.getBoundingClientRect() }))
          .filter(({ q }) => q.left < r.left - 0.5 || q.right > r.right + 0.5 || q.right > innerWidth + 0.5)
          .map(({ name, q }) => `${name} ${Math.round(q.left)}..${Math.round(q.right)} (bar ${Math.round(r.left)}..${Math.round(r.right)})`);
      });
      if (spill.length) throw new Error(`buttons spill out of the drawing bar: ${spill.join('; ')}`);
      await bar.getByRole('button', { name: 'More', exact: true }).click();
      const more = page.getByRole('dialog', { name: 'More' });
      await more.waitFor({ timeout: 5000 });
      await h.settle(500);
      if (!isFull) {
        for (const name of ['Select', 'Redo', 'Highlighter', 'Zoom to fit', 'Shapes', 'Text', 'Sticky note', 'Insert image', 'Zoom in', 'Zoom out']) {
          if (!(await more.getByRole('button', { name, exact: true }).count())) throw new Error(`More has no "${name}"`);
        }
      }
      if (!(await more.getByRole('checkbox', { name: 'Finger draws' }).count())) throw new Error('More has no "Finger draws"');
      if (!(await more.getByRole('group', { name: 'Toolbar position' }).count())) throw new Error('More has no toolbar position');
      const box = await more.boundingBox();
      const vp = page.viewportSize();
      if (box.x < 0 || box.y < 0 || box.x + box.width > vp.width + 1 || box.y + box.height > vp.height + 1) {
        throw new Error(`the More popover runs off screen (${Math.round(box.x)},${Math.round(box.y)} ${Math.round(box.width)}x${Math.round(box.height)} in ${vp.width}x${vp.height})`);
      }
    },
    teardown: (page, h) => h.esc(400),
  },
  {
    // A phone narrower than the short bar (360px here; the short bar needs
    // 388). It used to scroll sideways with More and Fullscreen starting
    // off-screen. Now it is the tight bar: Paper and Fullscreen are in More,
    // every button is 44px and on the screen (2026-11-15).
    name: '22a2-sketch-tight-bar',
    goto: '/notes/new?type=handwritten',
    wait: 2500,
    viewports: ['phone'],
    async setup(page, h) {
      const was = page.viewportSize();
      page.__wasViewport = was;
      await page.setViewportSize({ width: 360, height: was.height });
      await h.settle(1200);
      const bar = page.getByRole('toolbar', { name: 'Drawing tools' });
      if (!(await bar.count())) throw new Error('no drawing toolbar on a new sketch');
      if ((await bar.getAttribute('data-bar-tight')) !== 'true') throw new Error('a 360px phone did not get the tight bar');
      for (const name of ['Move', 'Write', 'Eraser', 'Pen colour and size', 'Undo', 'More']) {
        if (!(await bar.getByRole('button', { name, exact: true }).count())) throw new Error(`the tight bar has no "${name}"`);
      }
      const spill = await bar.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const out = el.scrollWidth > el.clientWidth + 1 ? [`the bar scrolls (${el.scrollWidth} in ${el.clientWidth})`] : [];
        return out.concat([...el.querySelectorAll('button')]
          .map((b) => ({ name: b.getAttribute('aria-label'), q: b.getBoundingClientRect() }))
          .filter(({ q }) => q.left < r.left - 0.5 || q.right > r.right + 0.5 || q.right > innerWidth + 0.5 || q.width < 43.5)
          .map(({ name, q }) => `${name} ${Math.round(q.left)}..${Math.round(q.right)}`));
      });
      if (spill.length) throw new Error(`the tight bar does not fit: ${spill.join('; ')}`);
      await bar.getByRole('button', { name: 'More', exact: true }).click();
      const more = page.getByRole('dialog', { name: 'More' });
      await more.waitFor({ timeout: 5000 });
      await h.settle(500);
      for (const name of ['Paper', 'Fullscreen', 'Select', 'Redo']) {
        if (!(await more.getByRole('button', { name, exact: true }).count())) throw new Error(`More has no "${name}" on the tight bar`);
      }
      const box = await more.boundingBox();
      if (box.x < 0 || box.x + box.width > 361) throw new Error(`the More popover runs off a 360px screen (${Math.round(box.x)}..${Math.round(box.x + box.width)})`);
    },
    async teardown(page, h) {
      await h.esc(400);
      if (page.__wasViewport) await page.setViewportSize(page.__wasViewport);
    },
  },
  {
    // Fullscreen, with the pen picker open (review 2.2). MUI portals a
    // popover to <body>, which is not on screen in fullscreen: the picker
    // opened invisibly and its backdrop ate every tap. It must render INSIDE
    // the fullscreen element. Skipped (not failed) where the browser refuses
    // fullscreen.
    name: '22b-sketch-fullscreen-pen',
    goto: '/notes/new?type=handwritten',
    wait: 2500,
    async setup(page, h) {
      await h.settle(800);
      const bar = page.getByRole('toolbar', { name: 'Drawing tools' });
      await bar.getByRole('button', { name: 'Fullscreen', exact: true }).click();
      await h.settle(900);
      if (!(await page.evaluate(() => Boolean(document.fullscreenElement)))) {
        h.log('fullscreen was refused by this browser: scene skipped');
        return false;
      }
      if (!(await bar.getByRole('button', { name: 'Exit fullscreen', exact: true }).count())) throw new Error('in fullscreen the bar has no "Exit fullscreen"');
      await bar.getByRole('button', { name: 'Pen colour and size' }).click();
      const picker = page.getByRole('dialog', { name: 'Pen colour and size' });
      await picker.waitFor({ timeout: 5000 });
      await h.settle(500);
      const inside = await picker.evaluate((el) => Boolean(document.fullscreenElement?.contains(el)));
      if (!inside) throw new Error('the pen picker rendered outside the fullscreen element (invisible in fullscreen)');
      if (!(await picker.getByRole('button', { name: 'Size: Small' }).isVisible())) throw new Error('the pen sizes are not visible in fullscreen');
    },
    teardown: async (page, h) => {
      await h.esc(300);
      await page.evaluate(() => (document.fullscreenElement ? document.exitFullscreen() : null)).catch(() => {});
      await h.settle(400);
    },
  },

  // ── Tablet wave (2026-11-16): rail, capped list, portrait editor, two panes ──
  {
    // The rail replaces the phone's bottom bar on a tablet, portrait and
    // landscape alike: Home, Search, New, Notes and Tags; no hamburger. In
    // portrait the list is one capped, centred column; in landscape the list
    // sits in its own pane beside a "Pick a note" placeholder.
    name: '40a-tablet-rail',
    viewports: ['tablet'],
    goto: '/notes',
    wait: 1200,
    async setup(page, h) {
      const rail = page.locator('nav[data-geek-nav-rail]');
      if (!(await rail.count())) throw new Error('no rail on the tablet');
      if (await page.locator('[data-geek-bottom-nav]').count()) throw new Error('the tablet still draws the phone bottom bar');
      if (await page.locator('[data-geek-topbar="menu"]').count()) throw new Error('the tablet still has a hamburger');
      const ids = await page.locator('[data-geek-nav-rail-item]').evaluateAll((els) => els.map((e) => e.getAttribute('data-geek-nav-rail-item')));
      if (ids.join(',') !== 'home,search,new,notes,tags') throw new Error(`rail items are ${ids.join(',')}`);
      if ((await page.locator('[data-geek-nav-rail-item="notes"]').getAttribute('aria-current')) !== 'page') throw new Error('Notes is not current on /notes');
      const row = await page.locator('[data-note-row]').first().boundingBox();
      if (!row) throw new Error('no note rows');
      if (h.landscape) {
        if (!(await page.getByRole('region', { name: 'Notes' }).count())) throw new Error('landscape has no list pane');
        if (!(await page.getByText('Pick a note').count())) throw new Error('landscape has no "Pick a note" placeholder');
      } else {
        if (await page.locator('[data-note-two-pane]').count()) throw new Error('portrait 800 must be one pane');
        if (row.width > 610) throw new Error(`portrait list rows are ${Math.round(row.width)}px wide (cap 600)`);
        const railBox = await rail.boundingBox();
        const mid = row.x + row.width / 2;
        const colMid = railBox.x + railBox.width + (h.width - railBox.x - railBox.width) / 2;
        if (Math.abs(mid - colMid) > 12) throw new Error(`the list column is not centred beside the rail (${Math.round(mid)} vs ${Math.round(colMid)})`);
      }
    },
  },
  {
    // The rail's Tags item: the sidebar's contents (tag filter, All notes,
    // Archived, Recently deleted, the tree) in a sheet, so a tablet loses
    // nothing the desktop sidebar has. The sheet is capped, not 800 wide.
    name: '40b-tablet-tags-sheet',
    viewports: ['tablet'],
    goto: '/notes',
    wait: 1200,
    async setup(page, h) {
      await openTags(page, h);
      const sheet = page.getByRole('dialog', { name: /tags/i });
      for (const name of [/all notes/i, /archived/i, /recently deleted/i]) {
        if (!(await sheet.getByRole('link', { name }).count())) throw new Error(`the Tags sheet has no ${name} link`);
      }
      if (!(await sheet.getByRole('button', { name: /^collapse dev$/i }).count())) throw new Error('the Tags sheet has no tag tree');
      // The paper, not the dialog root (that is the full-screen modal layer).
      // Portrait: a bottom sheet (`data-geek-sheet="paper"`); landscape: GeekSheet
      // is a centred MUI Dialog, whose paper is `.MuiDialog-paper`.
      const box = await page.locator('[role="dialog"] [data-geek-sheet="paper"], .MuiDialog-paper').first().boundingBox({ timeout: 5000 });
      if (!box || box.width > 610) throw new Error(`the Tags sheet is ${box ? Math.round(box.width) : '?'}px wide`);
    },
    teardown: (page, h) => h.esc(400),
  },
  {
    // The editor on Chef's portrait tablet: the formatting toolbar under the
    // title (as landscape has it), not docked bottom-left; the title and
    // tags fields at least 44px for a finger; the text at a readable measure.
    name: '40c-tablet-portrait-editor',
    viewports: ['tablet-portrait'],
    async setup(page, h) {
      await openNote(page, h, NOTE_MD, '/notes/n2/edit');
      const body = page.getByRole('textbox', { name: 'Note body' });
      await body.click();
      await body.press('End');
      await h.settle(600);
      const bar = page.getByRole('toolbar', { name: 'Markdown formatting' });
      if ((await bar.getAttribute('data-editor-toolbar')) !== 'inline') throw new Error('portrait toolbar is not inline');
      const title = page.getByRole('textbox', { name: 'Note title' });
      const tb = await bar.boundingBox();
      const tt = await title.boundingBox();
      if (!(tb && tt && tb.y > tt.y)) throw new Error('the toolbar is not under the title');
      if (tb.y > 420) throw new Error(`the toolbar sits at y=${Math.round(tb.y)}, not under the head`);
      const field = async (loc) => loc.evaluate((el) => (el.closest('.MuiInputBase-root') || el).getBoundingClientRect().height);
      for (const [name, loc] of [['title', title], ['tags', page.getByRole('combobox', { name: 'Tags' })]]) {
        const hgt = await field(loc);
        if (hgt < 43.5) throw new Error(`the ${name} field is ${Math.round(hgt)}px tall`);
      }
      const col = await body.boundingBox();
      if (col && col.width > 700) throw new Error(`the text column is ${Math.round(col.width)}px wide`);
      if (!(await page.locator('nav[data-geek-nav-rail]').count())) throw new Error('the rail is gone in the editor');
    },
  },
  {
    // Two panes from 1024px (landscape tablet, desktop): the list beside the
    // note. Opening a note keeps the list, its scroll and its filter; the
    // open note's row is marked; another note opens in the same pane.
    name: '40d-two-pane',
    // Tablet only: the desktop keeps one pane until Chef has seen two (2026-11-16).
    viewports: ['tablet-landscape'],
    async setup(page, h) {
      await bootstrapChef(page);
      const full = (id) => NOTES.find((n) => n.id === id) || NOTE_N1;
      await graphqlRoute(page, { ...OPS, GetNoteById: (vars) => ({ note: full(vars.id) }) });
      await page.goto(h.base + '/notes', { waitUntil: 'networkidle' });
      await h.settle(1000);
      const list = page.getByRole('region', { name: 'Notes' });
      if (!(await list.count())) throw new Error('no list pane at this width');
      await list.locator('[data-type-filter="text"]').click();
      await h.settle(600);
      await list.evaluate((el) => { el.scrollTop = 40; });
      const before = await list.evaluate((el) => el.scrollTop);
      await list.getByRole('link', { name: /Standup snippets/ }).click();
      await page.waitForURL(/\/notes\/n5$/, { timeout: 8000 });
      await h.settle(900);
      const note = page.getByRole('region', { name: 'Note' });
      if (!(await note.getByText('Standup snippets').count())) throw new Error('the note pane does not show the note');
      if ((await list.locator('[data-type-filter="text"]').getAttribute('aria-pressed')) !== 'true') throw new Error('the list lost its filter');
      const after = await list.evaluate((el) => el.scrollTop);
      if (Math.abs(after - before) > 2) throw new Error(`the list scrolled from ${before} to ${after} when a note opened`);
      if ((await list.locator('[aria-current="page"]').count()) !== 1) throw new Error('the open note\'s row is not marked');
      await list.getByRole('link', { name: /Q3 roadmap notes/ }).click();
      await page.waitForURL(/\/notes\/n1$/, { timeout: 8000 });
      await h.settle(900);
      if (!(await note.getByText('Q3 roadmap notes').count())) throw new Error('the second note did not open beside the list');
    },
  },
].map(withCleanDrafts);

// Known, ticketed violations. Each one should die when the app is fixed —
// an empty list is the goal, not a permanent parking lot.
export const waivers = [
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
