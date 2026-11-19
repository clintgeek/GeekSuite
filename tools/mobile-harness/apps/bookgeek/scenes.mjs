// BookGeek — the M1 pilot surfaces (MOBILE_UI_PLAN.md §3), the Night 2
// AI library-assistant scenes (R117/R126), and the faceted library of
// Phase C2 (DOCS/BOOKGEEK_CLEANUP_PLAN.md: @geeksuite/collection, 06b–06j),
// the tag vocabulary (DOCS/TAGS.md: 03b, 06k–06m), and Recently deleted
// (S-D5: 06n–06p).
import { body, json, graphqlRoute } from '../../lib/net.mjs';
import { sampleEpub } from './epub.mjs';
import { OPS, WHAT_NEXT_PICKS, DRAFT_BOOK_METADATA } from './fixtures.mjs';

// The covers/list switch: its own button at md+, a row in the ⋯ menu on a
// phone (the header row has no room for it there).
async function chooseLayout(page, h, name) {
  const button = page.getByRole('button', { name });
  if (await button.count()) {
    await button.first().click();
  } else {
    const more = page.getByRole('button', { name: 'Library actions' });
    if (!(await more.count())) return false;
    await more.click();
    await h.settle(300);
    const item = page.getByRole('menuitem', { name });
    if (!(await item.count())) return false;
    await item.click();
  }
  await h.settle(600);
  return true;
}

// The in-app reader (review 2026-11-18): "Lock In" opens the hand-built
// EPUB from ./epub.mjs (three chapters and a nav document, so Contents and
// the percentage are real epub.js output, not mocks).
async function openReader(page, h) {
  await page.route('**/api/books/*/download/epub', (r) => body(r, { contentType: 'application/epub+zip', body: sampleEpub() }));
  const card = page.getByText('Lock In', { exact: true }).first();
  if (!(await card.count())) return false;
  await card.click();
  await h.settle(1000);
  await page.getByRole('button', { name: 'Read', exact: true }).click();
  const reader = page.getByTestId('book-reader');
  await reader.waitFor({ timeout: 8000 });
  await page.frameLocator('[data-testid="book-reader"] iframe').locator('p').first().waitFor({ timeout: 10000 });
  // Locations are generated after the first page: wait for the book's %.
  await page.getByTestId('reader-position').filter({ hasText: '%' }).waitFor({ timeout: 10000 });
  return true;
}

// The chrome hides itself 2.5s after you stop using it; keyboard focus inside
// it holds it up. Tab into it so the shot and the probe see it.
async function holdReaderChrome(page) {
  for (let i = 0; i < 12; i += 1) {
    await page.keyboard.press('Tab');
    const inChrome = await page.evaluate(() => Boolean(document.activeElement?.closest('[data-reader-chrome]')));
    if (inChrome) return true;
  }
  throw new Error('Tab never reached the reader controls');
}

const bootstrapWithLibraryAssistant = (r) => json(r, {
  identity: { username: 'chef', email: 'chef@example.com' },
  profile: { displayName: 'Chef Crocker' },
  preferences: {},
  appPreferences: { bookgeek: { libraryAssistant: true } },
});

