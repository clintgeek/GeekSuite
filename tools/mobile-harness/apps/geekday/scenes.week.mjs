// GeekDay week-spread scenes (DOCS/GEEKDAY_SPEC.md §6, W10). Names start `2x-`.
//
// The designed size is the portrait tablet. `20-week` runs everywhere, so a
// phone and a desktop prove the page does not break. Every scene THROWS when
// the thing it is named for is not on screen.

const must = async (page, selector, what) => {
  const node = page.locator(selector).first();
  if (!(await node.count()) || !(await node.isVisible())) throw new Error(`missing: ${what} (${selector})`);
  return node;
};
const mustNot = async (page, selector, what) => {
  const node = page.locator(selector).first();
  if ((await node.count()) && (await node.isVisible())) throw new Error(`should not be on screen: ${what} (${selector})`);
};
const count = (page, selector) => page.locator(selector).count();

const localKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const tablet = ['tablet-portrait'];

/** The last Wednesday of this September: the longest weekday and month names, a two-digit day. */
function widestDay() {
  const date = new Date(new Date().getFullYear(), 8, 30);
  while (date.getDay() !== 3) date.setDate(date.getDate() - 1);
  // On that very day the Today button would not show: the Wednesday before is as wide.
  if (localKey(date) === localKey(new Date())) date.setDate(date.getDate() - 7);
  return localKey(date);
}

/** The week has loaded: seven day boxes and the eighth. */
async function weekReady(page) {
  await page.waitForSelector('[data-testid="week-page"][data-status="ready"]', { timeout: 15000 });
  const days = await count(page, '[data-testid="week-day"]');
  if (days !== 7) throw new Error(`the week shows ${days} days, not 7`);
  await must(page, '[data-testid="week-unscheduled"]', 'the "Not scheduled" box');
}

/** The first open row of the box for weekday `index` (0 = Monday). */
const rowIn = (page, index) => page.locator('[data-testid="week-day"]').nth(index).locator('[data-testid="week-task"][data-task-state="open"]').first();

