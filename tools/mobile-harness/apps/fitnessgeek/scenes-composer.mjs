// Wave A scenes (composer): the add sheet and everything the UX review built
// into it — tap-twice rows, Again chips, the session ribbon, long catalog
// names, name vs sentence mode, "Same as Sarah's dinner", backfilled naming,
// offline and signed-out, every describe outcome, the serving sheet, larger
// text with the keyboard up, and the microphone. See scenes.mjs.
//
// Prefix 4x. The list's numbers are the old 21–37 composer scenes' neighbours,
// not replacements: those stay in scenes.mjs.
import { graphqlRoute } from '../../lib/net.mjs';
import { OPS, FOOD_LOGS, SUGGEST_LONG, heatherOps } from './fixtures.mjs';
import {
  must, foodRoutes, dropFoodRoutes, scrollToSection, HEATHER, typeInto, SOUP,
  fageSuggest, fageDeep, soupSuggest, wait,
} from './helpers.mjs';

// ── Catalog rows ─────────────────────────────────────────────────────────
const rf = (id, name, brand, cal, size, unit, source = 'usda', extra = {}) => ({
  id, kind: 'food', name, brand, source,
  serving: { size, unit },
  nutrition: { calories_per_serving: cal, protein_grams: 10, carbs_grams: 12, fat_grams: 5, ...(extra.macros || {}) },
  ...extra,
});
const EGGS = [
  rf('egg1', 'Egg', null, 72, 50, 'g', 'custom', { shelf: 'recent', macros: { protein_grams: 6, carbs_grams: 0.4, fat_grams: 5 } }),
  rf('egg2', 'Egg whites', null, 17, 33, 'g', 'usda', { macros: { protein_grams: 3.6, carbs_grams: 0.2, fat_grams: 0 } }),
  rf('egg3', 'Egg, hard-boiled', null, 78, 50, 'g', 'usda', { macros: { protein_grams: 6.3, carbs_grams: 0.6, fat_grams: 5.3 } }),
];
const eggSuggest = (q) => (/egg/i.test(q) ? EGGS : []);
const longSuggest = (q) => (String(q || '').trim() ? SUGGEST_LONG : []);

// ── Describe responses ───────────────────────────────────────────────────
const said = (logId, name, mealType, calories, servings = 1) => ({
  logId, name, servings, loggedServings: servings, mealType, calories,
  nutrition: { calories_per_serving: Math.round(calories / servings), protein_grams: 8, carbs_grams: 14, fat_grams: 6 },
  source: 'estimate', flags: [],
});
const reply = (rows, extra = {}) => ({
  logged: rows, skipped: [], logIds: rows.map((r) => r.logId), questions: [],
  totalCalories: rows.reduce((a, r) => a + r.calories, 0), dayHint: null, dayWords: [], ...extra,
});
const weekdayAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toLocaleDateString('en-US', { weekday: 'long' });
};

// The composer's writes, with ids that differ, as the gateway's would. A
// household copy ("Same as Sarah's dinner") answers with the new rows.
const writeOps = () => {
  let n = 0;
  return {
    AddFoodLog: (vars) => ({
      addFoodLog: { ...FOOD_LOGS[0], id: `log-added-${++n}`, meal_type: vars.input?.meal_type || 'lunch', servings: vars.input?.servings ?? 1 },
    }),
    CopyFitnessMeal: { copyFitnessMeal: [{ __typename: 'FoodLog', id: 'copy-1' }, { __typename: 'FoodLog', id: 'copy-2' }, { __typename: 'FoodLog', id: 'copy-3' }] },
  };
};

const rect = (b) => (b ? { x: b.x, y: b.y, w: b.width, h: b.height } : null);
const intersects = (a, b) => Boolean(a && b && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h);

// Every toast on screen: inside the viewport, none on top of another, and
// none on top of `avoid` (the ribbon's Done). Two toasts used to sit side by
// side on a phone with the second clipped off the right edge, and the 10 s
// toast sat over Done (d-fixes).
const assertToastsClear = async (page, h, { min = 1, avoid = null, what = 'toast' } = {}) => {
  const vp = page.viewportSize();
  const boxes = [];
  const toasts = page.locator('[data-geek-toast]');
  for (let i = 0; i < await toasts.count(); i += 1) boxes.push(rect(await toasts.nth(i).boundingBox()));
  h.log(`${what}s ${JSON.stringify(boxes)}${avoid ? ` · avoid ${JSON.stringify(avoid)}` : ''}`);
  if (boxes.length < min) throw new Error(`expected at least ${min} ${what}(s), saw ${boxes.length}`);
  boxes.forEach((b, i) => {
    if (b.x < 0 || b.y < 0 || b.x + b.w > vp.width + 0.5 || b.y + b.h > vp.height + 0.5) {
      throw new Error(`${what} ${i + 1} runs off the screen: ${JSON.stringify(b)} in ${vp.width}×${vp.height}`);
    }
    boxes.slice(i + 1).forEach((o, j) => {
      if (intersects(b, o)) throw new Error(`${what}s ${i + 1} and ${i + j + 2} overlap: ${JSON.stringify(b)} / ${JSON.stringify(o)}`);
    });
    if (avoid && intersects(b, avoid)) throw new Error(`${what} ${i + 1} covers ${JSON.stringify(avoid)}: ${JSON.stringify(b)}`);
  });
  return boxes;
};
const clearDrafts = (page) => page.evaluate(() => { try { sessionStorage.clear(); } catch { /* blocked */ } });

