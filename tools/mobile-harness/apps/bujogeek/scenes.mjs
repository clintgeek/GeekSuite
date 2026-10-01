// BuJoGeek — Phase 1 "stupid simple" + the Red Pen identity
// (apps/bujogeek/DOCS/SIMPLE_PLAN.md). Three views and search; everything
// else redirects to Today, and the redirect scenes FAIL (throw) if it does not.

const expectPath = async (page, want) => {
  const path = new URL(page.url()).pathname;
  if (path !== want) throw new Error(`expected to land on ${want}, got ${path}`);
};

// A touch swipe, held mid-gesture: synthetic pointer events with
// pointerType 'touch' (the row ignores mouse drags).
async function holdSwipe(page, rowText, dx) {
  const words = page.getByRole('button', { name: new RegExp(rowText, 'i') }).first();
  if (!(await words.count())) return false;
  const box = await words.boundingBox();
  const y = box.y + box.height / 2;
  const x = box.x + Math.min(160, box.width / 2);
  await words.evaluate((el, { x, y, dx }) => {
    const fire = (type, cx) => el.dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true, pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: cx, clientY: y, button: 0,
    }));
    fire('pointerdown', x);
    for (let i = 1; i <= 6; i += 1) fire('pointermove', x + (dx * i) / 6);
  }, { x, y, dx });
  return true;
}

