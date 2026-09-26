// GameGeek — the G0/G1 surfaces (DOCS/GameGeekPlan.md §5.8). Deep links are
// preferred over clicks wherever the app has one (/game/:id, /add, /settings);
// every scene navigates for itself.

export const scenes = [
  { name: '01-library', goto: '/', wait: 1500 },
  {
    // The list layout: 44px cover + title + a fixed star column, the likeliest
    // place for a row to push a 390px phone sideways. The layout is remembered
    // in localStorage, so the teardown switches back to covers.
    name: '01b-library-list',
    goto: '/',
    async setup(page, h) {
      const toggle = page.getByRole('button', { name: 'Show as a list' });
      if (!(await toggle.count())) return false;
      await toggle.click();
      await h.settle(600);
    },
    async teardown(page, h) {
      const back = page.getByRole('button', { name: 'Show as covers' });
      if (await back.count()) await back.click();
      await h.settle(200);
    },
  },
  {
    name: '02-drawer',
    goto: '/',
    viewports: ['phone'],
    async setup(page, h) {
      const menu = page.locator('[data-geek-topbar="menu"]');
      if (!(await menu.count())) return false;
      await menu.click();
      await h.settle(600);
    },
    teardown: (page, h) => h.esc(),
  },
  {
    // Deep link: the library renders underneath, the sheet on top.
    name: '03-detail',
    goto: '/game/g1',
    wait: 1600,
    teardown: (page, h) => h.esc(),
  },
  {
    name: '04-add-search',
    goto: '/add',
    wait: 1200,
    async setup(page, h) {
      const field = page.getByLabel('Game title');
      if (!(await field.count())) return false;
      await field.fill('hades');
      await h.settle(1200);
    },
    teardown: (page, h) => h.esc(),
  },
  {
    name: '05-log-session',
    goto: '/game/g1',
    wait: 1500,
    async setup(page, h) {
      const log = page.getByTestId('detail-actions').getByRole('button', { name: 'Log session' });
      if (!(await log.count())) return false;
      await log.click();
      await h.settle(800);
    },
    teardown: async (page, h) => {
      await h.esc();
      await h.esc();
    },
  },
  {
    // Settings: the Playnite card now also carries the Nextcloud auto-import
    // line (apps/gamegeek/DOCS/PLAYNITE_IMPORT.md, folder import) above the
    // manual upload, which is still the fallback either way.
    name: '06-settings',
    goto: '/settings',
    wait: 1400,
    async setup(page, h) {
      await page.getByTestId('playnite-auto-import').waitFor({ timeout: 3000 }).catch(() => {});
      await h.settle(200);
    },
  },
  {
    name: '07-account-menu',
    goto: '/',
    async setup(page, h) {
      const acct = page.locator('[data-geek-topbar="account"]');
      if (!(await acct.count())) return false;
      await acct.click();
      await h.settle(500);
    },
    teardown: (page, h) => h.esc(),
  },
  {
    // The Playnite dry run: it fires as soon as a file is picked, no button
    // to click. A tiny in-memory JSON stands in for a real export — the stub
    // route answers regardless of what's actually in it.
    name: '11-playnite-preview',
    goto: '/settings#playnite',
    wait: 1400,
    async setup(page, h) {
      const input = page.getByTestId('playnite-file-input');
      if (!(await input.count())) return false;
      await input.setInputFiles({
        name: 'playnite-library.json',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify({ schemaVersion: 1, generatedAtUtc: '2026-09-25T16:21:03Z', games: [] })),
      });
      await h.settle(900);
      await page.getByTestId('playnite-preview').scrollIntoViewIfNeeded();
      await h.settle(300);
    },
  },
  {
    // Metadata enrichment (DOCS/METADATA_ENRICHMENT.md): the fixture status
    // is fixed at running=true with IGDB/RAWG off, so this is always the
    // "worker is going, keys are missing" state — counts, provider chips,
    // the no-blame key line and live progress.
    name: '12-metadata-card',
    goto: '/settings#metadata',
    wait: 1400,
  },
  {
    // Detail → ⋯ More → "Find metadata…": every provider's candidates for
    // Hades, with the Steam one marked as the best match.
    name: '13-find-metadata',
    goto: '/game/g1',
    wait: 1600,
    async setup(page, h) {
      const more = page.getByRole('button', { name: 'More actions' });
      if (!(await more.count())) return false;
      await more.click();
      await h.settle(500);
      const find = page.getByRole('button', { name: /Find metadata/ });
      if (!(await find.count())) return false;
      await find.click();
      await h.settle(900);
    },
    teardown: async (page, h) => {
      await h.esc();
      await h.esc();
    },
  },
  {
    // The desktop filter panel (DOCS/TAGS_AND_FILTERS.md §B2) with a few
    // filters on: counts beside every option, the selected ones checked, the
    // year histogram under its range, the chips row above the grid.
    name: '14-filters-desktop',
    goto: '/?platform=pc&tag=Difficult&year=2015-2022',
    viewports: ['desktop'],
    wait: 1600,
  },
  {
    // Further down the same panel: Tags, grouped by the vocabulary, with the
    // search box and "Show all".
    name: '14b-filters-tags',
    goto: '/?platform=pc&tag=Difficult&year=2015-2022',
    viewports: ['desktop'],
    wait: 1600,
    async setup(page, h) {
      const tags = page.locator('[data-facet="tags"]');
      if (!(await tags.count())) return false;
      await tags.evaluate((el) => el.scrollIntoView({ block: 'start' }));
      await h.settle(400);
    },
  },
  {
    // The bottom of the panel: Release year's range over its histogram,
    // Format, Favorites, and the quiet Metadata cleanup section.
    name: '14c-filters-year',
    goto: '/?platform=pc&tag=Difficult&year=2015-2022',
    viewports: ['desktop'],
    wait: 1600,
    async setup(page, h) {
      const year = page.locator('[data-facet="year"]');
      if (!(await year.count())) return false;
      await year.evaluate((el) => el.scrollIntoView({ block: 'start' }));
      await h.settle(400);
    },
  },
  {
    // The phone's full-height filters sheet with its "Show N games" footer.
    name: '15-filters-sheet',
    goto: '/?tag=Cozy',
    viewports: ['phone'],
    wait: 1400,
    async setup(page, h) {
      const btn = page.getByTestId('filters-button');
      if (!(await btn.count())) return false;
      await btn.click();
      await h.settle(800);
    },
    teardown: (page, h) => h.esc(),
  },
  {
    // Five active filters: on a phone the chips scroll inside their own strip
    // (the page must not scroll sideways); at md+ they wrap.
    name: '16-active-chips',
    goto: '/?shelf=backlog&shelf=finished&genre=Puzzle&year=2010-&format=digital',
    wait: 1500,
  },
  {
    name: '17-sort-menu',
    goto: '/?sort=timeToBeat',
    wait: 1200,
    async setup(page, h) {
      const sort = page.getByRole('button', { name: /^Sort:/ });
      if (!(await sort.count())) return false;
      await sort.first().click();
      await h.settle(500);
    },
    teardown: (page, h) => h.esc(),
  },
  {
    // Detail → Details: genres and tags are links into the filtered library;
    // enrichment's autoTags are the dashed, lighter ones.
    name: '18-detail-tags',
    goto: '/game/g1',
    wait: 1600,
    async setup(page, h) {
      const details = page.locator('#details-heading');
      if (!(await details.count())) return false;
      await details.evaluate((el) => el.scrollIntoView({ block: 'start' }));
      await h.settle(400);
    },
    teardown: (page, h) => h.esc(),
  },
  {
    // The scroll-to-top regression (2026-09-25): scroll the library, edit a
    // game in the detail sheet, close it — still where you were; go to
    // Settings and back — restored. The scene throws (an ERROR in the run)
    // if either lands anywhere else; the screenshot is the restored library.
    name: '19-scroll-restore',
    goto: '/',
    viewports: ['desktop'],
    wait: 1500,
    async setup(page, h) {
      const main = page.locator('main');
      const top = () => main.evaluate((el) => el.scrollTop);
      await main.evaluate((el) => el.scrollTo(0, 700));
      await h.settle(400);
      if ((await top()) < 600) return false; // not tall enough to prove anything here

      // Playwright scrolls a target into view before clicking it, so the
      // baseline is taken once the sheet is open over the library.
      await page.getByRole('button', { name: 'Portal 2' }).first().click();
      await h.settle(900);
      const before = await top();
      const fav = page.getByLabel('Favourite');
      if (!(await fav.count())) throw new Error('no Favourite control to edit');
      await fav.first().click();
      await h.settle(600);
      await h.esc(700);
      const afterEdit = await top();
      if (Math.abs(afterEdit - before) > 4) throw new Error(`edit moved the library: ${before} → ${afterEdit}`);

      await page.locator('[data-geek-sidebar="footer"] a[href="/settings"], a[href="/settings"]').first().click();
      await h.settle(900);
      await page.locator('[data-geek-nav-item="library"]').first().click();
      await h.settle(1200);
      const back = await top();
      if (Math.abs(back - before) > 4) throw new Error(`scroll not restored: ${before} → ${back}`);
    },
  },
  {
    // The taste model (DOCS/TASTE_MODEL.md), at the moment Chef enters data:
    // the shelf picker's second line, one per row.
    name: '20-shelf-sheet',
    goto: '/game/g1',
    wait: 1500,
    async setup(page, h) {
      const status = page.getByTestId('detail-actions').getByRole('button', { name: /^Status:/ });
      if (!(await status.count())) return false;
      await status.click();
      await h.settle(500);
    },
    teardown: (page, h) => h.esc(),
  },
  {
    // Playing follows Playnite's isInstalled (apps/gamegeek/DOCS/PLAYNITE_IMPORT.md
    // §Installed → Playing): Vampire Survivors is on Playing, both copies are
    // Playnite's and neither is installed any more — the calm banner asks how
    // it ended, four answers with their taste-model meanings.
    name: '21-install-decision',
    goto: '/game/g16',
    wait: 1600,
    async setup(page, h) {
      const banner = page.getByTestId('install-decision');
      if (!(await banner.count())) throw new Error('the "not installed anymore" banner did not render for a flagged game');
      await h.settle(300);
    },
    teardown: (page, h) => h.esc(),
  },
  {
    // Arcade Sticker (DOCS/GameGeekPlan.md §5.1): the "nothing matches"
    // empty state — the tilted sticker frame and its attract-mode tag.
    name: '22-no-match',
    goto: '/?q=zzzz-no-such-game',
    wait: 1500,
    async setup(page, h) {
      await page.getByTestId('library-empty').waitFor({ timeout: 3000 }).catch(() => {});
      await h.settle(200);
    },
  },
  {
    // Arcade Sticker: a card under a real pointer lifts, leans and swaps its
    // ink shadow for its colour. Desktop only — hover is (hover: hover) only.
    name: '23-card-hover',
    goto: '/',
    viewports: ['desktop'],
    wait: 1500,
    async setup(page, h) {
      const card = page.getByTestId('game-card').nth(1);
      if (!(await card.count())) return false;
      await card.hover({ position: { x: 40, y: 60 } });
      await h.settle(400);
    },
  },
];

// Known, ticketed violations. The list starts empty and stays that way.
export const waivers = [];