export const scenes = [
  {
    // The week with tasks (W1, W3, W7): seven days, their counts and tasks, today marked, the eighth box.
    name: '20-week',
    goto: '/week',
    wait: 2200,
    async setup(page) {
      await weekReady(page);
      await must(page, '[data-testid="week-title"]', 'the week’s dates');
      const today = await count(page, '[data-testid="week-day"][data-today="true"]');
      if (today !== 1) throw new Error(`${today} days are marked as today, not 1`);
      await must(page, '[data-testid="week-today-mark"]', 'the Today marker');
      const counts = await count(page, '[data-testid="week-count"]');
      if (counts !== 8) throw new Error(`${counts} boxes show a count, not 8`);
      await must(page, '[data-testid="week-day"] [data-testid="week-task"]', 'a task in a day');
      await must(page, '[data-testid="week-unscheduled"] [data-testid="week-task"][data-task-tone="overdue"]', 'an overdue task in "Not scheduled"');
      await must(page, '[data-testid="week-to-day"]', 'the Day button');
      const sideways = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      if (sideways > 1) throw new Error(`the page scrolls sideways by ${sideways}px`);
    },
  },
  {
    // The planner spread (W2): two columns of four boxes on one screen, nothing spilling out of a box,
    // a "+N more" line where a day has more than fits, and a picture of the days that have ink.
    name: '20b-week-spread',
    goto: '/week',
    wait: 2600,
    viewports: tablet,
    async setup(page) {
      await weekReady(page);
      const boxes = await page.locator('[data-week-cell]').evaluateAll((cells) => cells.map((c) => c.getBoundingClientRect().toJSON()));
      if (boxes.length !== 8) throw new Error(`${boxes.length} boxes, not 8`);
      const columns = new Set(boxes.map((b) => Math.round(b.x)));
      const rows = new Set(boxes.map((b) => Math.round(b.y)));
      if (columns.size !== 2 || rows.size !== 4) throw new Error(`the spread is ${columns.size} columns × ${rows.size} rows, not 2 × 4`);
      const scroll = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
      if (scroll > 1) throw new Error(`the page scrolls by ${scroll}px`);
      const spilled = await page.locator('[data-week-cell]').evaluateAll((cells) =>
        cells.flatMap((cell) => {
          const box = cell.getBoundingClientRect();
          return [...cell.querySelectorAll('[data-testid="week-task"], [data-testid="week-more"]')]
            .filter((row) => row.getBoundingClientRect().bottom > box.bottom + 0.5)
            .map(() => cell.getAttribute('data-week-cell'));
        })
      );
      if (spilled.length) throw new Error(`rows spill out of their box: ${spilled.join(', ')}`);
      await must(page, '[data-testid="week-more"]', 'a "+N more" line on the full day');
      await page.waitForSelector('[data-testid="week-ink-thumb"]', { timeout: 8000 });
      const inks = await count(page, '[data-testid="week-day-ink"]');
      if (inks !== 2) throw new Error(`${inks} days show an ink picture, not the 2 that have a page`);
      const small = await page.locator('[data-testid="week-task-tick"], [data-testid="week-task-move"], [data-testid="week-day-open"], [data-testid="week-day-ink"], [data-testid="week-more"]').evaluateAll((nodes) =>
        nodes.map((n) => n.getBoundingClientRect()).filter((b) => b.width < 44 || b.height < 44).length
      );
      if (small) throw new Error(`${small} tap targets are under 44px`);
      // A finger or pen on a task drags it: the browser must not take the gesture for scrolling.
      const touchAction = await rowIn(page, 0).evaluate((row) => getComputedStyle(row).touchAction);
      if (touchAction !== 'none') throw new Error(`task rows have touch-action: ${touchAction}, not none`);
    },
  },
  {
    name: '21-week-empty',
    goto: '/week?__fixture=empty',
    wait: 2200,
    viewports: tablet,
    async setup(page) {
      await weekReady(page);
      await must(page, '[data-testid="week-unscheduled-empty"]', 'the nothing-waiting message');
      await mustNot(page, '[data-testid="week-task"]', 'a task row');
      await mustNot(page, '[data-testid="week-error"]', 'the load error');
    },
  },
  {
    // A failure must never look like an empty week (W9).
    name: '22-week-load-failed',
    goto: '/week?__fixture=error',
    wait: 2600,
    viewports: tablet,
    async setup(page) {
      await must(page, '[data-testid="week-error"]', 'the week load error');
      await must(page, '[data-testid="week-error"] button', 'Retry');
      await mustNot(page, '[data-testid="week-day"]', 'a day box');
      await mustNot(page, '[data-testid="week-count"]', 'an "all clear" count');
      await mustNot(page, '[data-testid="week-unscheduled-empty"]', 'the nothing-waiting message');
      await must(page, '[data-testid="week-title"]', 'the week’s dates (the header still works)');
    },
  },
  {
    // Moving without dragging (W4): the menu on a task lists the seven days and "Next week".
    name: '23-week-move-menu',
    goto: '/week',
    wait: 2200,
    viewports: tablet,
    async setup(page) {
      await weekReady(page);
      await rowIn(page, 1).locator('[data-testid="week-task-move"]').click();
      await must(page, '[data-testid="week-move-menu"]', 'the move menu');
      await page.waitForTimeout(450); // the menu fades in
      const days = await count(page, '[data-testid="week-move-to"]');
      if (days !== 7) throw new Error(`the move menu lists ${days} days, not 7`);
      await must(page, '[data-testid="week-move-next-week"]', '"Next week" in the move menu');
      const here = await count(page, '[data-testid="week-move-to"][aria-disabled="true"]');
      if (here !== 1) throw new Error('the day the task is already on is not marked in the menu');
    },
    teardown: (page, h) => h.esc(),
  },
  {
    // A move from the menu lands in the other day and offers Undo (W4).
    name: '24-week-moved',
    goto: '/week',
    wait: 2200,
    viewports: tablet,
    async setup(page) {
      await weekReady(page);
      const row = rowIn(page, 1);
      const id = await row.getAttribute('data-task-id');
      await row.locator('[data-testid="week-task-move"]').click();
      await page.locator('[data-testid="week-move-to"]').nth(5).click();
      await page.waitForSelector('[data-testid="week-undo"]', { timeout: 5000 }).catch(() => {});
      await must(page, '[data-testid="week-undo"]', 'Undo');
      const landed = await page.locator('[data-testid="week-day"]').nth(5).locator(`[data-task-id="${id}"]`).count();
      if (landed !== 1) throw new Error('the moved task is not in the day it was moved to');
      const left = await page.locator('[data-testid="week-day"]').nth(1).locator(`[data-task-id="${id}"]`).count();
      if (left) throw new Error('the moved task is still in the day it was moved from');
    },
  },
  {
    // Dragging (W4): the row lifts, a copy follows the pointer, and the day under it is marked.
    name: '25-week-dragging',
    goto: '/week',
    wait: 2200,
    viewports: tablet,
    async setup(page) {
      await weekReady(page);
      const from = await rowIn(page, 3).boundingBox();
      const to = await page.locator('[data-testid="week-day"]').nth(6).boundingBox();
      await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
      await page.mouse.down();
      await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 8 });
      await must(page, '[data-testid="week-drag-ghost"]', 'the floating copy of the dragged task');
      const over = await page.locator('[data-testid="week-day"][data-drop-over="true"]').getAttribute('data-day').catch(() => null);
      const sunday = await page.locator('[data-testid="week-day"]').nth(6).getAttribute('data-day');
      if (over !== sunday) throw new Error(`the day under the pointer is not marked (marked: ${over || 'none'})`);
    },
    async teardown(page) {
      // Dropping it is the move itself.
      await page.mouse.up();
      await page.waitForSelector('[data-testid="week-undo"]', { timeout: 5000 });
    },
  },
  {
    // Another week (W7): its own dates, no Today marker, and one tap back to this week.
    name: '26-week-another',
    goto: `/week/${localKey(new Date(Date.now() + 9 * 86400000))}`,
    wait: 2200,
    viewports: tablet,
    async setup(page) {
      await weekReady(page);
      await must(page, '[data-testid="week-this"]', 'the This week button');
      await mustNot(page, '[data-testid="week-today-mark"]', 'the Today marker');
      const header = await page.evaluate(() => {
        const title = document.querySelector('[data-testid="week-title"]');
        return title.scrollWidth - title.clientWidth;
      });
      if (header > 1) throw new Error(`the week's dates are cut off by ${header}px`);
    },
  },
  {
    // The day page reaches the week in one tap (W8), and its header still fits with Today showing.
    name: '27-day-week-button',
    // The widest date there is: a Wednesday late in September, this year (so no year is shown).
    goto: `/day/${widestDay()}`,
    wait: 1800,
    viewports: tablet,
    async setup(page) {
      await must(page, '[data-testid="day-week"]', 'the Week button');
      await must(page, '[data-testid="day-today"]', 'the Today button');
      const fit = await page.evaluate(() => {
        const title = document.querySelector('[data-testid="day-title"]');
        const menu = document.querySelector('[data-testid="day-menu"]').getBoundingClientRect();
        return { cut: title.scrollWidth - title.clientWidth, over: menu.right - window.innerWidth };
      });
      if (fit.cut > 1) throw new Error(`the date is cut off by ${fit.cut}px with the Week button in the header`);
      if (fit.over > 0) throw new Error(`the header runs ${fit.over}px off the screen`);
      await page.locator('[data-testid="day-week"]').click();
      await page.waitForSelector('[data-testid="week-page"]', { timeout: 8000 });
      await page.locator('[data-testid="week-to-day"]').click();
      await must(page, '[data-testid="day-week"]', 'the day page, back from the week');
    },
  },
];
