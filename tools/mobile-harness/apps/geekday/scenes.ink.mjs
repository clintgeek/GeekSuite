// GeekDay ink-page scenes: scrolling, the paper, and templates
// (DOCS/GEEKDAY_SPEC.md §6 S1–S5, DOCS/TEMPLATES_SPEC.md). Names start `3x-`.
//
// PAPER (Ruled / Dot grid / Grid) is the background. A TEMPLATE is a white
// sheet printed into the drawing as one locked tldraw image shape
// (packages/ui/src/paper/sheet.js). The scenes prove both in a real browser.
//
// Portrait tablet only: the designed size. Every scene THROWS when the thing
// it is named for is not on screen. Scenes share one browser page, so any
// device setting a scene makes (localStorage) is put back in its teardown.

import fs from 'node:fs';
import path from 'node:path';

/** HARNESS_DUMP_DIR=/some/dir keeps what the scenes saw (saved pages, the lasso crop) for a human to look at. */
const dump = process.env.HARNESS_DUMP_DIR || '';

const must = async (page, selector, what) => {
  const node = page.locator(selector).first();
  if (!(await node.count()) || !(await node.isVisible())) throw new Error(`missing: ${what} (${selector})`);
  return node;
};
const mustNot = async (page, selector, what) => {
  const node = page.locator(selector).first();
  if ((await node.count()) && (await node.isVisible())) throw new Error(`should not be on screen: ${what} (${selector})`);
};

const tablet = ['tablet-portrait'];
const CANVAS = '[data-testid="ink-canvas"]';

/** The ink canvas, once tldraw has mounted inside it. */
async function inkBox(page) {
  const canvas = await must(page, CANVAS, 'the ink canvas');
  await page.waitForSelector('[data-testid="ink-tool-pen"]', { timeout: 15000 });
  return canvas.boundingBox();
}

/** A mouse stroke through points given as fractions of the canvas box. (The mouse always draws.) */
async function stroke(page, box, points) {
  const at = ([fx, fy]) => [box.x + box.width * fx, box.y + box.height * fy];
  const [first, ...rest] = points.map(at);
  await page.mouse.move(first[0], first[1]);
  await page.mouse.down();
  for (const [x, y] of rest) await page.mouse.move(x, y, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(120);
}

const word = (fx, fy) => [[fx, fy], [fx + 0.04, fy - 0.03], [fx + 0.08, fy + 0.01], [fx + 0.12, fy - 0.03], [fx + 0.16, fy + 0.01], [fx + 0.2, fy - 0.02]];

/** Where each stroke is on screen right now (tldraw hides the ones scrolled out of view). */
const STROKE = `${CANVAS} .tl-shape[data-shape-type="draw"]`;
const SHEET = `${CANVAS} .tl-shape[data-shape-type="image"]`;
const strokeTops = (page) => page.locator(STROKE).evaluateAll((nodes) => nodes
  .filter((n) => getComputedStyle(n).display !== 'none')
  .map((n) => Math.round(n.getBoundingClientRect().top)));
const strokeCount = (page) => page.locator(STROKE).count();

/**
 * The mouse wheel, over the middle of the page. At the tablet's device pixel
 * ratio the page receives a fraction of `dy`, so scenes assert that the page
 * moved a good way, not an exact distance.
 */
async function wheel(page, box, dy, { ctrl = false } = {}) {
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  if (ctrl) await page.keyboard.down('Control');
  await page.mouse.wheel(0, dy);
  if (ctrl) await page.keyboard.up('Control');
  await page.waitForTimeout(150);
}

/** A one-finger sideways flick over the ink page (real touch events). */
async function flick(page, box, { fromX, toX, y = 0.45 }) {
  const cdp = await page.context().newCDPSession(page);
  const at = (fx) => ({ x: Math.round(box.x + box.width * fx), y: Math.round(box.y + box.height * y), id: 0 });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [at(fromX)] });
  for (let i = 1; i <= 5; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [at(fromX + ((toX - fromX) * i) / 5)] });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
  await page.waitForTimeout(500);
}

const dayOnScreen = (page) => page.locator('[data-testid="day-page"]').getAttribute('data-day');


/** Every GraphQL operation the page sends from now on, with its variables. */
function watchOps(page) {
  const seen = [];
  const on = (request) => {
    if (request.method() !== 'POST' || !/\/graphql/.test(request.url())) return;
    try {
      const body = request.postDataJSON();
      seen.push({ op: body.operationName, vars: body.variables || {} });
    } catch { /* not ours */ }
  };
  page.on('request', on);
  return {
    seen,
    last: (...ops) => [...seen].reverse().find((r) => ops.includes(r.op)) || null,
    stop: () => page.off('request', on),
  };
}

