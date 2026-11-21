// GeekDay — the pen-first daily page (DOCS/GEEKDAY_SPEC.md, req 19).
//
// The designed size is the portrait tablet, so that is where the scenes that
// prove the page run. `01-day` runs everywhere: other sizes are out of scope
// for design, but they must not break. Every scene THROWS when the thing it
// is named for is not on screen.

import { scenes as weekScenes } from './scenes.week.mjs';
import { scenes as inkScenes } from './scenes.ink.mjs';

const must = async (page, selector, what) => {
  const node = page.locator(selector).first();
  if (!(await node.count()) || !(await node.isVisible())) throw new Error(`missing: ${what} (${selector})`);
  return node;
};
const mustNot = async (page, selector, what) => {
  const node = page.locator(selector).first();
  if ((await node.count()) && (await node.isVisible())) throw new Error(`should not be on screen: ${what} (${selector})`);
};

const localKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

/** The ink canvas, once tldraw has mounted inside it. */
async function inkBox(page) {
  const canvas = await must(page, '[data-testid="ink-canvas"]', 'the ink canvas');
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

/** Two words' worth of scribble in the upper half of the page, clear of the toolbar. */
async function writeSomething(page) {
  const box = await inkBox(page);
  await stroke(page, box, [[0.22, 0.2], [0.26, 0.15], [0.3, 0.22], [0.34, 0.15], [0.38, 0.22], [0.42, 0.16]]);
  await stroke(page, box, [[0.48, 0.2], [0.52, 0.15], [0.56, 0.22], [0.6, 0.16], [0.64, 0.21]]);
  return box;
}

/** Circle what `writeSomething` wrote. */
async function circleIt(page, box) {
  await page.locator('[data-testid="ink-tool-lasso"]').click();
  await stroke(page, box, [[0.14, 0.18], [0.2, 0.08], [0.45, 0.06], [0.7, 0.09], [0.74, 0.19], [0.68, 0.29], [0.42, 0.31], [0.19, 0.28], [0.14, 0.18]]);
}

const tablet = ['tablet-portrait'];

const dayScenes = [
  {
    // The day page with tasks: overdue, scheduled, to do, and a blank ink page.
    name: '01-day',
    goto: '/',
    wait: 1800,
    async setup(page) {
      await must(page, '[data-testid="day-title"]', 'the date');
      await must(page, '[data-testid="day-relative"]', 'the Today marker');
      const tones = await page.locator('[data-testid="task-row"]').evaluateAll((rows) => rows.map((r) => r.dataset.taskTone));
      for (const tone of ['overdue', 'timed', 'untimed']) {
        if (!tones.includes(tone)) throw new Error(`missing: a ${tone} task row (have ${tones.join(', ') || 'none'})`);
      }
      await must(page, '[data-testid="add-task-input"]', 'the add box');
      await must(page, '[data-testid="ink-pane"]', 'the ink page');
    },
  },
  {
    // Side by side is the point of the page: the agenda and the ink share a row on the tablet.
    name: '01b-day-side-by-side',
    goto: '/',
    wait: 1800,
    viewports: tablet,
    async setup(page) {
      const agenda = await (await must(page, '[data-testid="agenda"]', 'the agenda')).boundingBox();
      const ink = await (await must(page, '[data-testid="ink-pane"]', 'the ink page')).boundingBox();
      if (!(agenda.x + agenda.width <= ink.x + 1)) throw new Error('the agenda and the ink page are not side by side');
      if (ink.width < agenda.width) throw new Error(`the ink page (${Math.round(ink.width)}px) is narrower than the agenda (${Math.round(agenda.width)}px)`);
      await inkBox(page);
    },
  },
  {
    name: '02-day-empty',
    goto: '/?__fixture=empty',
    wait: 1800,
    viewports: tablet,
    async setup(page) {
      await must(page, '[data-testid="agenda-empty"]', 'the empty-day message');
      await mustNot(page, '[data-testid="task-row"]', 'a task row');
    },
  },
  {
    // A failure must never look like an empty day.
    name: '03-day-load-failed',
    goto: '/?__fixture=error',
    wait: 2200,
    viewports: tablet,
    async setup(page) {
      await must(page, '[data-testid="agenda-error"]', 'the tasks load error');
      await must(page, '[data-testid="ink-load-error"]', 'the page load error');
      await mustNot(page, '[data-testid="agenda-empty"]', 'the empty-day message');
      await mustNot(page, '[data-testid="agenda-count"]', 'the "all clear" count');
    },
  },
  {
    // Typing shows how the text was read before it is added (req 3).
    name: '04-add-hint',
    goto: '/',
    wait: 1800,
    viewports: tablet,
    async setup(page) {
      await page.locator('[data-testid="add-task-input"]').fill('call vet fri 2pm');
      await page.waitForTimeout(200);
      const hint = await page.locator('[data-testid="add-task-hint"]').innerText();
      if (!/Fri/.test(hint) || !/2:00/.test(hint)) throw new Error(`the add hint did not read a Friday at 2:00: "${hint}"`);
    },
  },
  {
    name: '05-ink-written',
    goto: '/',
    wait: 1800,
    viewports: tablet,
    async setup(page) {
      await writeSomething(page);
      await page.waitForSelector('[data-testid="ink-save-status"][data-save="saved"]', { timeout: 8000 });
    },
  },
  {
    // The confirm-task step (reqs 9, 10): circled ink, read, shown for correction.
    name: '06-confirm-task',
    goto: '/',
    wait: 1800,
    viewports: tablet,
    async setup(page) {
      const box = await writeSomething(page);
      await circleIt(page, box);
      await page.waitForSelector('[data-testid="confirm-task-text"]', { timeout: 15000 });
      const text = await page.locator('[data-testid="confirm-task-text"]').inputValue();
      if (text !== 'call vet fri 2pm') throw new Error(`the reading was not put in the field: "${text}"`);
      const summary = await page.locator('[data-testid="confirm-task-summary"]').innerText();
      if (!/Fri/.test(summary) || !/2:00/.test(summary)) throw new Error(`the summary did not show a Friday at 2:00: "${summary}"`);
      await must(page, '[data-testid="confirm-task-create"]', 'the Create task button');
    },
    teardown: (page, h) => h.esc(),
  },
  {
    // A failed reading says so and offers no way to create (req 11).
    name: '07-confirm-task-failed',
    goto: '/?__fixture=noread',
    wait: 1800,
    viewports: tablet,
    async setup(page) {
      const box = await writeSomething(page);
      await circleIt(page, box);
      await page.waitForSelector('[data-testid="confirm-failed"]', { timeout: 15000 });
      await mustNot(page, '[data-testid="confirm-task-create"]', 'the Create task button');
      await must(page, '[data-testid="confirm-task-retry"]', 'Try again');
    },
    teardown: (page, h) => h.esc(),
  },
  {
    // A failed save is shown, and the ink stays on the page (req 8).
    name: '08-ink-save-failed',
    goto: '/?__fixture=nosave',
    wait: 1800,
    viewports: tablet,
    async setup(page) {
      await writeSomething(page);
      await page.waitForSelector('[data-testid="ink-save-problem"][data-save="error"]', { timeout: 8000 });
      await must(page, '[data-testid="ink-save-retry"]', 'Try now');
    },
  },
  {
    // Another day: its own date, a way back to today, no overdue group.
    name: '09-another-day',
    goto: `/day/${localKey(new Date(Date.now() + 3 * 86400000))}`,
    wait: 1800,
    viewports: tablet,
    async setup(page) {
      await must(page, '[data-testid="day-today"]', 'the Today button');
      const tones = await page.locator('[data-testid="task-row"]').evaluateAll((rows) => rows.map((r) => r.dataset.taskTone));
      if (tones.includes('overdue')) throw new Error('overdue tasks are shown on a day that is not today');
    },
  },
  {
    // Docked mode (req 14): two idle minutes, then the clock, the next task and the weather.
    name: '10-docked',
    goto: '/',
    wait: 1500,
    viewports: tablet,
    async setup(page) {
      // Take over the clock, touch the page so the idle count restarts on it, then let two minutes pass.
      await page.clock.install();
      await page.mouse.move(200, 400);
      await page.mouse.move(220, 420);
      await page.clock.fastForward(119000);
      await mustNot(page, '[data-testid="docked"]', 'the docked view before two minutes');
      await page.clock.fastForward(2000);
      await must(page, '[data-testid="docked"]', 'the docked view');
      await must(page, '[data-testid="docked-clock"]', 'the clock');
      await page.waitForFunction(() => document.querySelector('[data-testid="docked-weather"]')?.textContent.includes('°'), null, { timeout: 8000 });
      const next = await page.locator('[data-testid="docked-next"]').innerText();
      if (!next.trim()) throw new Error('the docked view shows no next task');
    },
  },
];

export const scenes = [...dayScenes, ...weekScenes, ...inkScenes];

export const waivers = [];
