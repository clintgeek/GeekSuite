// Shared scene helpers for FitnessGeek, so the scene files (scenes.mjs and
// the scenes-*.mjs it gathers) build every scene the same way.
import { json, graphqlRoute } from '../../lib/net.mjs';
import { DESCRIBED_SOUP, SUGGEST_FAGE, DEEP_FAGE, SUGGEST_SOUP } from './fixtures.mjs';
import { withHistoryBounds } from './history-ops.mjs';

// The weight, dashboard and wizard scenes THROW when their anchor is missing instead of
// returning false: a skip is silent (see scene 11's note), and these exist
// to prove specific UI is on screen.
export const must = async (locator, what) => {
  if (!(await locator.count())) throw new Error(`missing: ${what}`);
  return locator;
};

// A page-scoped GraphQL stub for one scene. page.route() beats ctx.route(),
// so it is dropped again whether setup succeeds or throws — the runner skips
// teardown on a throw, and one page serves every scene of a viewport.
export async function withPageOps(page, ops, fn) {
  await graphqlRoute(page, withHistoryBounds(ops));
  try {
    return await fn();
  } catch (err) {
    await page.unroute('**/graphql');
    throw err;
  }
}

// Scroll a section to just under the sticky top bar, then let the lazy chart
// in it arrive. THROWS when the anchor is missing: a scene that returns false
// is skipped silently (scene 11's note), and a missing section is a regression.
export async function scrollToSection(page, h, selector, offset = 72) {
  const el = page.locator(selector).first();
  if (!(await el.count())) throw new Error(`missing: ${selector}`);
  // scrollIntoView finds whichever ancestor actually scrolls (the shell's
  // main pane, not necessarily the window), then that ancestor backs off by
  // `offset` so the sticky top bar does not sit on the section's heading.
  await el.evaluate((node, off) => {
    node.scrollIntoView({ block: 'start' });
    let p = node.parentElement;
    while (p && !(p.scrollHeight > p.clientHeight && /(auto|scroll)/.test(getComputedStyle(p).overflowY))) {
      p = p.parentElement;
    }
    (p || document.scrollingElement).scrollBy(0, -off);
  }, offset);
  await h.settle(1200);
  return true;
}

// A recognizer the page can detect, so the microphone renders the same way
// whether or not this Chromium build exposes the Web Speech API. The shot is
// of the mic's idle state; nothing here listens.
export const SPEECH_STUB = () => {
  if (!window.SpeechRecognition && !window.webkitSpeechRecognition) {
    window.webkitSpeechRecognition = class {
      start() {}
      stop() {}
      abort() {}
    };
  }
};

/**
 * Open the "Protein, carbs and fat" disclosure in Today's "what is left" card.
 * It is closed by default and remembers its state per device (localStorage,
 * one context per viewport), so a scene reads aria-expanded and clicks only
 * when it has to, and the remembered choice is dropped again so no later
 * scene inherits it. `open: false` closes it.
 */
export async function setDetails(page, h, open = true) {
  const toggle = await must(page.locator('[data-testid="macros-details-toggle"]'), 'the "Protein, carbs and fat" disclosure');
  if ((await toggle.getAttribute('aria-expanded')) !== String(open)) {
    await toggle.click();
    await h.settle(500);
  }
  if ((await toggle.getAttribute('aria-expanded')) !== String(open)) throw new Error(`"Protein, carbs and fat" did not ${open ? 'open' : 'close'}`);
  // The page has read its choice already (on mount), so forgetting it here
  // leaves this scene as it is and starts the next one from the default.
  await page.evaluate(() => { try { localStorage.removeItem('fg.today.details.v1'); } catch { /* blocked */ } });
  const body = page.locator('[data-testid="today-details"]');
  if (open) await must(body, 'the details behind "Protein, carbs and fat"');
  else if (await body.count()) throw new Error('"Protein, carbs and fat" is closed but its contents are still drawn');
  return toggle;
}

// The body-composition card keeps its trend, change card and detail behind
// "More from your scans".
export const openBodyCompMore = async (page, h) => {
  const more = await must(page.locator('[data-testid="body-comp-more"]'), '"More from your scans"');
  await more.scrollIntoViewIfNeeded();
  if ((await more.getAttribute('aria-expanded')) !== 'true') {
    // dispatchEvent, not click(): a real click parks the mouse over the button,
    // and its mouseleave hides a chart tooltip a later tap opens (53e).
    await more.dispatchEvent('click');
    await h.settle(700);
  }
};
/** Open a meal's "more" menu on Today; returns the menu. */
export async function openMealMenu(page, h, meal) {
  // A slow first paint is not a missing menu: wait for the meals, then insist.
  await page.locator(`[data-testid="meal-more-${meal}"]`).waitFor({ timeout: 8000 }).catch(() => {});
  const more = await must(page.locator(`[data-testid="meal-more-${meal}"]`), `the "more" button on ${meal}`);
  await more.scrollIntoViewIfNeeded();
  await more.click();
  await h.settle(500);
  return must(page.getByRole('menu'), `the ${meal} "more" menu`);
}