/** The records of the page as it was last sent to be saved. */
function savedRecords(ops) {
  const save = ops.last('CreateDayNote', 'SaveDayNote');
  if (!save) throw new Error('the page was never sent to be saved');
  return JSON.parse(save.vars.content).store;
}

/** The saved page holds the template as ONE locked image shape with its asset, marked with `id`. */
function mustHaveSavedSheet(records, id) {
  const shape = records['shape:paper-template'];
  // One asset per template (packages/ui/src/paper/sheet.js `paperSheetAssetId`).
  const asset = records[`asset:paper-template-${id}`];
  if (!shape || !asset) throw new Error(`the saved page has no template sheet (records: ${Object.keys(records).join(', ')})`);
  const images = Object.values(records).filter((r) => r.typeName === 'shape' && r.type === 'image');
  if (images.length !== 1) throw new Error(`the saved page has ${images.length} image shapes, not one sheet`);
  if (shape.isLocked !== true) throw new Error('the saved template sheet is not locked');
  if (shape.props?.assetId !== asset.id) throw new Error(`the saved sheet's picture is ${shape.props?.assetId}, not ${asset.id}`);
  if (shape.meta?.paperTemplate !== id) throw new Error(`the saved sheet is marked ${JSON.stringify(shape.meta)}, not ${id}`);
  if (shape.props?.w !== 1000 || shape.props?.h !== 1400) throw new Error(`the saved sheet is ${shape.props?.w} x ${shape.props?.h}, not 1000 x 1400`);
  const svg = decodeURIComponent(String(asset.props?.src || ''));
  if (!svg.includes('<rect width="1000" height="1400" fill="#ffffff"/>')) throw new Error('the saved sheet is not printed on white paper');
  return shape;
}

const waitSaved = (page) => page.waitForSelector('[data-testid="ink-save-status"][data-save="saved"]', { timeout: 8000 });