/**
 * One add-sheet scene. Everything it stubs is page-scoped and undone in
 * teardown and on a throw (one page serves every scene of a viewport).
 *   experience  'simple' (Heather) or 'full' (Chef, the context's own user)
 *   heather     patch on HEATHER (larger_text …)
 *   today       Heather's logs for today
 *   ops         extra GraphQL ops, or a function returning them
 *   size        a viewport for this scene; restored after
 *   hold        a GraphQL op name to hold until teardown ("Adding…")
 *   init        an init script (tail scenes only — a page cannot take one back)
 *   path/sheet  where to start; sheet:false leaves the opening to `fn`
 */
function sheetScene(name, o = {}) {
  const {
    experience = 'full', heather = {}, today, meal = 'lunch', path = '/dashboard', suggest, deep, suggestMs, deepMs,
    describe, ops = {}, size, hold, init, sheet = true, viewports, offline = false, fn,
  } = o;
  const cleanups = [];
  const cleanup = async () => {
    while (cleanups.length) {
      const undo = cleanups.pop();
      try { await undo(); } catch { /* already gone */ }
    }
  };
  return {
    name,
    ...(viewports ? { viewports } : {}),
    async setup(page, h) {
      try {
        await foodRoutes(page, { suggest, deep, suggestMs, deepMs, ...(describe !== undefined ? { describe } : {}) });
        cleanups.push(() => dropFoodRoutes(page));
        const base = experience === 'simple' ? heatherOps({ ...HEATHER, ...heather }, today ? { today } : {}) : OPS;
        await graphqlRoute(page, { ...base, ...writeOps(), ...(typeof ops === 'function' ? ops() : ops) });
        cleanups.push(() => page.unroute('**/graphql'));
        if (hold) {
          // Held until teardown. Every other op falls through to the stub above.
          let release;
          const gate = new Promise((resolve) => { release = resolve; });
          await page.route('**/graphql', async (r) => {
            let op = null;
            try { op = JSON.parse(r.request().postData() || '{}').operationName; } catch { /* not ours */ }
            if (op !== hold) return r.fallback();
            await gate;
            try { return await r.fallback(); } catch { return undefined; }
          });
          cleanups.push(async () => { release(); await wait(300); });
        }
        if (size) {
          await page.setViewportSize(size);
          cleanups.push(() => page.setViewportSize(h.isPhone ? { width: 390, height: 844 } : { width: 1280, height: 900 }));
        }
        if (init) await page.addInitScript(init);
        await page.goto(h.base + path, { waitUntil: 'networkidle' });
        await clearDrafts(page);
        await h.settle(1400);
        let scope = page;
        if (sheet) {
          // The run's first scene meets a cold page: give Home a few seconds before calling it missing.
          await page.getByRole('button', { name: new RegExp(`^add to ${meal}$`, 'i') }).first().waitFor({ timeout: 8000 }).catch(() => {});
          const add = await must(page.getByRole('button', { name: new RegExp(`^add to ${meal}$`, 'i') }).first(), `Add to ${meal}`);
          await add.click();
          await h.settle(1100);
          scope = await must(page.getByRole('dialog'), 'add sheet');
        }
        if (offline) {
          await page.context().setOffline(true);
          cleanups.push(() => page.context().setOffline(false));
          await h.settle(300);
        }
        await fn(page, h, scope);
      } catch (err) {
        await cleanup();
        throw err;
      }
    },
    async teardown(page, h) {
      if (hold) await cleanup();
      await h.esc(400);
      await h.esc(300);
      await cleanup();
    },
  };
}

// The toast would sit on the row being photographed; close it (a locator, since the modal marks it aria-hidden).
const dismissToasts = async (page, h) => {
  const closers = page.locator('.MuiSnackbar-root button').filter({ hasNotText: /Undo|Try again|Sign in/ });
  for (let i = await closers.count(); i > 0; i -= 1) await closers.first().click({ force: true }).catch(() => {});
  await h.settle(500);
};
const showChips = async (sheet, h) => {
  await sheet.getByTestId('again-chips').getByRole('button').last().scrollIntoViewIfNeeded();
  await h.settle(300);
};
const tapRow = async (sheet, h, re, what) => {
  await (await must(sheet.getByRole('button', { name: re }).first(), what)).click();
  await h.settle(900);
};