/** Tap a food row on Today (the whole row is the Edit button); returns the edit dialog. */
export async function openEdit(page, h, name) {
  await page.locator('[data-testid="food-log-row"]').first().waitFor({ timeout: 8000 }).catch(() => {});
  const row = await must(page.locator('[data-testid="food-log-row"]').filter({ hasText: name }).first(), `the ${name} row`);
  await row.scrollIntoViewIfNeeded();
  await row.click();
  await h.settle(800);
  return must(page.getByRole('dialog'), 'the edit dialog');
}

// ── The food composer (REVIEW_2026-10 §4, Phase 3.16) ────────────────────
// "The harness has no picture of the add box while typing, thinking, after a
// result or after an error. The surface she complains about is unaudited."
// Every state gets a scene here. The REST stubs are page-scoped and dropped
// in teardown; each scene re-navigates.
export const SUGGEST_RE = /\/api\/foods\/suggest/;
export const DEEP_RE = /\/api\/foods\?/;
export const DESCRIBE_RE = /\/api\/logs\/describe/;
export const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });
export const isoLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const YESTERDAY = (() => { const d = new Date(); d.setDate(d.getDate() - 1); return isoLocal(d); })();

/**
 * Stub the food REST calls. `suggest(q)` and `deep(q)` return rows for a
 * query; `describe` is a response body, a status, or a function of the route.
 */
export async function foodRoutes(page, { suggest = () => [], deep = () => [], suggestMs = 0, deepMs = 0, describe = DESCRIBED_SOUP } = {}) {
  await page.route(DEEP_RE, async (r) => {
    const q = new URL(r.request().url()).searchParams.get('search') || '';
    if (deepMs) await wait(deepMs);
    try { await json(r, { success: true, data: deep(q) }); } catch { /* the page moved on */ }
  });
  await page.route(SUGGEST_RE, async (r) => {
    const q = new URL(r.request().url()).searchParams.get('q') || '';
    if (suggestMs) await wait(suggestMs);
    try { await json(r, { success: true, data: suggest(q) }); } catch { /* the page moved on */ }
  });
  await page.route(DESCRIBE_RE, async (r) => {
    if (typeof describe === 'function') return describe(r);
    if (typeof describe === 'number') return json(r, { success: false, error: { message: 'Internal error' } }, describe);
    return json(r, { success: true, data: describe });
  });
}
export async function dropFoodRoutes(page) {
  await page.unroute(DEEP_RE);
  await page.unroute(SUGGEST_RE);
  await page.unroute(DESCRIBE_RE);
}

export const soupSuggest = (q) => (/soup|cracker/i.test(q) ? SUGGEST_SOUP : []);
export const fageSuggest = (q) => (/fag/i.test(q) ? SUGGEST_FAGE : []);
export const fageDeep = (q) => (/fage/i.test(q) ? DEEP_FAGE : []);

/**
 * Open the add sheet from a meal's "Add" on Today and run `fn` inside it.
 * `sheet: false` leaves the opening to `fn`.
 */
export const composerScene = (name, { path = '/dashboard', meal = 'lunch', routes = {}, fn, viewports, offline = false, sheet = true }) => ({
  name,
  ...(viewports ? { viewports } : {}),
  async setup(page, h) {
    await foodRoutes(page, routes);
    try {
      await page.goto(h.base + path, { waitUntil: 'networkidle' });
      await h.settle(1400);
      let scope = page;
      if (sheet) {
        const addBtn = page.getByRole('button', { name: new RegExp(`^add to ${meal}$`, 'i') }).first();
        // A cold first scene can still be loading Today: wait, then insist.
        await addBtn.waitFor({ timeout: 8000 }).catch(() => {});
        const add = await must(addBtn, `Add to ${meal}`);
        await add.click();
        await h.settle(900);
        scope = await must(page.getByRole('dialog'), 'add sheet');
      }
      if (offline) {
        await page.context().setOffline(true);
        await h.settle(300);
      }
      await fn(page, h, scope);
    } catch (err) {
      if (offline) await page.context().setOffline(false);
      await dropFoodRoutes(page);
      throw err;
    }
  },
  async teardown(page, h) {
    if (offline) await page.context().setOffline(false);
    if (sheet) await h.esc(400);
    await h.esc(300);
    await dropFoodRoutes(page);
  },
});

export const typeInto = async (scope, text, h, settle = 900) => {
  const box = await must(scope.getByLabel('Tell me what you ate').first(), 'the composer box');
  await box.fill(text);
  await h.settle(settle);
  return box;
};
export const SOUP = 'a bowl of chicken soup and some crackers';