/** How many distinct colours, and which is commonest, in a strip of the screen (CSS px). */
async function stripColours(page, clip) {
  const shot = await page.screenshot({ clip, scale: 'css' });
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const counts = new Map();
    for (let i = 0; i < data.length; i += 4) {
      const key = `${data[i]},${data[i + 1]},${data[i + 2]}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    return { commonest: sorted[0][0], distinct: sorted.length };
  }, shot.toString('base64'));
}

const WHITE = '255,255,255';
/** Words only that template prints. */
const PRINTED = { schedule: '>6 AM<', top3: '>TOP THREE<', meeting: '>ACTIONS<', cornell: '>CUES<' };

/**
 * The template `id` is on the page as a real, rendered sheet: one image shape
 * in the drawing, its picture loaded, white, one page wide, with its top-left
 * at page (x, y); the page is light whatever the app theme; and the app's own
 * paper is what is drawn outside it.
 *
 * @returns the sheet's box in CSS px, relative to the ink pane
 */
async function mustShowSheet(page, id, { x = 0, y = 0 } = {}) {
  await page.waitForSelector(`${CANVAS}[data-ink-sheet="${id}"][data-ink-sheet-state="placed"]`, { timeout: 4000 })
    .catch(() => { throw new Error(`missing: a placed ${id} template `); });
  await mustNot(page, '[data-testid="ink-sheet-preview"]', 'the template preview, once the sheet is placed');
  if ((await page.locator(SHEET).count()) !== 1) throw new Error(`expected one template sheet in the drawing, found ${await page.locator(SHEET).count()}`);
  // Loaded, and this template's own picture (not the one it replaced).
  await page.waitForFunction(([sel, words]) => {
    const img = document.querySelector(`${sel} img.tl-image`);
    return img && img.complete && img.naturalWidth > 0 && decodeURIComponent(img.currentSrc || img.src).includes(words);
  }, [SHEET, PRINTED[id]], { timeout: 8000 }).catch(() => { throw new Error(`the ${id} template's picture never rendered inside the canvas`); });
  const facts = await page.locator(SHEET).evaluate((node) => {
    const pane = node.closest('[data-testid="ink-canvas"]');
    const img = node.querySelector('img.tl-image');
    const p = pane.getBoundingClientRect();
    const r = img.getBoundingClientRect();
    return {
      src: decodeURIComponent(img.currentSrc || img.src),
      left: r.left - p.left,
      top: r.top - p.top,
      width: r.width,
      height: r.height,
      paneWidth: p.width,
      paneHeight: p.height,
      paneLeft: p.left,
      paneTop: p.top,
      light: pane.dataset.inkLight,
      scheme: pane.querySelector('.tl-container')?.className || '',
    };
  });
  const z = facts.paneWidth / 1000;
  if (!facts.src.includes('<rect width="1000" height="1400" fill="#ffffff"/>')) throw new Error(`the ${id} template is not printed on white paper`);
  if (Math.abs(facts.width - 1000 * z) > 1.5 || Math.abs(facts.height - 1400 * z) > 1.5) throw new Error(`the ${id} sheet is not one sheet in size: ${JSON.stringify(facts)}`);
  if (facts.light !== 'true' || !/tl-theme__light/.test(facts.scheme) || /tl-theme__dark/.test(facts.scheme)) {
    throw new Error(`a page with a template must be a light page (white sheet, dark ink): light=${facts.light}, tldraw "${facts.scheme}"`);
  }
  const box = { left: facts.left, top: facts.top, width: facts.width, height: facts.height, z, paneLeft: facts.paneLeft, paneTop: facts.paneTop, paneHeight: facts.paneHeight };
  if (Math.abs(box.left - x * z) > 1.5) throw new Error(`the ${id} sheet's left edge is at ${box.left}px, expected page x ${x} (${x * z}px)`);
  if (y !== null && Math.abs(box.top - y * z) > 1.5) throw new Error(`the ${id} sheet's top is at ${box.top}px, expected page y ${y} (${y * z}px)`);
  return box;
}

/**
 * With the sheet's foot on screen: the sheet is white, and below it the app's
 * own paper (not white) carries on, ruled.
 */
async function mustShowPaperBelow(page, box) {
  const foot = box.top + box.height;
  if (foot + 120 > box.paneHeight) throw new Error(`the foot of the sheet (${Math.round(foot)}px) is not on screen with room below it`);
  // A strip 20 page units in from the left edge: inside the sheet's margin, clear of anything printed.
  const x = Math.round(box.paneLeft + box.left + 20 * box.z);
  const onSheet = await stripColours(page, { x, y: Math.round(box.paneTop + foot - 80), width: 4, height: 60 });
  if (onSheet.commonest !== WHITE) throw new Error(`the template sheet is not white: its margin is rgb(${onSheet.commonest})`);
  const below = await stripColours(page, { x, y: Math.round(box.paneTop + foot + 8), width: 4, height: Math.ceil(100 * box.z) });
  if (below.commonest === WHITE) throw new Error('below the sheet the page is white: the app\'s paper does not carry on');
  if (below.distinct < 2) throw new Error('below the sheet the paper has no ruling');
  await must(page, '[data-testid="ink-rules"]', 'the ruled paper');
}

const openPageMenu = async (page) => {
  await (await must(page, '[data-testid="ink-page"]', 'the Page button')).click();
  await must(page, '[data-testid="ink-page-menu"]', 'the Page menu');
};
const closePageMenu = async (page) => {
  await page.keyboard.press('Escape');
  await page.waitForSelector('[data-testid="ink-page-menu"]', { state: 'detached', timeout: 4000 });
};
/** Choose a template from the Page menu and close it. */
async function chooseSheet(page, id) {
  await openPageMenu(page);
  await page.locator(`[data-testid="ink-sheet-${id}"]`).click();
  if ((await page.locator(`[data-testid="ink-sheet-${id}"]`).getAttribute('aria-checked')) !== 'true') throw new Error(`"${id}" is not marked in the Template list after choosing it`);
  await closePageMenu(page);
}

export const scenes = [
  {
    // S1, S5: write, scroll down, write again. The page moved, and the ink with it.
    name: '30-ink-scrolled',
    goto: '/',
    wait: 1800,
    viewports: tablet,
    async setup(page) {
      const box = await inkBox(page);
      await stroke(page, box, word(0.2, 0.3));
      const before = await strokeTops(page);
      if (before.length !== 1) throw new Error(`expected one stroke on the page, found ${before.length}`);
      await wheel(page, box, 180);
      const after = await strokeTops(page);
      const moved = before[0] - after[0];
      if (after.length !== 1 || moved < 60 || moved > 190) {
        throw new Error(`the page did not scroll with the wheel: the stroke went from y ${before[0]} to ${after[0]}`);
      }
      // Scrolling cannot go above the top of the page.
      await wheel(page, box, -5000);
      const top = await strokeTops(page);
      if (Math.abs(top[0] - before[0]) > 1) throw new Error(`the page scrolled above its top: stroke at y ${top[0]}, was ${before[0]}`);
      await wheel(page, box, 180);
      await stroke(page, box, word(0.45, 0.5));
      if ((await strokeCount(page)) !== 2) throw new Error('writing after scrolling did not add a stroke');
      await page.waitForSelector('[data-testid="ink-save-status"][data-save="saved"]', { timeout: 8000 });
      await mustNot(page, '[data-testid="ink-fit"]', 'the Fit button while zoomed out');
    },
  },
  {
    // The Page menu, open: Paper and Template are two lists. A paper is a background: no shape, and
    // on a blank day nothing is saved.
    name: '31-page-menu',
    goto: '/',
    wait: 1800,
    viewports: tablet,
    async setup(page) {
      await inkBox(page);
      await openPageMenu(page);
      const items = await page.locator('[data-testid="ink-page-menu"] [role="menuitemradio"]').evaluateAll((nodes) => nodes.map((n) => [n.dataset.testid, n.getAttribute('aria-checked')]));
      const want = ['ink-page-none', 'ink-page-dots', 'ink-page-grid', 'ink-sheet-none', 'ink-sheet-schedule', 'ink-sheet-top3', 'ink-sheet-meeting', 'ink-sheet-cornell'];
      if (items.map((i) => i[0]).join() !== want.join()) throw new Error(`the Page menu lists ${items.map((i) => i[0]).join(', ') || 'nothing'}`);
      const marked = items.filter((i) => i[1] === 'true').map((i) => i[0]).join();
      if (marked !== 'ink-page-none,ink-sheet-none') throw new Error(`a blank day should be Ruled with no template; marked: ${marked}`);
      await must(page, '[data-testid="ink-page-heading-paper"]', 'the Paper heading');
      await must(page, '[data-testid="ink-page-heading-template"]', 'the Template heading');
      await must(page, '[data-testid="ink-page-default"]', '"Use for new days"');
      await page.locator('[data-testid="ink-page-grid"]').click();
      await must(page, `${CANVAS}[data-ink-paper="grid"][data-ink-sheet="none"]`, 'the grid paper, with no template');
      const pattern = await must(page, '[data-testid="ink-pattern"][data-paper="grid"]', 'the grid');
      await page.waitForFunction(() => {
        const el = document.querySelector('[data-testid="ink-pattern"]');
        return el && el.complete && el.naturalWidth > 0;
      }, null, { timeout: 8000 });
      const facts = await pattern.evaluate((el) => {
        const pane = el.closest('[data-testid="ink-canvas"]').getBoundingClientRect();
        const r = el.getBoundingClientRect();
        return { hidden: el.getAttribute('aria-hidden'), alt: el.getAttribute('alt'), tall: r.height / (pane.width / 1000), widthGap: Math.abs(r.width - pane.width) };
      });
      if (facts.hidden !== 'true' || facts.alt !== '') throw new Error(`the paper is announced: ${JSON.stringify(facts)}`);
      if (facts.widthGap > 1 || facts.tall < 4199) throw new Error(`the grid does not run the whole page: ${JSON.stringify(facts)}`);
      if ((await page.locator(`${CANVAS} .tl-shape`).count()) !== 0) throw new Error('choosing a paper put a shape in the drawing');
      await page.waitForTimeout(700);
      await mustNot(page, '[data-testid="ink-save-status"]', 'a save, from choosing a paper on a blank day');
      await page.waitForTimeout(300); // the menu's transition
    },
    teardown: (page, h) => h.esc(),
  },
  {
    // A template chosen from the menu is printed into the drawing: one locked image shape on a white
    // sheet, saved with the note, with the app's ruled paper below it. Ink goes on top of it.
    name: '32-template-placed',
    goto: '/',
    wait: 1800,
    viewports: tablet,
    async setup(page) {
      const ops = watchOps(page);
      try {
        const box = await inkBox(page);
        await chooseSheet(page, 'meeting');
        const sheet = await mustShowSheet(page, 'meeting');
        await mustShowPaperBelow(page, sheet);
        // Placing a template is a choice: the day's note is made, with the sheet in it.
        await waitSaved(page);
        if (ops.last('CreateDayNote', 'SaveDayNote').op !== 'CreateDayNote') throw new Error('placing a template on a blank day did not create the note');
        mustHaveSavedSheet(savedRecords(ops), 'meeting');
        if (dump) fs.writeFileSync(path.join(dump, 'sheet-only.json'), ops.last('CreateDayNote').vars.content);
        // Writing goes on top of it, and the sheet stays where it is.
        await stroke(page, box, word(0.2, 0.3));
        await stroke(page, box, word(0.5, 0.3));
        if ((await strokeCount(page)) !== 2) throw new Error('writing on the template did not add strokes');
        await page.waitForTimeout(700);
        await waitSaved(page);
        const records = savedRecords(ops);
        mustHaveSavedSheet(records, 'meeting');
        const strokes = Object.values(records).filter((r) => r.typeName === 'shape' && r.type === 'draw');
        if (strokes.length !== 2) throw new Error(`the saved page has ${strokes.length} strokes, not 2`);
        if (!strokes.every((r) => r.index > records['shape:paper-template'].index)) throw new Error('the sheet is not under the ink');
        if (records['document:document']?.meta?.paperTemplate) throw new Error(`placing a template changed the paper: ${JSON.stringify(records['document:document'].meta)}`);
        if (dump) fs.writeFileSync(path.join(dump, 'sheet-written.json'), ops.last('SaveDayNote').vars.content);
        await mustShowSheet(page, 'meeting');
      } finally {
        ops.stop();
      }
    },
  },
  {
    // "No template" takes the sheet off again (and out of the saved note); Undo puts it back in one
    // step; choosing another template replaces it. The paper never changes.
    name: '33-template-removed',
    goto: '/',
    wait: 1800,
    viewports: tablet,
    async setup(page) {
      const ops = watchOps(page);
      try {
        const box = await inkBox(page);
        await stroke(page, box, word(0.3, 0.4));
        await chooseSheet(page, 'top3');
        await mustShowSheet(page, 'top3');
        await chooseSheet(page, 'cornell');
        await mustShowSheet(page, 'cornell');
        await page.waitForTimeout(700);
        await waitSaved(page);
        mustHaveSavedSheet(savedRecords(ops), 'cornell');

        await chooseSheet(page, 'none');
        await must(page, `${CANVAS}[data-ink-sheet="none"][data-ink-sheet-state="none"][data-ink-paper="none"]`, 'the page with no template');
        if ((await page.locator(SHEET).count()) !== 0) throw new Error('"No template" left the sheet in the drawing');
        if ((await strokeCount(page)) !== 1) throw new Error('removing the template touched the ink');
        await page.waitForTimeout(700);
        await waitSaved(page);
        const after = savedRecords(ops);
        // (Its picture's asset stays in the note: tldraw keeps assets out of undo, so the contract never deletes one.)
        const left = Object.values(after).filter((r) => r.typeName === 'shape' && r.type === 'image');
        if (left.length) throw new Error(`the saved page still holds the sheet ${left.map((r) => r.id).join(', ')} after "No template"`);

        // One undo step puts the whole sheet back, locked, WITH its picture loaded; Redo takes it off again.
        await page.locator('[data-testid="ink-undo"]').click();
        await mustShowSheet(page, 'cornell');
        await page.waitForTimeout(700);
        await waitSaved(page);
        mustHaveSavedSheet(savedRecords(ops), 'cornell');
        await page.locator('[data-testid="ink-redo"]').click();
        await page.waitForSelector(`${CANVAS}[data-ink-sheet="none"]`, { timeout: 4000 });
        if ((await page.locator(SHEET).count()) !== 0) throw new Error('Redo did not take the sheet off again');
        await must(page, '[data-testid="ink-rules"]', 'the ruled paper where the sheet was');
      } finally {
        ops.stop();
      }
    },
  },
  {
    // S2, S4: zoomed out, a finger flick over the ink turns the day; zoomed in, it pans the page and
    // "Fit" is offered. (A device that has had a pen: fingers do not draw.)
    name: '34-ink-zoomed',
    goto: '/',
    wait: 1800,
    viewports: tablet,
    async setup(page) {
      await page.evaluate(() => localStorage.setItem('geekday:inkPenSeen', '1'));
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForTimeout(1500);
      let box = await inkBox(page);
      const today = await dayOnScreen(page);
      await flick(page, box, { fromX: 0.8, toX: 0.2 });
      const next = await dayOnScreen(page);
      if (next === today) throw new Error('zoomed out, a sideways flick over the ink did not turn the day');
      await flick(page, box, { fromX: 0.2, toX: 0.8 });
      if ((await dayOnScreen(page)) !== today) throw new Error('a flick the other way did not turn the day back');
      await page.waitForTimeout(600);

      box = await inkBox(page);
      await stroke(page, box, word(0.3, 0.3));
      await wheel(page, box, -45, { ctrl: true });
      await must(page, `${CANVAS}[data-ink-zoomed="true"]`, 'the zoomed-in page');
      await must(page, '[data-testid="ink-fit"]', 'the Fit button');
      const before = await strokeTops(page);
      const leftBefore = await page.locator(STROKE).first().evaluate((n) => Math.round(n.getBoundingClientRect().left));
      await flick(page, box, { fromX: 0.7, toX: 0.4 });
      if ((await dayOnScreen(page)) !== today) throw new Error('zoomed in, a sideways flick turned the day instead of panning the page');
      const leftAfter = await page.locator(STROKE).first().evaluate((n) => Math.round(n.getBoundingClientRect().left));
      if (!(leftAfter < leftBefore - 20)) throw new Error(`zoomed in, a finger did not pan the page sideways: the stroke went from x ${leftBefore} to ${leftAfter}`);
      if ((await strokeCount(page)) !== before.length) throw new Error('the finger drew on a device that has a pen');
    },
    async teardown(page) {
      await page.evaluate(() => localStorage.removeItem('geekday:inkPenSeen'));
    },
  },
  {
    // A saved day whose drawing already holds a template sheet (as NoteGeek or GeekDay saved it),
    // with writing on it. Opening it saves nothing.
    name: '35-template-saved',
    goto: '/?__fixture=sheet-meeting',
    wait: 1800,
    viewports: tablet,
    async setup(page) {
      await inkBox(page);
      const sheet = await mustShowSheet(page, 'meeting');
      await mustShowPaperBelow(page, sheet);
      if ((await strokeCount(page)) < 5) throw new Error('the saved writing is not on the page');
      await page.waitForTimeout(700);
      await mustNot(page, '[data-testid="ink-save-status"]', 'a save, just from opening the page');
    },
  },
  {
    // A sheet NoteGeek put somewhere else on the page is drawn where it is, and is not moved.
    name: '36-template-elsewhere',
    goto: '/?__fixture=sheet-elsewhere',
    wait: 1800,
    viewports: tablet,
    async setup(page) {
      const box = await inkBox(page);
      await must(page, `${CANVAS}[data-ink-sheet="cornell"][data-ink-sheet-state="placed"]`, 'the page with its Cornell sheet');
      // Exactly where the saved shape says: page (60, 1500), below the writing, its right edge off the page.
      const sheet = await mustShowSheet(page, 'cornell', { x: 60, y: 1500 });
      if ((await strokeCount(page)) < 5) throw new Error('the saved writing is not on the page');
      // It is part of the page: it scrolls with it.
      await wheel(page, box, 240);
      const moved = await mustShowSheet(page, 'cornell', { x: 60, y: null });
      if (!(moved.top < sheet.top - 60)) throw new Error(`the sheet did not scroll with the page: its top went from ${sheet.top} to ${moved.top}`);
      await page.waitForTimeout(700);
      await mustNot(page, '[data-testid="ink-save-status"]', 'a save, just from opening and scrolling the page');
    },
  },
  {
    // A page from the build of 2026-11-20: its meta says paperTemplate "schedule" and it has no
    // sheet. It is a ruled page with no template; nothing is rewritten on open.
    name: '37-legacy-template-meta',
    goto: '/?__fixture=legacy-schedule',
    wait: 1800,
    viewports: tablet,
    async setup(page) {
      await inkBox(page);
      await must(page, `${CANVAS}[data-ink-paper="none"][data-ink-sheet="none"][data-ink-sheet-state="none"][data-ink-light="false"]`, 'a ruled page with no template');
      await must(page, '[data-testid="ink-rules"]', 'the ruled paper');
      await mustNot(page, '[data-testid="ink-pattern"]', 'a printed background');
      await mustNot(page, '[data-testid="ink-sheet-preview"]', 'a template preview');
      if ((await page.locator(SHEET).count()) !== 0) throw new Error('a template sheet was made for a page that only had the old meta key');
      if ((await strokeCount(page)) < 5) throw new Error('the saved writing is not on the page');
      await page.waitForTimeout(700);
      await mustNot(page, '[data-testid="ink-save-status"]', 'a save, just from opening the page');
      await openPageMenu(page);
      const marked = await page.locator('[data-testid="ink-page-menu"] [role="menuitemradio"][aria-checked="true"]').evaluateAll((nodes) => nodes.map((n) => n.dataset.testid).join());
      await closePageMenu(page);
      if (marked !== 'ink-page-none,ink-sheet-none') throw new Error(`the menu marks ${marked} on a legacy page`);
    },
  },
  {
    // The eraser takes ink off and cannot touch the sheet: dragged all over it, the sheet is still
    // there, still locked, still in the saved note.
    name: '38-eraser-keeps-template',
    goto: '/',
    wait: 1800,
    viewports: tablet,
    async setup(page) {
      const ops = watchOps(page);
      try {
        const box = await inkBox(page);
        await chooseSheet(page, 'schedule');
        await stroke(page, box, word(0.2, 0.2));
        await stroke(page, box, word(0.5, 0.4));
        if ((await strokeCount(page)) !== 2) throw new Error('expected two strokes before erasing');
        await page.locator('[data-testid="ink-tool-eraser"]').click();
        // Through the first word, then back and forth over the bare sheet, its labels and its lines.
        await stroke(page, box, [[0.15, 0.19], [0.3, 0.19], [0.45, 0.19]]);
        await stroke(page, box, [[0.05, 0.05], [0.9, 0.08], [0.1, 0.12], [0.9, 0.3], [0.1, 0.33], [0.5, 0.36]]);
        await page.mouse.click(box.x + box.width * 0.12, box.y + box.height * 0.1); // a tap on an hour label
        await page.waitForTimeout(200);
        if ((await strokeCount(page)) !== 1) throw new Error(`the eraser should have taken one of two strokes; ${await strokeCount(page)} are left`);
        await mustShowSheet(page, 'schedule');
        await page.waitForTimeout(700);
        await waitSaved(page);
        const records = savedRecords(ops);
        mustHaveSavedSheet(records, 'schedule');
        if (Object.values(records).filter((r) => r.type === 'draw').length !== 1) throw new Error('the saved page does not have exactly the one stroke left');
        await page.locator('[data-testid="ink-tool-pen"]').click();
      } finally {
        ops.stop();
      }
    },
  },
  {
    // Circle to task on a template: the image sent to be read holds the circled writing and none
    // of the sheet (no white page, no printed lines or words), and a tap on the bare sheet picks nothing.
    name: '39-lasso-leaves-template',
    goto: '/',
    wait: 1800,
    viewports: tablet,
    async setup(page) {
      const ops = watchOps(page);
      try {
        const box = await inkBox(page);
        await chooseSheet(page, 'meeting');
        const sheet = await mustShowSheet(page, 'meeting');
        // Two words across the sheet's note lines.
        await stroke(page, box, [[0.22, 0.4], [0.26, 0.35], [0.3, 0.42], [0.34, 0.35], [0.38, 0.42], [0.42, 0.36]]);
        await stroke(page, box, [[0.48, 0.4], [0.52, 0.35], [0.56, 0.42], [0.6, 0.36], [0.64, 0.41]]);
        // A tap on the bare sheet: there is no writing there, and the sheet is not writing.
        await page.locator('[data-testid="ink-tool-lasso"]').click();
        await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.12);
        await page.waitForTimeout(300);
        const hint = await page.locator('[data-testid="ink-hint"]').innerText();
        if (!/Circle some writing/.test(hint)) throw new Error(`a tap on the bare template should pick nothing; the hint says "${hint}"`);
        if (ops.last('ReadCircledInk')) throw new Error('a tap on the bare template sent something to be read');
        // A loop round both words. It also takes in a good piece of the sheet.
        await stroke(page, box, [[0.14, 0.38], [0.2, 0.28], [0.45, 0.26], [0.7, 0.29], [0.74, 0.39], [0.68, 0.49], [0.42, 0.51], [0.19, 0.48], [0.14, 0.38]]);
        await page.waitForSelector('[data-testid="confirm-task-text"]', { timeout: 15000 });
        const read = ops.last('ReadCircledInk');
        if (!read) throw new Error('the circled writing was not sent to be read');
        if (dump) fs.writeFileSync(path.join(dump, `lasso-crop-${page.viewportSize().width}.png`), Buffer.from(read.vars.image, 'base64'));
        const crop = await page.evaluate(async (b64) => {
          const img = new Image();
          img.src = `data:image/png;base64,${b64}`;
          await img.decode();
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0);
          const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const inked = (x, y) => { const i = (y * canvas.width + x) * 4; return data[i] < 235 || data[i + 1] < 235 || data[i + 2] < 235; };
          let total = 0;
          let fullestRow = 0;
          for (let y = 0; y < canvas.height; y++) {
            let row = 0;
            for (let x = 0; x < canvas.width; x++) if (inked(x, y)) row += 1;
            total += row;
            fullestRow = Math.max(fullestRow, row / canvas.width);
          }
          let fullestColumn = 0;
          for (let x = 0; x < canvas.width; x++) {
            let column = 0;
            for (let y = 0; y < canvas.height; y++) if (inked(x, y)) column += 1;
            fullestColumn = Math.max(fullestColumn, column / canvas.height);
          }
          return { width: canvas.width, height: canvas.height, inkShare: total / (canvas.width * canvas.height), fullestRow, fullestColumn };
        }, read.vars.image);
        // The two words are about 420 x 70 page units; the sheet is 1000 x 1400 (aspect 0.71).
        const aspect = crop.width / crop.height;
        if (aspect < 2) throw new Error(`the image sent to be read is the shape of the sheet, not of the writing: ${JSON.stringify(crop)}`);
        if (crop.inkShare === 0) throw new Error('the image sent to be read is blank');
        // A printed line of the template would cross the whole crop; handwriting never fills a row or a column.
        if (crop.fullestRow > 0.6 || crop.fullestColumn > 0.6) throw new Error(`the image sent to be read has the template's printed lines in it: ${JSON.stringify(crop)}`);
        if (crop.inkShare > 0.2) throw new Error(`the image sent to be read is not just handwriting: ${JSON.stringify(crop)}`);
        if (sheet.width < 100) throw new Error('the sheet went away');
      } finally {
        ops.stop();
      }
    },
    teardown: (page, h) => h.esc(),
  },
  {
    // "Use for new days": a blank day shows this device's template as a preview and saves nothing.
    // The first ink prints it into the drawing for real, under the stroke, in the note that is made.
    name: '3a-template-for-new-days',
    goto: '/',
    wait: 1800,
    viewports: tablet,
    async setup(page) {
      const ops = watchOps(page);
      try {
        await inkBox(page);
        // Make "Top three on Dot grid" the device's page from the menu itself, on another day.
        await openPageMenu(page);
        await page.locator('[data-testid="ink-page-dots"]').click();
        await page.locator('[data-testid="ink-sheet-top3"]').click();
        await page.locator('[data-testid="ink-page-default"]').click();
        if ((await page.locator('[data-testid="ink-page-default"]').getAttribute('aria-checked')) !== 'true') throw new Error('"Use for new days" is not ticked after choosing it');
        const prefs = await page.evaluate(() => [localStorage.getItem('geekday:pageTemplate'), localStorage.getItem('geekday:pageSheet')]);
        if (prefs.join() !== 'dots,top3') throw new Error(`the device default was stored as ${prefs.join()}`);
        await closePageMenu(page);

        // A new, blank day.
        const key = await page.evaluate(() => {
          const d = new Date(Date.now() + 5 * 86400000);
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        });
        ops.seen.length = 0;
        await page.goto(new URL(`/day/${key}`, page.url()).href, { waitUntil: 'networkidle' });
        await page.waitForTimeout(1500);
        const box = await inkBox(page);
        await must(page, `${CANVAS}[data-ink-paper="dots"][data-ink-sheet="top3"][data-ink-sheet-state="preview"][data-ink-light="true"]`, 'the previewed Top three on dot paper');
        await must(page, '[data-testid="ink-sheet-preview"][data-template="top3"]', 'the template preview');
        await page.waitForFunction(() => {
          const el = document.querySelector('[data-testid="ink-sheet-preview"]');
          return el && el.complete && el.naturalWidth > 0;
        }, null, { timeout: 8000 });
        if ((await page.locator(`${CANVAS} .tl-shape`).count()) !== 0) throw new Error('a blank day already has a shape in its drawing');
        await page.waitForTimeout(900);
        await mustNot(page, '[data-testid="ink-save-status"]', 'a save, on a blank day that only shows the default');
        if (ops.last('CreateDayNote', 'SaveDayNote')) throw new Error('a blank day was saved without any ink');

        // The first ink.
        await stroke(page, box, word(0.3, 0.2));
        const sheet = await mustShowSheet(page, 'top3');
        await page.waitForTimeout(700);
        await waitSaved(page);
        const records = savedRecords(ops);
        const shape = mustHaveSavedSheet(records, 'top3');
        const strokes = Object.values(records).filter((r) => r.type === 'draw');
        if (strokes.length !== 1 || !(strokes[0].index > shape.index)) throw new Error('the first stroke is not saved above the sheet');
        if (records['document:document']?.meta?.paperTemplate !== 'dots') throw new Error(`the day did not keep its paper: ${JSON.stringify(records['document:document']?.meta)}`);
        if (sheet.width < 100) throw new Error('the sheet went away');
        // Taking the first stroke back takes the sheet with it (one step): the day is blank again.
        await page.locator('[data-testid="ink-undo"]').click();
        await page.waitForTimeout(500);
        if ((await strokeCount(page)) !== 0) throw new Error('Undo did not take the first stroke back');
        if ((await page.locator(SHEET).count()) !== 0) throw new Error('Undo of the first stroke left the sheet behind: they are not one step');
        await must(page, `${CANVAS}[data-ink-sheet="none"][data-ink-sheet-state="none"]`, 'the page with neither ink nor template');
        await page.locator('[data-testid="ink-redo"]').click();
        await page.waitForTimeout(500);
        await mustShowSheet(page, 'top3');
        if ((await strokeCount(page)) !== 1) throw new Error('Redo did not bring the stroke back');
      } finally {
        ops.stop();
      }
    },
    async teardown(page) {
      await page.evaluate(() => {
        localStorage.removeItem('geekday:pageTemplate');
        localStorage.removeItem('geekday:pageSheet');
      });
    },
  },
];
