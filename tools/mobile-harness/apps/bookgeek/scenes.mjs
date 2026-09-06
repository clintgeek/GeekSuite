// BookGeek — the M1 pilot surfaces (MOBILE_UI_PLAN.md §3), plus the Night 2
// AI library-assistant scenes (R117/R126).
import { json, graphqlRoute } from '../../lib/net.mjs';
import { OPS, WHAT_NEXT_PICKS, DRAFT_BOOK_METADATA } from './fixtures.mjs';

const bootstrapWithLibraryAssistant = (r) => json(r, {
  identity: { username: 'chef', email: 'chef@example.com' },
  profile: { displayName: 'Chef Crocker' },
  preferences: {},
  appPreferences: { bookgeek: { libraryAssistant: true } },
});

export const scenes = [
  { name: '01-library', goto: '/', wait: 1500 },
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
export const waivers = [
  {
    // Real, first surfaced by this scene — no prior harness scene opened a
    // dialog containing MUI's <Rating>, here in EditMetadataDialog.jsx. Each
    // half-star radio input MUI renders (`precision={0.5}`, 0-5 stars = 10
    // radios, plus one "clear rating" reset radio = 11) is a standard
    // visually-hidden <input> paired with a visible star <label>/icon — the
    // probe measures the input itself (1x1, clipped) rather than the icon it
    // is paired with, the way it already special-cases a checkbox's <label>.
    // Separately, the Rating's own `sx={{ fontSize: 32 }}` renders each star
    // icon at 32px, itself under the 44px floor even measured correctly at
    // the label. Neither is fixed here: a probe carve-out belongs in
    // `lib/probe.mjs`, and the icon size is `apps/bookgeek/web/src/views/
    // detail/EditMetadataDialog.jsx` — both outside this stream's
    // fixtures/scenes/README scope. Reported, not fixed.
    rule: 'tap-target',
    scenes: ['08-edit-metadata-draft'],
    match: /MuiRating-visuallyHidden/,
    why: 'MUI <Rating> sr-only radio inputs measure 1x1 — a probe gap (the visible stars are 44px since night 2); teach the probe about visuallyHidden radios and drop this waiver.',
  },
];