// ── 40  A row, tapped once and then again ───────────────────────────────
export const scenes = [
  // One tap: the row says "Added" (with a drawn check), its pill says "Make it 2", and the ribbon
  // names the meal from the first item, with Done.
  sheetScene('40-row-tapped-once', {
    experience: 'simple', meal: 'breakfast', suggest: eggSuggest,
    fn: async (page, h, sheet) => {
      await typeInto(sheet, 'egg', h, 1000);
      await tapRow(sheet, h, /^Add Egg, /, 'the Egg row');
      await must(sheet.getByText(/^Added$/).first(), '"Added" on the row');
      await must(sheet.getByRole('button', { name: /^Make it 2/ }), '"Make it 2"');
      await must(sheet.getByTestId('session-ribbon').filter({ hasText: '1 added to breakfast' }), 'the ribbon "1 added to breakfast"');
      await must(sheet.getByTestId('session-done'), 'Done');
      await dismissToasts(page, h);
    },
  }),
  // A second tap on the same row is another serving, not another entry.
  sheetScene('40a-row-tapped-twice', {
    experience: 'simple', meal: 'breakfast', suggest: eggSuggest,
    fn: async (page, h, sheet) => {
      await typeInto(sheet, 'egg', h, 1000);
      await tapRow(sheet, h, /^Add Egg, /, 'the Egg row');
      await tapRow(sheet, h, /^Add another Egg, /, 'the Egg row again');
      await must(sheet.getByText(/^2 added$/).first(), '"2 added" on the row');
      await must(sheet.getByRole('button', { name: /^Make it 3/ }), '"Make it 3"');
      // One entry with two servings: still "1 added", now 144 cal.
      await must(sheet.getByTestId('session-ribbon').filter({ hasText: '1 added to breakfast' }).filter({ hasText: '144 cal' }), 'the ribbon "1 added to breakfast · 144 cal"');
      // Two toasts are up now: stacked, both on screen, neither over Done.
      const done = rect(await sheet.getByTestId('session-done').boundingBox());
      await assertToastsClear(page, h, { min: 2, avoid: done });
      await dismissToasts(page, h);
    },
  }),

  // ── 41  Again chips ───────────────────────────────────────────────────
  // Before any tap: a food last logged at 2 servings says "×2", and a long
  // catalog name is a chip that fits.
  sheetScene('41-again-chips-amounts', {
    meal: 'lunch',
    fn: async (page, h, sheet) => {
      await must(sheet.getByTestId('again-chips'), 'Again chips');
      await must(sheet.getByRole('button', { name: /Sourdough Toast ×2/ }), 'the "Toast ×2" chip');
      await must(sheet.getByRole('button', { name: /Breaded Southern Fried Chicken Breast/ }), 'the long-name chip');
      await showChips(sheet, h);
    },
  }),
  // After a tap: "Chicken Caesar Salad · Added" with "Make it 2" beside it.
  sheetScene('41a-again-chip-added', {
    meal: 'lunch',
    fn: async (page, h, sheet) => {
      await tapRow(sheet, h, /^Add Chicken Caesar Salad to lunch again$/, 'the Caesar chip');
      await must(sheet.getByRole('button', { name: /^Add another Chicken Caesar Salad to lunch$/ }), 'the chip in "Added"');
      await must(sheet.getByRole('button', { name: /^Make it 2 Chicken Caesar Salad$/ }), '"Make it 2" beside the chip');
      await must(sheet.getByText(/Chicken Caesar Salad · Added$/), 'the chip text');
      await dismissToasts(page, h);
      await showChips(sheet, h);
    },
  }),
  // A chip that re-logs 2 servings counts them: "2 added", "Make it 3".
  sheetScene('41b-again-chip-toast-x2', {
    meal: 'lunch',
    fn: async (page, h, sheet) => {
      await tapRow(sheet, h, /^Add Sourdough Toast ×2 to lunch again$/, 'the Toast ×2 chip');
      await must(sheet.getByText(/Sourdough Toast · 2 added$/), '"2 added" on the chip');
      await must(sheet.getByRole('button', { name: /^Make it 3 Sourdough Toast$/ }), '"Make it 3"');
      await dismissToasts(page, h);
      await showChips(sheet, h);
    },
  }),
  // The long name in the "Added" (with a drawn check) chip, beside its Make-it button.
  sheetScene('41c-again-chip-long-name-added', {
    meal: 'lunch',
    fn: async (page, h, sheet) => {
      await tapRow(sheet, h, /^Add Breaded Southern Fried Chicken Breast to lunch again$/, 'the chicken chip');
      await must(sheet.getByRole('button', { name: /^Make it 2 Breaded Southern Fried Chicken Breast$/ }), '"Make it 2" beside the long chip');
      await dismissToasts(page, h);
      await showChips(sheet, h);
    },
  }),
  // The write in flight: the chip says "Adding…" and the others wait.
  sheetScene('41d-again-chip-adding', {
    meal: 'lunch', hold: 'AddFoodLog',
    fn: async (page, h, sheet) => {
      await (await must(sheet.getByRole('button', { name: /^Add Chicken Caesar Salad to lunch again$/ }), 'the Caesar chip')).click();
      await h.settle(600);
      await must(sheet.getByText('Adding…'), '"Adding…" on the chip');
      await showChips(sheet, h);
    },
  }),

  // ── 42  The ribbon, and the toast that arrives with it ────────────────
  // While the 10 s toast is up. The snackbar is bottom-left/centre; the ribbon
  // is the sheet's sticky foot. Asserts they don't overlap and that Done is
  // what's on top at the middle of Done.
  sheetScene('42-ribbon-with-toast', {
    experience: 'simple', meal: 'breakfast', suggest: eggSuggest,
    fn: async (page, h, sheet) => {
      await typeInto(sheet, 'egg', h, 1000);
      await tapRow(sheet, h, /^Add Egg, /, 'the Egg row');
      const snack = await must(page.locator('.MuiSnackbar-root'), 'the "Added" toast');
      const done = await must(sheet.getByTestId('session-done'), 'the ribbon Done');
      const sb = rect(await snack.first().boundingBox());
      const db = rect(await done.boundingBox());
      const topmost = await done.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        return top === el || el.contains(top) ? 'Done' : `${top?.tagName}.${String(top?.className).slice(0, 40)}`;
      });
      h.log(`toast ${JSON.stringify(sb)} · Done ${JSON.stringify(db)} · overlap=${intersects(sb, db)} · on top at Done's centre: ${topmost}`);
      // The toast used to sit over Done for ten seconds on a phone (d-fixes):
      // the ribbon registers itself, and the toasts rise above it.
      if (topmost !== 'Done') throw new Error(`Done is covered: on top at its centre is ${topmost}`);
      await assertToastsClear(page, h, { avoid: db });
    },
  }),
  // Ten seconds later, the toast gone: only the ribbon is left.
  sheetScene('42a-ribbon-toast-gone', {
    experience: 'simple', meal: 'breakfast', suggest: eggSuggest,
    fn: async (page, h, sheet) => {
      await typeInto(sheet, 'egg', h, 1000);
      await tapRow(sheet, h, /^Add Egg, /, 'the Egg row');
      await h.settle(10800);
      if (await page.locator('.MuiSnackbar-root').count()) throw new Error('the toast should be gone after ten seconds');
      await must(sheet.getByTestId('session-ribbon'), 'the ribbon');
    },
  }),
  // Two different foods: "2 added to breakfast", both calorie counts summed.
  sheetScene('42b-ribbon-two-items', {
    experience: 'simple', meal: 'breakfast', suggest: eggSuggest,
    fn: async (page, h, sheet) => {
      await typeInto(sheet, 'egg', h, 1000);
      await tapRow(sheet, h, /^Add Egg, /, 'the Egg row');
      await tapRow(sheet, h, /^Add Egg whites, /, 'the Egg whites row');
      await must(sheet.getByTestId('session-ribbon').filter({ hasText: '2 added to breakfast' }).filter({ hasText: '89 cal' }), 'the ribbon "2 added to breakfast · 89 cal"');
      await dismissToasts(page, h);
    },
  }),

  // ── 43  Long OpenFoodFacts names ──────────────────────────────────────
  // Phone: two-line names, and "Brand · serving · 190 cal" in the subtitle.
  sheetScene('43-long-names-phone', {
    experience: 'simple', meal: 'lunch', suggest: longSuggest, viewports: ['phone'],
    fn: async (page, h, sheet) => {
      await typeInto(sheet, 'protein', h, 1100);
      await must(sheet.getByText('Fage Total 0% Greek Yogurt, Plain Nonfat').first(), 'the long Fage name');
      await must(sheet.getByTestId('food-row-subtitle').filter({ hasText: /Tyson · .*· 260 cal/ }), 'subtitle "Tyson · serving · 260 cal"');
    },
  }),
  // Desktop md (1000 wide): the P/C/F line moves into the subtitle.
  sheetScene('43a-long-names-desktop-md', {
    meal: 'lunch', suggest: longSuggest, viewports: ['desktop'], size: { width: 1000, height: 900 },
    fn: async (page, h, sheet) => {
      await typeInto(sheet, 'protein', h, 1100);
      await must(sheet.getByTestId('food-row-subtitle').filter({ hasText: /P 19 · C 14 · F 14 g/ }).first(), 'the P/C/F subtitle');
    },
  }),
  // Desktop lg (1280): the macro column; the subtitle drops the macros.
  sheetScene('43b-long-names-desktop-lg', {
    meal: 'lunch', suggest: longSuggest, viewports: ['desktop'],
    fn: async (page, h, sheet) => {
      await typeInto(sheet, 'protein', h, 1100);
      await must(sheet.getByText(/^P 19 · C 14 · F 14 g$/).first(), 'the macro column');
    },
  }),

  // ── 44  Name mode and sentence mode ───────────────────────────────────
  // "fage" is a name: the list is open and Log it steps back to an outline.
  sheetScene('44-name-mode', {
    experience: 'simple', meal: 'lunch', suggest: fageSuggest, deep: fageDeep,
    fn: async (page, h, sheet) => {
      await typeInto(sheet, 'fage', h, 1200);
      const logIt = await must(sheet.getByTestId('log-it'), 'Log it');
      if (!/Just log ‘fage’/.test(await logIt.innerText())) throw new Error(`name mode button reads "${await logIt.innerText()}"`);
      if (!/MuiButton-outlined/.test(await logIt.getAttribute('class'))) throw new Error('"Just log \'fage\'" should be outlined');
      await must(sheet.getByTestId('food-row'), 'the open list');
    },
  }),
  // "two eggs" is a sentence: the filled Log it, the list folded.
  sheetScene('44a-sentence-mode', {
    experience: 'simple', meal: 'lunch', suggest: eggSuggest,
    fn: async (page, h, sheet) => {
      await typeInto(sheet, 'two eggs', h, 1000);
      const logIt = await must(sheet.getByTestId('log-it'), 'Log it');
      if ((await logIt.innerText()).trim() !== 'Log it') throw new Error(`sentence mode button reads "${await logIt.innerText()}"`);
      if (!/MuiButton-contained/.test(await logIt.getAttribute('class'))) throw new Error('"Log it" should be filled');
      await must(sheet.locator('[data-testid="exact-food-toggle"][aria-expanded="false"]'), 'the folded list');
    },
  }),

  // ── 45  Same as Sarah's dinner ────────────────────────────────────────
  // The household pick, seen whole: her dinner's foods under the label.
  sheetScene('45-same-as-household', {
    meal: 'dinner',
    fn: async (page, h, sheet) => {
      const pick = await must(sheet.getByTestId('same-as-household'), '"Same as Sarah\'s dinner"');
      await pick.scrollIntoViewIfNeeded();
      if (!/Same as Sarah.s dinner/.test(await pick.innerText())) throw new Error(`the pick reads "${await pick.innerText()}"`);
      await h.settle(300);
    },
  }),
  // Tapped: the copy lands, the toast carries Undo, the ribbon says so.
  sheetScene('45a-same-as-household-tapped', {
    meal: 'dinner',
    fn: async (page, h, sheet) => {
      await (await must(sheet.getByTestId('same-as-household'), 'the household pick')).click();
      await h.settle(1000);
      // The toast used to render outside the sheet, under the modal's
      // aria-hidden, so a screen reader couldn't reach its Undo (d-fixes).
      // getByRole only finds what the accessibility tree exposes.
      const hidden = await page.locator('[data-geek-toast]').first().evaluate((el) => Boolean(el.closest('[aria-hidden="true"]')));
      if (hidden) throw new Error('the toast is under aria-hidden while the sheet is open');
      await must(page.getByRole('alert').getByRole('button', { name: 'Undo' }), 'the toast Undo, reachable by role');
      await must(sheet.getByTestId('session-ribbon'), 'the ribbon');
    },
  }),

  // ── 46  A backfilled sheet names its days ─────────────────────────────
  // Food Log page on Yesterday, dinner's "Add": the title says which weekday
  // "yesterday" is, and the pick says the weekday before it.
  {
    name: '46-backfilled-sheet-naming',
    async setup(page, h) {
      const day = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
      try {
        await foodRoutes(page, {});
        await page.goto(`${h.base}/food-log?date=${day(1)}&meal=dinner`, { waitUntil: 'networkidle' });
        await clearDrafts(page);
        await h.settle(1400);
        await (await must(page.getByRole('button', { name: 'Add to Dinner' }).first(), 'Dinner "Add"')).click();
        await h.settle(1100);
        const dialog = await must(page.getByRole('dialog'), 'the add sheet');
        await must(dialog.getByText(`Add to ${weekdayAgo(1)}’s dinner (yesterday)`), `the title "Add to ${weekdayAgo(1)}’s dinner (yesterday)"`);
        await must(dialog.getByTestId('same-as-yesterday').filter({ hasText: `Same as ${weekdayAgo(2)}’s dinner` }), `"Same as ${weekdayAgo(2)}’s dinner"`);
      } catch (err) {
        await dropFoodRoutes(page);
        throw err;
      }
    },
    async teardown(page, h) {
      await h.esc(400);
      await h.esc(300);
      await dropFoodRoutes(page);
    },
  },

  // ── 47  Offline ───────────────────────────────────────────────────────
  // No signal: the banner, the status line, a disabled mic, her sentence.
  sheetScene('47-offline-sheet', {
    experience: 'simple', meal: 'lunch', offline: true, viewports: ['phone'],
    fn: async (page, h, sheet) => {
      await typeInto(sheet, SOUP, h, 700);
      await must(sheet.getByText('No signal — I can’t log this yet. Your words are saved here.'), 'the status line');
      await must(sheet.getByRole('button', { name: 'Say what you ate' }), 'the mic (disabled, not hidden)');
      if (!(await sheet.getByRole('button', { name: 'Say what you ate' }).isDisabled())) throw new Error('the mic should be disabled offline');
      await must(page.getByText(/offline|no signal|not connected/i).first(), 'an offline banner somewhere on the page');
    },
  }),
  // Closed and reopened, still offline: the words are back.
  sheetScene('47a-offline-reopened', {
    experience: 'simple', meal: 'lunch', offline: true, viewports: ['phone'],
    fn: async (page, h, sheet) => {
      await typeInto(sheet, SOUP, h, 700);
      await h.esc(500);
      if (await page.getByRole('dialog').count()) throw new Error('the sheet should have closed');
      await (await must(page.getByRole('button', { name: /^add to lunch$/i }).first(), 'Add to lunch')).click();
      await h.settle(1000);
      const box = await must(page.getByRole('dialog').getByLabel('Tell me what you ate'), 'the box');
      const words = await box.inputValue();
      // L18: closing the Home sheet used to reset the meal to snack while it
      // was still mounted, so the lunch draft moved to snack and this box
      // came back empty (fixed in DashboardNew, d-fixes).
      if (words !== SOUP) throw new Error(`the words did not come back (box says "${words}")`);
    },
  }),

  // ── 48  Signed out, and every describe outcome ────────────────────────
  // A 401 that survives one refresh: "Please sign in again." and a Sign in
  // button under the box, her words kept.
  sheetScene('48-signed-out', {
    experience: 'simple', meal: 'lunch', suggest: soupSuggest, describe: 401,
    fn: async (page, h, sheet) => {
      await typeInto(sheet, SOUP, h, 400);
      await sheet.getByTestId('log-it').click();
      await h.settle(1800);
      await must(sheet.getByText('You’re signed out. Sign in again.'), 'the signed-out line');
      await must(sheet.getByTestId('sign-in-again'), 'the Sign in button');
      if ((await sheet.getByLabel('Tell me what you ate').inputValue()) !== SOUP) throw new Error('her words should still be in the box');
    },
  }),
  // Two rows, two meals: "Added to today" and a meal label under each row.
  sheetScene('48b-mixed-meal-result', {
    experience: 'simple', meal: 'lunch', suggest: soupSuggest,
    describe: reply([said('mx-1', 'Egg sandwich', 'breakfast', 310), said('mx-2', 'Steak, 6 oz', 'dinner', 420)]),
    fn: async (page, h, sheet) => {
      await typeInto(sheet, 'an egg sandwich this morning and a steak tonight', h, 400);
      await sheet.getByTestId('log-it').click();
      await h.settle(1200);
      await must(sheet.getByText('Added to today'), '"Added to today"');
      const card = await must(sheet.getByTestId('result-card'), 'the result card');
      await must(card.getByText(/breakfast/i), 'a breakfast label under a row');
      await must(card.getByText(/dinner/i), 'a dinner label under a row');
    },
  }),
  // Full: the sheet closes, the "Just added" strip carries the Undo, and no
  // toast sits on top of it.
  sheetScene('48c-full-just-added-no-toast', {
    meal: 'lunch', suggest: soupSuggest,
    fn: async (page, h, sheet) => {
      await typeInto(sheet, SOUP, h, 400);
      await sheet.getByTestId('log-it').click();
      await h.settle(1600);
      if (await page.getByRole('dialog').count()) throw new Error('Full: the add sheet should have closed');
      await must(page.locator('[data-testid="meal-card-lunch"] [data-testid="just-added"]'), '"Just added" on the lunch card');
      if (await page.locator('.MuiSnackbar-root').count()) throw new Error('a toast is up over the "Just added" strip');
      await scrollToSection(page, h, '[data-testid="meal-card-lunch"]', 88);
    },
  }),
  // Partly understood: the soup went in, "crackers" did not, with a way back.
  sheetScene('48d-partial-result', {
    experience: 'simple', meal: 'lunch', suggest: soupSuggest,
    describe: reply([said('pt-1', 'Chicken soup, 1 bowl', 'lunch', 220)], { skipped: [{ name: 'crackers' }] }),
    fn: async (page, h, sheet) => {
      await typeInto(sheet, SOUP, h, 400);
      await sheet.getByTestId('log-it').click();
      await h.settle(1200);
      await must(sheet.getByTestId('partial').getByText(/I couldn’t work out “crackers”/), 'the partial line');
      await must(sheet.getByRole('button', { name: 'Pick crackers' }), '"Pick crackers"');
    },
  }),
  // Nothing understood: the status line says so and nothing was logged.
  sheetScene('48e-nothing-understood', {
    experience: 'simple', meal: 'lunch', describe: reply([]),
    fn: async (page, h, sheet) => {
      await typeInto(sheet, 'asdf qwer zxcv', h, 400);
      await sheet.getByTestId('log-it').click();
      await h.settle(1200);
      await must(sheet.getByText(/I couldn’t find a food in that/), 'the "couldn’t find a food" line');
      if (await sheet.getByTestId('result-card').count()) throw new Error('nothing was logged, so no result card');
    },
  }),
  // The server heard a day we didn't: "Move it to <Weekday>".
  sheetScene('48f-server-heard-day', {
    experience: 'simple', meal: 'lunch',
    describe: reply([said('dy-1', 'Pasta, 1 cup', 'lunch', 220)], { dayHint: weekdayAgo(3).toLowerCase(), dayWords: [`on ${weekdayAgo(3)}`] }),
    fn: async (page, h, sheet) => {
      await typeInto(sheet, 'a cup of pasta, which I had out', h, 400);
      await sheet.getByTestId('log-it').click();
      await h.settle(1200);
      await must(sheet.getByTestId('day-move'), 'the day-move offer');
      await must(sheet.getByRole('button', { name: `Move it to ${weekdayAgo(3)}` }), `"Move it to ${weekdayAgo(3)}"`);
    },
  }),

  // ── 49  The serving sheet, larger text, phone stability ───────────────
  // Servings (the default) for a food that also has ounces.
  sheetScene('49-serving-sheet-servings', {
    experience: 'simple', meal: 'breakfast', suggest: eggSuggest,
    fn: async (page, h, sheet) => {
      await typeInto(sheet, 'egg', h, 1000);
      await (await must(sheet.getByRole('button', { name: /^Change the amount of Egg$/ }), 'Egg amount button')).click();
      await h.settle(700);
      const dlg = await must(page.getByRole('dialog').last(), 'the serving sheet');
      await must(dlg.getByRole('button', { name: 'Servings' }), 'the Servings toggle');
    },
  }),
  // Ounces.
  sheetScene('49a-serving-sheet-oz', {
    experience: 'simple', meal: 'breakfast', suggest: eggSuggest,
    fn: async (page, h, sheet) => {
      await typeInto(sheet, 'egg', h, 1000);
      await (await must(sheet.getByRole('button', { name: /^Change the amount of Egg$/ }), 'Egg amount button')).click();
      await h.settle(700);
      const dlg = await must(page.getByRole('dialog').last(), 'the serving sheet');
      await (await must(dlg.getByRole('button', { name: 'oz', exact: true }), 'the oz toggle')).click();
      await h.settle(500);
      await must(dlg.getByLabel('oz'), 'the oz amount field');
    },
  }),
  // Cups, for a food measured in them.
  sheetScene('49b-serving-sheet-cup', {
    experience: 'simple', meal: 'lunch', suggest: soupSuggest,
    fn: async (page, h, sheet) => {
      await typeInto(sheet, 'soup', h, 1000);
      await (await must(sheet.getByRole('button', { name: /^Change the amount of Chicken Noodle Soup$/ }), 'Soup amount button')).click();
      await h.settle(700);
      const dlg = await must(page.getByRole('dialog').last(), 'the serving sheet');
      await (await must(dlg.getByRole('button', { name: 'cup', exact: true }), 'the cup toggle')).click();
      await h.settle(500);
      await must(dlg.getByLabel('cup'), 'the cup amount field');
    },
  }),
  // Larger text, with the keyboard up (a 390x540 window, the way a phone
  // keyboard leaves it): Log it must still be on screen without scrolling.
  sheetScene('49c-larger-text-keyboard', {
    experience: 'simple', heather: { larger_text: true }, meal: 'lunch', suggest: eggSuggest, viewports: ['phone'],
    fn: async (page, h, sheet) => {
      if ((await page.evaluate(() => document.documentElement.dataset.textSize)) !== 'larger') throw new Error('Larger text is not on');
      await typeInto(sheet, 'two eggs and toast', h, 700);
      await page.setViewportSize({ width: 390, height: 540 });
      await h.settle(700);
      const logIt = await must(sheet.getByTestId('log-it'), 'Log it');
      const b = await logIt.boundingBox();
      h.log(`larger text, 540px tall: Log it y=${Math.round(b.y)}..${Math.round(b.y + b.height)}`);
      if (b.y < 0 || b.y + b.height > 540) throw new Error(`Log it is off screen with the keyboard up (y ${Math.round(b.y)}..${Math.round(b.y + b.height)} of 540)`);
    },
    // sheetScene restores the viewport itself only for `size`; this one changes it in fn.
    size: { width: 390, height: 844 },
  }),
  // The phone twin of scene 37: the sheet's top and the box's top hold still
  // while she types and when the late wave lands, and the first row does too.
  sheetScene('49d-phone-add-sheet-stable', {
    meal: 'lunch', suggest: fageSuggest, deep: fageDeep, suggestMs: 250, deepMs: 1400, viewports: ['phone'],
    fn: async (page, h, sheet) => {
      const paper = await must(page.locator('[data-testid="add-food-dialog"]'), 'the add sheet');
      const box = await must(paper.getByLabel('Tell me what you ate'), 'the composer box');
      const tops = async () => ({ dialog: (await paper.boundingBox()).y, input: (await box.boundingBox()).y });
      const before = await tops();
      await box.click();
      await box.pressSequentially('fage', { delay: 90 });
      await h.settle(700);
      const first = paper.locator('[data-testid="food-row"]').first();
      await must(first, 'wave one rows');
      const early = await paper.locator('[data-testid="food-row"]').count();
      const rowTop = (await first.boundingBox()).y;
      const mid = await tops();
      await h.settle(2200);
      const late = await paper.locator('[data-testid="food-row"]').count();
      if (late <= early) throw new Error(`wave two never landed (${early} → ${late} rows)`);
      const after = await tops();
      const rowAfter = (await first.boundingBox()).y;
      const moved = [];
      for (const key of ['dialog', 'input']) {
        for (const [label, at] of [['typing', mid], ['late batch', after]]) {
          const dy = Math.abs(at[key] - before[key]);
          if (dy > 2) moved.push(`${key} top moved ${dy.toFixed(1)}px (${label})`);
        }
      }
      if (Math.abs(rowAfter - rowTop) > 2) moved.push(`first row moved ${(rowAfter - rowTop).toFixed(1)}px when the late batch landed`);
      if (moved.length) throw new Error(`the phone add sheet bounced: ${moved.join('; ')}`);
      h.log(`phone stable: sheet ${before.dialog}→${after.dialog}, box ${before.input}→${after.input}, row ${rowTop}→${rowAfter}, rows ${early}→${late}`);
    },
  }),
];

