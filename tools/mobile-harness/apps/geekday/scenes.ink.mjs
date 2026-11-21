// GeekDay ink-page scenes: scrolling and page templates
// (DOCS/GEEKDAY_SPEC.md §6 S1–S5, DOCS/TEMPLATES_SPEC.md). Names start `3x-`.
//
// Portrait tablet only: the designed size. Every scene THROWS when the thing
// it is named for is not on screen. Scenes share one browser page, so any
// device setting a scene makes (localStorage) is put back in its teardown.

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
const strokeTops = (page) => page.locator(`${CANVAS} .tl-shape`).evaluateAll((nodes) => nodes
  .filter((n) => getComputedStyle(n).display !== 'none')
  .map((n) => Math.round(n.getBoundingClientRect().top)));
const strokeCount = (page) => page.locator(`${CANVAS} .tl-shape`).count();

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

/** The template image for `id` is on the page, loaded, behind the ink, and hidden from assistive tech. */
async function mustShowTemplate(page, id) {
  await must(page, `${CANVAS}[data-ink-template="${id}"]`, `the ${id} page`);
  const img = await must(page, `[data-testid="ink-template"][data-template="${id}"]`, `the ${id} template`);
  await page.waitForFunction((sel) => {
    const el = document.querySelector(sel);
    return el && el.complete && el.naturalWidth > 0;
  }, `[data-testid="ink-template"][data-template="${id}"]`, { timeout: 8000 });
  const facts = await img.evaluate((el) => {
    const pane = el.closest('[data-testid="ink-canvas"]').getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return {
      hidden: el.getAttribute('aria-hidden'),
      alt: el.getAttribute('alt'),
      left: Math.round(r.left - pane.left),
      top: Math.round(r.top - pane.top),
      widthGap: Math.round(Math.abs(r.width - pane.width)),
      isShape: Boolean(el.closest('.tl-shape')),
    };
  });
  if (facts.hidden !== 'true' || facts.alt !== '') throw new Error(`the ${id} template is announced: ${JSON.stringify(facts)}`);
  if (facts.isShape) throw new Error(`the ${id} template is part of the ink`);
  if (facts.left !== 0 || facts.top !== 0 || facts.widthGap > 1) throw new Error(`the ${id} template is not at the top of the page, one page wide: ${JSON.stringify(facts)}`);
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
    // P1–P3, P6: a saved day on the Schedule template, with writing on it.
    name: '31-template-schedule',
    goto: '/?__fixture=tpl-schedule',
    wait: 1800,
    viewports: tablet,
    async setup(page) {
      await inkBox(page);
      await mustShowTemplate(page, 'schedule');
      if ((await strokeCount(page)) < 5) throw new Error('the saved writing is not on the page');
      await must(page, '[data-testid="ink-rules"]', 'the ruled lines below the first sheet');
      await mustNot(page, '[data-testid="ink-save-status"]', 'a save, just from opening the page');
    },
  },
  {
    name: '32-template-meeting',
    goto: '/?__fixture=tpl-meeting',
    wait: 1800,
    viewports: tablet,
    async setup(page) {
      const box = await inkBox(page);
      await mustShowTemplate(page, 'meeting');
      if ((await strokeCount(page)) < 5) throw new Error('the saved writing is not on the page');
      // The template is paper: it scrolls with the page and the ruling carries on below it.
      await wheel(page, box, 240);
      const top = await page.locator('[data-testid="ink-template"]').evaluate((el) => Math.round(el.getBoundingClientRect().top - el.closest('[data-testid="ink-canvas"]').getBoundingClientRect().top));
      if (top > -80 || top < -250) throw new Error(`the template did not scroll with the page: its top is at ${top}`);
      await must(page, '[data-testid="ink-rules"]', 'the ruled lines below the first sheet');
    },
  },
  {
    // P4: the Page menu, open: Ruled and the six templates, the current one marked, "Use for new days".
    name: '33-template-picker',
    goto: '/',
    wait: 1800,
    viewports: tablet,
    async setup(page) {
      await inkBox(page);
      await (await must(page, '[data-testid="ink-page"]', 'the Page button')).click();
      await must(page, '[data-testid="ink-page-menu"]', 'the Page menu');
      const items = await page.locator('[data-testid="ink-page-menu"] [role="menuitemradio"]').evaluateAll((nodes) => nodes.map((n) => [n.dataset.testid, n.getAttribute('aria-checked')]));
      const want = ['none', 'schedule', 'top3', 'meeting', 'cornell', 'dots', 'grid'].map((id) => `ink-page-${id}`);
      if (items.map((i) => i[0]).join() !== want.join()) throw new Error(`the Page menu lists ${items.map((i) => i[0]).join(', ') || 'nothing'}`);
      // Choose one: it is drawn behind the menu, marked, and nothing is saved (a blank day makes no note).
      await page.locator('[data-testid="ink-page-top3"]').click();
      await mustShowTemplate(page, 'top3');
      if ((await page.locator('[data-testid="ink-page-top3"]').getAttribute('aria-checked')) !== 'true') throw new Error('the chosen template is not marked');
      await must(page, '[data-testid="ink-page-default"]', '"Use for new days"');
      await page.waitForTimeout(700);
      await mustNot(page, '[data-testid="ink-save-status"]', 'a save, from choosing a template on a blank day');
      await page.waitForTimeout(300); // the menu's transition
    },
    teardown: (page, h) => h.esc(),
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
      const leftBefore = await page.locator(`${CANVAS} .tl-shape`).first().evaluate((n) => Math.round(n.getBoundingClientRect().left));
      await flick(page, box, { fromX: 0.7, toX: 0.4 });
      if ((await dayOnScreen(page)) !== today) throw new Error('zoomed in, a sideways flick turned the day instead of panning the page');
      const leftAfter = await page.locator(`${CANVAS} .tl-shape`).first().evaluate((n) => Math.round(n.getBoundingClientRect().left));
      if (!(leftAfter < leftBefore - 20)) throw new Error(`zoomed in, a finger did not pan the page sideways: the stroke went from x ${leftBefore} to ${leftAfter}`);
      if ((await strokeCount(page)) !== before.length) throw new Error('the finger drew on a device that has a pen');
    },
    async teardown(page) {
      await page.evaluate(() => localStorage.removeItem('geekday:inkPenSeen'));
    },
  },
];
