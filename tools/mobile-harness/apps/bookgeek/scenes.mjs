// BookGeek — the M1 pilot surfaces (MOBILE_UI_PLAN.md §3), the Night 2
// AI library-assistant scenes (R117/R126), and the faceted library of
// Phase C2 (DOCS/BOOKGEEK_CLEANUP_PLAN.md: @geeksuite/collection, 06b–06j),
// and the tag vocabulary (DOCS/TAGS.md: 03b, 06k–06m).
import { json, graphqlRoute } from '../../lib/net.mjs';
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
    name: '04-add',
    goto: '/',
    async setup(page, h) {
      const add = page.getByRole('button', { name: /add book/i }).first();
      if (!(await add.count())) return false;
      await add.click();
      await h.settle(700);
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