// ── Tail: the microphone ─────────────────────────────────────────────────
// A recognizer the scene drives by hand. An init script can't be taken back,
// so these run after everything else. It is installed once per page and
// every scene below navigates itself.
const FAKE_MIC = () => {
  if (window.__fakeMic) return;
  window.__fakeMic = { rec: null };
  class FakeRecognition {
    constructor() { window.__fakeMic.rec = this; }
    start() {}
    stop() { if (this.onend) this.onend(); }
    abort() {}
  }
  window.SpeechRecognition = FakeRecognition;
  window.webkitSpeechRecognition = FakeRecognition;
};
const hear = (page, text, isFinal) => page.evaluate(([t, f]) => {
  const row = [{ transcript: t }];
  row.isFinal = f;
  window.__fakeMic.rec.onresult({ resultIndex: 0, results: [row] });
}, [text, isFinal]);
const micSheet = (name, fn, extra = {}) => sheetScene(name, {
  experience: 'simple', meal: 'breakfast', suggest: eggSuggest, init: FAKE_MIC, viewports: ['phone'], fn, ...extra,
});
const startListening = async (page, h, sheet) => {
  await (await must(sheet.getByRole('button', { name: 'Say what you ate' }), 'the mic')).click();
  await h.settle(400);
  await must(sheet.getByTestId('mic-listening'), '"Listening…"');
};