export const scenes = [
  { name: '01-today', goto: '/today', wait: 1500 },
  {
    // "3 carried over" opened: the late rows in red words.
    name: '02-today-carried-over',
    goto: '/today',
    wait: 1400,
    async setup(page) {
      const line = page.getByRole('button', { name: /carried over/i }).first();
      if (!(await line.count())) return false;
      await line.click();
      await page.waitForTimeout(300);
    },
  },
  {
    // The add box underlining what it understood, as you type it.
    name: '03-add-box-parsing',
    goto: '/today',
    wait: 1400,
    async setup(page) {
      const box = page.getByRole('textbox', { name: /^new task$/i }).first();
      if (!(await box.count())) return false;
      await box.click();
      await page.keyboard.type('call Dana tomorrow 2pm #work !high');
      await page.waitForTimeout(300);
    },
    teardown: async (page) => {
      const box = page.getByRole('textbox', { name: /^new task$/i }).first();
      await box.fill('');
      await page.keyboard.press('Escape');
    },
  },
  {
    // A row tapped open: the inline editor, no dialog.
    name: '04-inline-editor',
    goto: '/today',
    wait: 1400,
    async setup(page) {
      const words = page.getByRole('button', { name: /^write the retro notes/i }).first();
      if (!(await words.count())) return false;
      await words.click();
      await page.waitForTimeout(400);
    },
  },
  { name: '05-upcoming', goto: '/upcoming', wait: 1400 },
  { name: '06-done', goto: '/done', wait: 1400 },
  {
    name: '07-pinned-tag-filter',
    goto: '/today',
    wait: 1400,
    async setup(page) {
      const chip = page.getByRole('button', { name: /^#work$/ }).first();
      if (!(await chip.count())) return false;
      await chip.click();
      await page.waitForTimeout(300);
    },
  },
  {
    name: '08-pin-tags-sheet',
    goto: '/today',
    wait: 1400,
    viewports: ['phone'],
    async setup(page) {
      const pins = page.getByRole('button', { name: /^pins…$/i }).first();
      if (!(await pins.count())) return false;
      await pins.click();
      await page.waitForTimeout(600);
    },
    teardown: (page, h) => h.esc(),
  },
  { name: '09-search', goto: '/search?q=dana', wait: 1400 },
  {
    // Swipe left, held: "Tomorrow" revealed behind the row.
    name: '10-swipe-tomorrow',
    goto: '/today',
    wait: 1400,
    viewports: ['phone'],
    probe: false,
    async setup(page) {
      if (!(await holdSwipe(page, '^review dana', -110))) return false;
      await page.waitForTimeout(150);
    },
  },
  {
    // Long swipe left, held: "Pick a date".
    name: '11-swipe-pick-date',
    goto: '/today',
    wait: 1400,
    viewports: ['phone'],
    probe: false,
    async setup(page) {
      if (!(await holdSwipe(page, '^review dana', -230))) return false;
      await page.waitForTimeout(150);
    },
  },
  {
    // Pick a date, from the keyboard: j to the first row, d.
    name: '12-pick-a-date',
    goto: '/today',
    wait: 1400,
    viewports: ['desktop'],
    async setup(page) {
      await page.keyboard.press('j');
      await page.keyboard.press('d');
      await page.waitForTimeout(600);
      if (!(await page.getByRole('dialog').count())) return false;
    },
    teardown: (page, h) => h.esc(),
  },
  {
    name: '13-help',
    goto: '/today',
    wait: 1200,
    async setup(page) {
      const help = page.getByRole('button', { name: /how to write a task/i }).first();
      if (!(await help.count())) return false;
      await help.click();
      await page.waitForTimeout(600);
    },
    teardown: (page, h) => h.esc(),
  },
  // ── Private tasks (2026-10-01). These THROW when the words leak. ──
  {
    // Desktop: hidden by default — an eye-slash and an ink bar, and the words
    // nowhere on the page (not just invisible: not in the DOM).
    name: '40-private-hidden',
    goto: '/today',
    wait: 1400,
    viewports: ['desktop'],
    async setup(page) {
      const hidden = page.getByRole('button', { name: 'Private task, hidden. Activate to show.' });
      if (!(await hidden.count())) throw new Error('no hidden private row on the desktop Today');
      const html = await page.content();
      if (/write-up for David|Before the 1:1/.test(html)) throw new Error('a private task’s words are in the desktop DOM');
    },
  },
  {
    // Desktop: clicked — the words in place, the eye-slash now a Hide button.
    name: '41-private-revealed',
    goto: '/today',
    wait: 1400,
    viewports: ['desktop'],
    async setup(page) {
      const hidden = page.getByRole('button', { name: 'Private task, hidden. Activate to show.' }).first();
      if (!(await hidden.count())) throw new Error('no hidden private row to reveal');
      await hidden.click();
      await page.waitForTimeout(250);
      if (!(await page.getByText('Finish the write-up for David').count())) throw new Error('reveal did not show the words');
      if (!(await page.getByRole('button', { name: 'Hide private task' }).count())) throw new Error('no Hide button once revealed');
      // Leave the pointer off the row so the shot shows the row, not the hover strip.
      await page.mouse.move(5, 5);
    },
  },
  {
    // Phone: shown, with the small eye-slash mark.
    name: '42-private-phone',
    goto: '/today',
    wait: 1400,
    viewports: ['phone'],
    async setup(page) {
      if (!(await page.getByText('Finish the write-up for David').count())) throw new Error('the phone hid a private task');
      if (!(await page.locator('[data-private-mark]').count())) throw new Error('no private mark on the phone');
      const row = page.locator('[data-private-mark]').first();
      await row.scrollIntoViewIfNeeded();
    },
  },
  {
    // The add box: "(private)" typed, underlined, and the Private box ticked in ink.
    name: '43-add-box-private',
    goto: '/today',
    wait: 1400,
    async setup(page) {
      const box = page.getByRole('textbox', { name: /^new task$/i }).first();
      if (!(await box.count())) return false;
      await box.click();
      await page.keyboard.type('Fire Jane (private) friday #manager');
      await page.waitForTimeout(300);
      const tick = page.getByRole('checkbox', { name: 'Private' }).first();
      if ((await tick.getAttribute('aria-checked')) !== 'true') throw new Error('typing (private) did not tick the box');
    },
    teardown: async (page) => {
      const box = page.getByRole('textbox', { name: /^new task$/i }).first();
      await box.fill('');
      await page.keyboard.press('Escape');
    },
  },
  // Retired screens: their URLs land on Today. These throw if they do not.
  ...['/review', '/plan/weekly', '/plan/monthly', '/plan/backlog', '/habits', '/collections/c1', '/templates', '/tags', '/settings', '/tasks/daily'].map((from) => ({
    name: `20-redirect${from.replace(/\//g, '-')}`,
    viewports: ['phone'],
    probe: false,
    async setup(page, h) {
      await page.goto(h.base + from, { waitUntil: 'networkidle' });
      await page.waitForTimeout(400);
      await expectPath(page, '/today');
      return false; // checked, not shot
    },
  })),
  {
    // The signature, caught mid-cross-off: the square filled red, the strike
    // drawn through the words, the row still in place, the Undo toast up.
    // The page clock is frozen so the row cannot leave before the shot; CSS
    // transitions still run in real time. LAST: a fake clock outlives it.
    // Not axe-probed: axe runs on timers, and the paused clock would hang it.
    // The same rows are probed ticked-off in 06-done and open in 01-today.
    name: '30-crossed-off',
    probe: false,
    async setup(page, h) {
      await page.clock.install();
      await page.goto(h.base + '/today', { waitUntil: 'networkidle' });
      await page.waitForTimeout(1200);
      const box = page.getByRole('checkbox', { name: /^done: review dana/i }).first();
      if (!(await box.count())) return h.log('no checkbox for the PR row') ?? false;
      // An installed clock still ticks; pausing it is what holds the row.
      await page.clock.pauseAt(new Date(Date.now() + 2000));
      await box.click();
      await page.clock.runFor(50);
      await page.waitForTimeout(700);
      const held = await page.locator('[data-crossed="true"]').count();
      if (!held) throw new Error('the ticked row did not stay in place, crossed off');
    },
  },
];

export const waivers = [
];
