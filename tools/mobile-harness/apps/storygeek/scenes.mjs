// StoryGeek — the M4 pilot surfaces (MOBILE_UI_PLAN.md), plus the Candlelit
// Table surfaces (2026-09-27): the canon scroll, the writing state, the
// commands menu, the empty table and the setup page. Scenes are independent:
// each one that needs a sheet/dialog open re-navigates and re-opens it from
// scratch rather than relying on a previous scene's state.
import { json } from '../../lib/net.mjs';
import { CANON, STORY, TURN_RUNNING } from './fixtures.mjs';

// Send one action from the composer. Throws when the composer is missing: a
// skipped scene is silent, and these exist to prove specific UI is on screen.
async function act(page, h, text) {
  const composer = page.getByPlaceholder('What do you do?');
  if (!(await composer.count())) throw new Error('missing: composer');
  await composer.fill(text);
  await page.getByRole('button', { name: /^send$/i }).click();
}

export const scenes = [
  { name: '01-list', goto: '/', wait: 1200 },
  {
    // The FAB is the one create action below `md`.
    name: '02-new-tale-dialog',
    goto: '/',
    wait: 1200,
    viewports: ['phone'],
    async setup(page, h) {
      const fab = page.getByRole('button', { name: /^new tale$/i }).first();
      if (!(await fab.count())) {
        h.log('no "New Tale" FAB at', h.viewport, h.scheme);
        return false;
      }
      await fab.click();
      await h.settle(700);
    },
    // This dialog closes via its own Close button, not Escape.
    async teardown(page, h) {
      await page.getByRole('button', { name: /^close$/i }).first().click();
      await h.settle(500);
    },
  },
  {
    // Delete confirm — window mode even on a phone. The delete icon carries a
    // per-card name ("Delete <title>") since the 2026-09-05 a11y pass, so match
    // it by role instead of by MUI's data-testid.
    name: '03-delete-confirm',
    goto: '/',
    wait: 1200,
    viewports: ['phone'],
    async setup(page, h) {
      const del = page.getByRole('button', { name: /^delete /i }).first();
      if (!(await del.count())) return false;
      await del.click();
      await h.settle(600);
    },
    teardown: (page, h) => h.esc(400),
  },
  { name: '04-play', goto: '/play/s1', wait: 1400 },
  {
    // Left rail as a sheet.
    name: '05-rail-sheet-left',
    goto: '/play/s1',
    wait: 1400,
    async setup(page, h) {
      const left = page.getByRole('button', { name: /scene and character/i }).first();
      if (!(await left.count())) {
        h.log('no left rail toggle at', h.viewport, h.scheme);
        return false;
      }
      await left.click();
      await h.settle(800);
    },
    teardown: (page, h) => h.esc(600),
  },
  {
    // Right rail as a sheet.
    name: '06-rail-sheet-right',
    goto: '/play/s1',
    wait: 1400,
    async setup(page, h) {
      const right = page.getByRole('button', { name: /party and threads/i }).first();
      if (!(await right.count())) return false;
      await right.click();
      await h.settle(800);
    },
    teardown: (page, h) => h.esc(600),
  },
  {
    name: '07-journal',
    goto: '/play/s1',
    wait: 1400,
    viewports: ['phone'],
    async setup(page, h) {
      const journal = page.getByRole('button', { name: /^journal$/i }).first();
      if (!(await journal.count())) return false;
      await journal.click();
      await h.settle(800);
    },
    teardown: (page, h) => h.esc(600),
  },
  {
    // Composer with the keyboard-less focus state, so the pinned row is
    // visible with content in it.
    name: '08-composer',
    goto: '/play/s1',
    wait: 1400,
    viewports: ['phone'],
    async setup(page, h) {
      const composer = page.getByPlaceholder('What do you do?');
      if (!(await composer.count())) return false;
      await composer.click();
      await composer.type('I ask her what the third cart is carrying.');
      await h.settle(400);
    },
    teardown: (page, h) => h.esc(),
  },
  {
    name: '09-bookify',
    goto: '/play/s1',
    wait: 1400,
    async setup(page, h) {
      // Below `xl` Bookify sits in the Export menu (UX review 2026-11-18 #4);
      // at `xl` it is a worded button of its own.
      const exportMenu = page.getByRole('button', { name: /^export the tale$/i }).first();
      if (await exportMenu.count()) {
        await exportMenu.click();
        await h.settle(400);
        const item = page.getByRole('menuitem', { name: /bookify/i }).first();
        if (!(await item.count())) throw new Error('missing: Bookify in the Export menu');
        await item.click();
        await h.settle(1400);
        return;
      }
      const bookify = page.getByRole('button', { name: /^bookify$/i }).first();
      if (!(await bookify.count())) {
        h.log('no Bookify button at', h.viewport, h.scheme);
        return false;
      }
      await bookify.click();
      await h.settle(1400);
    },
    teardown: (page, h) => h.esc(500),
  },
  {
    // The Export menu itself (Bookify + EPUB), phone only.
    name: '09b-export-menu',
    goto: '/play/s1',
    wait: 1400,
    viewports: ['phone'],
    async setup(page, h) {
      const btn = page.getByRole('button', { name: /^export the tale$/i }).first();
      if (!(await btn.count())) throw new Error('missing: Export button');
      await btn.click();
      await h.settle(600);
    },
    teardown: (page, h) => h.esc(400),
  },
  {
    // A /recall answer, rendered as the canon scroll. The page-scoped route
    // beats the context's and is dropped in teardown (and on a throw).
    name: '10-canon-card',
    goto: '/play/s1',
    wait: 1400,
    async setup(page, h) {
      await page.route('**/api/stories/s1/continue', (r) => json(r, CANON));
      try {
        await act(page, h, '/recall what do we know about Mira');
        await page.getByText('From the Record').first().waitFor({ timeout: 5000 });
        await h.settle(900);
      } catch (err) {
        await page.unroute('**/api/stories/s1/continue');
        throw err;
      }
    },
    async teardown(page) {
      await page.unroute('**/api/stories/s1/continue');
    },
  },
  {
    // The writing ("streaming") state: the turn is held open long enough to
    // photograph, then answered so nothing is left pending.
    name: '11-gm-writing',
    goto: '/play/s1',
    wait: 1400,
    async setup(page, h) {
      let release;
      const held = new Promise((resolve) => { release = resolve; });
      h.releaseTurn = release;
      await page.route('**/api/stories/s1/continue', async (r) => {
        await held;
        await json(r, { aiResponse: 'She sets the weight down, very gently, and does not look up.' });
      });
      try {
        await act(page, h, 'I ask her, quietly, who else knows.');
        await page.getByRole('status').filter({ hasText: /writing/i }).first().waitFor({ timeout: 5000 });
        await h.settle(700);
      } catch (err) {
        release();
        await page.unroute('**/api/stories/s1/continue');
        throw err;
      }
    },
    async teardown(page, h) {
      h.releaseTurn?.();
      await h.settle(600);
      await page.unroute('**/api/stories/s1/continue');
    },
  },
  {
    // The composer's commands menu (replaces the 12px slash-command line).
    name: '12-commands',
    goto: '/play/s1',
    wait: 1400,
    viewports: ['phone'],
    async setup(page, h) {
      const btn = page.getByRole('button', { name: /^commands$/i }).first();
      if (!(await btn.count())) throw new Error('missing: Commands button');
      await btn.click();
      await h.settle(600);
    },
    teardown: (page, h) => h.esc(500),
  },
  {
    // A brand-new player: nothing on the table yet.
    name: '13-empty-list',
    goto: null,
    async setup(page, h) {
      await page.route('**/api/stories/user/**', (r) => json(r, []));
      try {
        await page.goto(h.base + '/', { waitUntil: 'networkidle' });
        await page.getByText('No tale on the table yet').first().waitFor({ timeout: 5000 });
        await h.settle(600);
      } catch (err) {
        await page.unroute('**/api/stories/user/**');
        throw err;
      }
    },
    async teardown(page) {
      await page.unroute('**/api/stories/user/**');
    },
  },
  { name: '14-create', goto: '/create', wait: 1200 },
  {
    // Item 5 (2026-11-16): a turn is being written on another device. The
    // story arrives with `turnInProgress`, the status poll keeps answering
    // "still running", and the composer stays shut under the notice.
    name: '15-turn-in-progress',
    goto: null,
    async setup(page, h) {
      const running = { status: 'unknown', turnInProgress: TURN_RUNNING, response: null };
      await page.route('**/api/stories/s1', (r) => json(r, { ...STORY, turnInProgress: TURN_RUNNING }));
      await page.route('**/api/stories/s1/turns/*', (r) => json(r, running));
      try {
        await page.goto(h.base + '/play/s1', { waitUntil: 'networkidle' });
        await page.getByText('A turn is being written elsewhere').first().waitFor({ timeout: 5000 });
        await h.settle(700);
      } catch (err) {
        await page.unroute('**/api/stories/s1');
        await page.unroute('**/api/stories/s1/turns/*');
        throw err;
      }
    },
    async teardown(page) {
      await page.unroute('**/api/stories/s1');
      await page.unroute('**/api/stories/s1/turns/*');
    },
  },
  {
    // S-D5 (2026-11-16): Recently deleted — Restore and Delete forever per tale.
    name: '16-recently-deleted',
    goto: '/deleted',
    wait: 1200,
    async setup(page) {
      await page.getByText('The Lantern Fair').first().waitFor({ timeout: 5000 });
    },
  },
  {
    // The Delete forever confirm on that page.
    name: '17-delete-forever-confirm',
    goto: '/deleted',
    wait: 1200,
    viewports: ['phone'],
    async setup(page, h) {
      const btn = page.getByRole('button', { name: /^delete the lantern fair forever$/i }).first();
      if (!(await btn.count())) throw new Error('missing: Delete forever button');
      await btn.click();
      await h.settle(600);
    },
    teardown: (page, h) => h.esc(400),
  },
];

// Known, ticketed violations. Each one should die when the app is fixed —
// an empty list is the goal, not a permanent parking lot.
export const waivers = [];