export const scenes = [
  { name: '01-library', goto: '/', wait: 1500 },
  {
    // The list layout. Its star column is a fixed 132px on a phone, beside a
    // 40px cover and a title — the likeliest place in BookGeek for a row to
    // push the page into a sideways scroll, so it gets its own scene. The
    // layout is remembered in localStorage, so the teardown switches back to
    // covers or every later scene would inherit the list.
    name: '01b-library-list',
    goto: '/',
    async setup(page, h) {
      if (!(await chooseLayout(page, h, 'Show as a list'))) return false;
    },
    async teardown(page, h) {
      await chooseLayout(page, h, 'Show as covers');
      await h.settle(200);
    },
  },
  {
    name: '02-drawer',
    goto: '/',
    async setup(page, h) {
      const menu = page.locator('[data-geek-topbar="menu"]');
      if (!(await menu.count())) return false;
      await menu.click();
      await h.settle(600);
    },
    teardown: (page, h) => h.esc(),
  },
  {
    name: '03-detail',
    goto: '/',
    async setup(page, h) {
      const card = page.getByText('Lock In', { exact: true }).first();
      if (!(await card.count())) return false;
      await card.click();
      await h.settle(1000);
    },
    teardown: (page, h) => h.esc(),
  },
  {
    // A book can be CLOSED (2026-11-15). The sheet is a route; when it also
    // took its own Back-button history entry, closing only popped that entry
    // and the book stayed open, by the X, by Escape and by Back alike. Opens
    // a book and closes it each of the three ways, in the real browser
    // history (the unit tests run on a memory router and could not see this).
    name: '03e-detail-closes',
    goto: '/',
    async setup(page, h) {
      const sheetOpen = () => page.getByRole('button', { name: 'More actions' }).count();
      const open = async () => {
        await page.getByText('Lock In', { exact: true }).first().click();
        await h.settle(900);
        if (!(await sheetOpen())) throw new Error('the book did not open');
        if (!/\/book\//.test(new URL(page.url()).pathname)) throw new Error(`open book, but the URL is ${page.url()}`);
      };
      const closed = async (how) => {
        await h.settle(900);
        if (await sheetOpen()) throw new Error(`the book is still open after ${how}`);
        if (new URL(page.url()).pathname !== '/') throw new Error(`closed by ${how}, but the URL is ${page.url()}`);
      };
      await open();
      await page.locator('[data-geek-sheet="close"]:visible').last().click();
      await closed('the close button');
      await open();
      await page.keyboard.press('Escape');
      await closed('Escape');
      await open();
      await page.goBack();
      await closed('Back');
    },
  },
  {
    // A manga volume (2026-11-15): the card wears "MANGA · VOL. 3", and the
    // download sheet offers the CBZ as it is — no EPUB/AZW3/MOBI rows, since
    // there is nothing to convert a comic archive into.
    name: '03d-detail-comic-download',
    goto: '/',
    async setup(page, h) {
      const line = page.getByTestId('book-card-comic').first();
      if (!(await line.count())) throw new Error('no comic line on any card');
      const text = (await line.innerText()).trim().toUpperCase();
      if (text !== 'MANGA · VOL. 3') throw new Error(`the comic line reads "${text}"`);
      await page.getByText('Delicious in Dungeon', { exact: true }).first().click();
      await h.settle(1000);
      // The book page leads with Download of the stored file; a comic has no
      // Read and no To Kindle.
      if (!(await page.getByRole('button', { name: 'Download CBZ', exact: true }).count())) throw new Error('a comic has no "Download CBZ" button');
      for (const name of ['Read', 'To Kindle', 'Send']) {
        if (await page.getByRole('button', { name, exact: true }).count()) throw new Error(`a comic's page still offers ${name}`);
      }
      await page.route('**/api/books/*/download/*', (r) => r.fulfill({
        status: 200,
        headers: { 'content-type': 'application/octet-stream', 'content-disposition': 'attachment; filename="delicious-in-dungeon-03.cbz"' },
        body: 'CBZ',
      }));
      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 8000 }).catch(() => null),
        page.getByRole('button', { name: 'Download CBZ', exact: true }).click(),
      ]);
      if (!download) throw new Error('pressing Download CBZ started no download');
      if (!/\/api\/books\/b9\/download\/cbz$/.test(download.url())) throw new Error(`the download went to ${download.url()}`);
      await download.cancel().catch(() => {});
      await h.settle(300);
      await page.getByRole('button', { name: 'More actions' }).click();
      await h.settle(500);
      await page.getByText('Download / Convert', { exact: true }).first().click();
      await h.settle(600);
      // Scoped to the sheet: the desktop filter panel behind it lists EPUB too.
      const sheet = page.getByRole('dialog').filter({ hasText: 'Comic files download as they are.' });
      await sheet.waitFor({ timeout: 5000 });
      if (!(await sheet.getByText('CBZ', { exact: true }).count())) throw new Error('the download sheet has no CBZ row');
      for (const format of ['EPUB', 'AZW3', 'MOBI']) {
        if (await sheet.getByText(format, { exact: true }).count()) throw new Error(`a comic's download sheet offers ${format}`);
      }
    },
    teardown: async (page, h) => { await h.esc(); await h.esc(); },
  },
  {
    // The book page's tags (DOCS/TAGS.md §5): canonical and My tags as
    // chips, the raw import tags opened under "Source tags".
    name: '03b-detail-source-tags',
    goto: '/',
    async setup(page, h) {
      const card = page.getByText('The Sound of Gravel', { exact: true }).first();
      if (!(await card.count())) return false;
      await card.click();
      await h.settle(1000);
      const toggle = page.getByRole('button', { name: /^Source tags/ });
      if (!(await toggle.count())) return false;
      await toggle.first().click();
      await h.settle(400);
      await toggle.first().evaluate((el) => el.scrollIntoView({ block: 'center' }));
      await h.settle(400);
    },
    teardown: (page, h) => h.esc(),
  },
  {
    // "Last read" (dateFinished, 2026-10-08) open for editing on a book that
    // has none: the date input, Save and Cancel (Clear only shows with a
    // date), all 44px, spanning both Details columns.
    name: '03c-detail-last-read',
    goto: '/',
    async setup(page, h) {
      const card = page.getByText('Lock In', { exact: true }).first();
      if (!(await card.count())) return false;
      await card.click();
      await h.settle(1000);
      const set = page.getByRole('button', { name: 'Set last read date' });
      if (!(await set.count())) return false;
      await set.first().click();
      await h.settle(600);
      await page.getByLabel('Last read date').first().evaluate((el) => el.scrollIntoView({ block: 'center' }));
      await h.settle(400);
    },
    teardown: (page, h) => h.esc(),
  },
  {
    name: '04-add',
    goto: '/',
    async setup(page, h) {
      const add = page.getByRole('button', { name: /add book/i }).first();
      if (!(await add.count())) return false;
      await add.click();
      await h.settle(700);
      // The Manga / Comic choice (2026-11-15), shot with Manga picked.
      const manga = page.getByRole('button', { name: 'Manga', exact: true });
      if (!(await manga.count())) throw new Error('Add book has no Manga choice');
      if (!(await page.getByRole('button', { name: 'Comic', exact: true }).count())) throw new Error('Add book has no Comic choice');
      await manga.click();
      await h.settle(300);
      if ((await manga.getAttribute('aria-pressed')) !== 'true') throw new Error('Manga did not stay picked');
    },
    teardown: (page, h) => h.esc(),
  },
  {
    name: '05-account-menu',
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
    name: '06-settings',
    goto: '/',
    async setup(page, h) {
      const acct = page.locator('[data-geek-topbar="account"]');
      if (!(await acct.count())) return false;
      await acct.click();
      await h.settle(400);
      const settings = page.locator('[data-geek-topbar-menu="settings"]');
      if (!(await settings.count())) return false;
      await settings.click();
      await h.settle(900);
    },
  },
  {
    // Settings → Library maintenance → Scan comics folder (2026-11-16): the
    // action is there because the server says the folder is on, and the
    // scan's counts come back as a toast.
    name: '06m-comics-scan',
    goto: '/settings',
    async setup(page, h) {
      const scan = page.getByRole('button', { name: 'Scan comics folder' });
      await scan.waitFor({ timeout: 8000 }).catch(() => {});
      if (!(await scan.count())) throw new Error('Settings does not offer "Scan comics folder" with the feature on');
      await scan.scrollIntoViewIfNeeded();
      await scan.click();
      await page.getByText('Comics folder: 2 added, 1 updated, 14 unchanged.').waitFor({ timeout: 5000 });
      await h.settle(400);
    },
  },
  // ── Recently deleted (S-D5, 2026-11-15) ──────────────────────────────
  {
    // Settings → Recently deleted: two books in the trash, each with its
    // purge date, one marked "files too"; Restore and Delete forever per row.
    name: '06n-recently-deleted',
    goto: '/settings',
    async setup(page, h) {
      const list = page.getByRole('list', { name: 'Recently deleted books' });
      await list.waitFor({ timeout: 8000 }).catch(() => {});
      if (!(await list.count())) return h.log('no Recently deleted list') ?? false;
      await list.scrollIntoViewIfNeeded();
      await h.settle(600);
    },
  },
  {
    // Restore: the row leaves the list and a toast says it is back.
    name: '06o-recently-deleted-restore',
    goto: '/settings',
    async setup(page, h) {
      const restore = page.getByRole('button', { name: /^Restore “Dune”$/ });
      await restore.waitFor({ timeout: 8000 }).catch(() => {});
      if (!(await restore.count())) return h.log('no Restore button') ?? false;
      await restore.scrollIntoViewIfNeeded();
      await restore.click();
      await page.getByText('Restored “Dune”').waitFor({ timeout: 5000 }).catch(() => {});
      if (await page.getByRole('button', { name: /^Restore “Dune”$/ }).count()) throw new Error('the restored book is still listed');
      await h.settle(500);
    },
  },
  {
    // Delete forever asks first, and says what goes with it.
    name: '06p-recently-deleted-forever',
    goto: '/settings',
    async setup(page, h) {
      const forever = page.getByRole('button', { name: /^Delete “The Hitchhiker’s Guide.*” forever$/ });
      await forever.waitFor({ timeout: 8000 }).catch(() => {});
      if (!(await forever.count())) return h.log('no Delete forever button') ?? false;
      await forever.scrollIntoViewIfNeeded();
      await forever.click();
      const dialog = page.getByRole('dialog', { name: 'Delete forever?' });
      await dialog.waitFor({ timeout: 5000 });
      if (!(await dialog.getByText(/its files/).count())) throw new Error('the confirm does not say the files go too');
      await h.settle(500);
    },
    teardown: (page, h) => h.esc(),
  },
  // ── The faceted library (Phase C2) ────────────────────────────────────
  {
    // The desktop filter panel beside the grid: live counts beside every
    // option (each facet under every filter but its own), the chosen ones
    // checked, the chips and the sort above the list.
    name: '06b-filters-desktop',
    goto: '/?shelf=read&tag=Memoir&read=2022-2024',
    viewports: ['desktop'],
    wait: 1600,
  },
  {
    // Further down the same panel: Format, the Copy switches, Year read's
    // range over its histogram, and My rating.
    name: '06c-filters-desktop-lower',
    goto: '/?shelf=read&tag=Memoir&read=2022-2024',
    viewports: ['desktop'],
    wait: 1600,
    async setup(page, h) {
      const section = page.locator('[data-facet="format"]');
      if (!(await section.count())) return false;
      await section.evaluate((el) => el.scrollIntoView({ block: 'start' }));
      await h.settle(400);
    },
  },
  {
    // The phone's full-height Filters sheet, with its "Show N books" footer.
    name: '06d-filters-sheet',
    goto: '/?tag=Sci-fi',
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
  // ── Tags: the vocabulary's groups (DOCS/TAGS.md) ───────────────────────
  {
    // The desktop panel's Tags section: My tags, Genre, Nonfiction,
    // Audience, Flavour, then Unsorted folded at the end; one tag chosen.
    name: '06k-tags-panel',
    goto: '/?tag=Cults',
    viewports: ['desktop'],
    wait: 1600,
    async setup(page, h) {
      const section = page.locator('[data-facet="tags"]').first();
      if (!(await section.count())) return false;
      await section.evaluate((el) => el.scrollIntoView({ block: 'start' }));
      await h.settle(400);
    },
  },
  {
    // The same section in the phone's Filters sheet.
    name: '06l-tags-sheet',
    goto: '/?tag=Cults',
    viewports: ['phone'],
    wait: 1400,
    async setup(page, h) {
      const btn = page.getByTestId('filters-button');
      if (!(await btn.count())) return false;
      await btn.click();
      await h.settle(800);
      const section = page.locator('[role="dialog"] [data-facet="tags"]').first();
      if (!(await section.count())) return false;
      await section.evaluate((el) => el.scrollIntoView({ block: 'start' }));
      await h.settle(400);
    },
    teardown: (page, h) => h.esc(),
  },
  {
    // Unsorted opened: the raw tags the vocabulary neither maps nor drops,
    // still filterable (a long catalogue name included, for truncation).
    name: '06m-tags-unsorted',
    goto: '/',
    wait: 1400,
    async setup(page, h) {
      // A phone opens the Filters sheet; md+ has the panel beside the grid.
      const phone = (page.viewportSize()?.width ?? 1280) < 900;
      if (phone) {
        const btn = page.getByTestId('filters-button');
        if (!(await btn.count())) return false;
        await btn.click();
        await h.settle(800);
      }
      const scope = phone ? page.locator('[role="dialog"]') : page.getByTestId('filter-panel');
      const toggle = scope.getByRole('button', { name: /^Unsorted, \d+ tags?$/ }).first();
      if (!(await toggle.count())) return false;
      await toggle.click();
      await h.settle(400);
      await toggle.evaluate((el) => el.scrollIntoView({ block: 'start' }));
      await h.settle(400);
    },
    teardown: (page, h) => h.esc(),
  },
  {
    // Six active filters: on a phone the chips scroll inside their own strip
    // (the page must not scroll sideways); at md+ they wrap.
    name: '06e-active-chips',
    goto: '/?shelf=read&shelf=want-to-read&author=Philip+K.+Dick&author=Jeff+Guinn&format=epub&stars=3-5&read=2021-',
    wait: 1500,
  },
  {
    name: '06f-sort-menu',
    goto: '/?sort=pageCount',
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
    // Saved views under the shelves, the legacy "Unread sci-fi" lit because
    // the list is showing exactly it (a view saved before C2 with the raw
    // tag "science fiction", opened through its legacy fields and mapped to
    // Sci-fi by the gateway's viewTags).
    name: '06g-saved-views',
    goto: '/?shelf=unread&tag=Sci-fi',
    viewports: ['desktop'],
    wait: 1500,
  },
  {
    // The same list in the phone's drawer.
    name: '06h-saved-views-drawer',
    goto: '/?shelf=unread&tag=Sci-fi',
    viewports: ['phone'],
    async setup(page, h) {
      const menu = page.locator('[data-geek-topbar="menu"]');
      if (!(await menu.count())) return false;
      await menu.click();
      await h.settle(600);
      const views = page.locator('#saved-views-label');
      if (!(await views.count())) return false;
      await views.evaluate((el) => el.scrollIntoView({ block: 'center' }));
      await h.settle(300);
    },
    teardown: (page, h) => h.esc(),
  },
  {
    // "Save view", named from the chips.
    name: '06i-save-view',
    goto: '/?shelf=read&tag=Memoir',
    wait: 1400,
    async setup(page, h) {
      const save = page.getByRole('button', { name: 'Save view' });
      if (!(await save.count())) return false;
      await save.first().click();
      await h.settle(600);
    },
    teardown: (page, h) => h.esc(),
  },
  {
    // Scroll memory (@geeksuite/collection useScrollMemory): scroll the
    // library, go to Settings (read it from the top), come Back — the same
    // place. The scene throws
    // (an ERROR in the run) if it lands anywhere else. Phone: the only
    // viewport where eight fixture books are taller than the screen.
    name: '06j-scroll-restore',
    goto: '/',
    viewports: ['phone'],
    wait: 1500,
    async setup(page, h) {
      const main = page.locator('main').first();
      const top = () => main.evaluate((el) => el.scrollTop);
      await main.evaluate((el) => el.scrollTo(0, 600));
      await h.settle(500);
      const before = await top();
      if (before < 400) return false; // not tall enough to prove anything here
      await page.locator('[data-geek-topbar="account"]').click();
      await h.settle(400);
      await page.locator('[data-geek-topbar-menu="settings"]').click();
      await h.settle(900);
      // Read Settings from the top: the shell's <main> is shared, so without
      // this it would simply keep the library's offset and prove nothing.
      await main.evaluate((el) => el.scrollTo(0, 0));
      await h.settle(400);
      await page.goBack();
      await h.settle(1500);
      const back = await top();
      if (Math.abs(back - before) > 4) throw new Error(`scroll not restored: ${before} → ${back}`);
    },
  },
  {
    // What-next shelf (DOCS/AI_IDEAS.md #4, Night 2 R117). The opt-in and
    // `whatNext` are stubbed at the PAGE level, not in fixtures.mjs's
    // context-wide routes(), so scenes 01-06 above (which all visit `/`) are
    // unaffected. Must stay ahead of nothing after it that also relies on the
    // page being clean — see '08-edit-metadata-draft' below, which re-stubs
    // its own bootstrap/GraphQL routes fresh rather than depending on this
    // scene's registrations.
    name: '07-what-next',
    async setup(page, h) {
      await page.route('**/api/users/bootstrap', bootstrapWithLibraryAssistant);
      await graphqlRoute(page, { ...OPS, GetWhatNext: { whatNext: { __typename: 'WhatNextResult', picks: WHAT_NEXT_PICKS, provenance: DRAFT_BOOK_METADATA.provenance } } });

      await page.goto(h.base + '/', { waitUntil: 'networkidle' });
      await h.settle(1500);

      // On demand since 2026-10-03: the picks live in a sheet behind the
      // header's sparkle button, not in a rail on the page.
      const ask = page.getByRole('button', { name: /^(What should I read next\?|What next\?)$/ });
      if (!(await ask.count())) return h.log('no what-next button') ?? false;
      await ask.click();
      await h.settle(900);
    },
  },
  {
    // Edit-metadata dialog with a draft applied (DOCS/AI_IDEAS.md #4, same
    // stream). Re-stubs bootstrap/GraphQL itself (the newest page.route()
    // registration for a pattern wins), so it does not depend on the previous
    // scene. Must stay the LAST scene in the file.
    name: '08-edit-metadata-draft',
    async setup(page, h) {
      await page.route('**/api/users/bootstrap', bootstrapWithLibraryAssistant);
      await graphqlRoute(page, {
        ...OPS,
        GetWhatNext: { whatNext: { __typename: 'WhatNextResult', picks: [], provenance: null } },
        DraftBookMetadata: { draftBookMetadata: DRAFT_BOOK_METADATA },
      });

      await page.goto(h.base + '/', { waitUntil: 'networkidle' });
      await h.settle(1500);

      const card = page.getByText('Lock In', { exact: true }).first();
      if (!(await card.count())) return h.log('no "Lock In" card') ?? false;
      await card.click();
      await h.settle(1000);

      const more = page.locator('[aria-label="More actions"]');
      if (!(await more.count())) return h.log('no "More actions" button') ?? false;
      await more.click();
      await h.settle(500);

      const editMetadata = page.getByRole('button', { name: /^edit metadata$/i }).first();
      if (!(await editMetadata.count())) return h.log('no "Edit metadata" row') ?? false;
      await editMetadata.click();
      await h.settle(700);

      const draftBtn = page.getByRole('button', { name: /^draft description/i }).first();
      if (!(await draftBtn.count())) return false;
      await draftBtn.click();
      await h.settle(900);
    },
    teardown: (page, h) => h.esc(),
  },
  {
    // The reader (review 2026-11-18 #1–#3): signboard bars, the book's
    // percentage and chapter in the bottom bar, the shop's paper page.
    name: '09-reader',
    goto: '/',
    async setup(page, h) {
      if (!(await openReader(page, h))) return false;
      const where = (await page.getByTestId('reader-position').innerText()).trim();
      if (!/^\d+% · /.test(where)) throw new Error(`the reader's position reads "${where}"`);
      await holdReaderChrome(page);
      await h.settle(300);
    },
    teardown: async (page, h) => { await h.esc(); await h.esc(); },
  },
  {
    // Contents, from the book's own nav document, over the reader.
    name: '09b-reader-contents',
    goto: '/',
    async setup(page, h) {
      if (!(await openReader(page, h))) return false;
      await holdReaderChrome(page);
      await page.getByRole('button', { name: 'Contents', exact: true }).click();
      await h.settle(700);
      if (!(await page.getByRole('button', { name: 'The Back Aisle', exact: true }).count())) throw new Error('Contents does not list the chapters');
    },
    teardown: async (page, h) => { await h.esc(); await h.esc(); await h.esc(); },
  },
  {
    // Back closes the reader and leaves the book open (review #2): the book
    // sheet is a route, and Back used to pop it along with the reader.
    // Reopening returns to the same place (#1, kept on this device).
    name: '09c-reader-back',
    goto: '/',
    async setup(page, h) {
      if (!(await openReader(page, h))) return false;
      const frame = page.frameLocator('[data-testid="book-reader"] iframe');
      await page.keyboard.press('ArrowRight');
      await h.settle(500);
      const before = (await page.getByTestId('reader-position').innerText()).trim();
      await page.goBack();
      await h.settle(900);
      if (await page.getByTestId('book-reader').count()) throw new Error('Back did not close the reader');
      if (!/\/book\//.test(new URL(page.url()).pathname)) throw new Error(`Back left the book too: ${page.url()}`);
      if (!(await page.getByRole('button', { name: 'More actions' }).count())) throw new Error('the book sheet closed with the reader');
      await page.getByRole('button', { name: 'Read', exact: true }).click();
      await frame.locator('p').first().waitFor({ timeout: 10000 });
      await page.getByTestId('reader-position').filter({ hasText: '%' }).waitFor({ timeout: 10000 });
      const after = (await page.getByTestId('reader-position').innerText()).trim();
      if (after !== before) throw new Error(`reopened at "${after}", left at "${before}"`);
      await page.goBack();
      await h.settle(900);
    },
    teardown: (page, h) => h.esc(),
  },
];

// Known, ticketed violations. Each one should die when the app is fixed —
// an empty list is the goal, not a permanent parking lot.
//
// The MUI <Rating> waiver that used to live here (its sr-only radio inputs
// measuring 1x1 in EditMetadataDialog.jsx) is gone: `lib/probe.mjs`'s
// tap-target rule now falls back to a for-linked `<label for="id">` when an
// interactive element has no ancestor label (Rating's <label> and <input>
// are siblings, not nested — @mui/material/Rating/Rating.js), and the stars
// themselves render at 44px since 9ed7f18. bookgeek is 0/0/0 without it.
export const waivers = [];