export const tail = [
  // Listening, with what it has heard so far.
  micSheet('49m-mic-listening-interim', async (page, h, sheet) => {
    await startListening(page, h, sheet);
    await hear(page, 'two eggs and a', false);
    await h.settle(500);
    await must(sheet.getByTestId('mic-listening').getByText('“two eggs and a”'), 'the interim words');
  }),
  // The browser said no: plain words, and typing still works.
  micSheet('49n-mic-error', async (page, h, sheet) => {
    await startListening(page, h, sheet);
    await page.evaluate(() => { const r = window.__fakeMic.rec; r.onerror({ error: 'not-allowed' }); r.onend(); });
    await h.settle(500);
    await must(sheet.getByTestId('mic-error').getByText(/needs your microphone/), 'the denied message');
  }),
  // She said it: the words go through describe-and-log and the card says what was heard.
  micSheet('49o-mic-result-heard', async (page, h, sheet) => {
    await startListening(page, h, sheet);
    await hear(page, 'two eggs and toast', true);
    await page.evaluate(() => window.__fakeMic.rec.onend());
    await h.settle(1500);
    await must(sheet.getByTestId('result-card').getByText('I heard: “two eggs and toast”'), '"I heard: …"');
  }, {
    describe: reply([said('mic-1', 'Eggs', 'breakfast', 144, 2), said('mic-2', 'Whole wheat toast', 'breakfast', 80)]),
  }),
];
