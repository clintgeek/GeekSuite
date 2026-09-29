// ThingGeek — every surface of the MVP (DOCS/THINGGEEK_PLAN.md "Screens"),
// in the Label Maker identity (2026-09-29): a phone tab bar (Things · Where ·
// Add · Attention · More) instead of a drawer, a dense list as the phone's
// library, Where as a drill-down on the phone, a one-screen Add, and a
// thing's page as a full page.
// including where things are: the Where tree, a thing's breadcrumb, Move
// to…, and Contains (the fixtures are a containment graph — House › Garage ›
// Van › Jumper cables).
// Deep links wherever the app has one (/thing/:id, /add, /attention…);
// every scene navigates for itself. Two fixture modes ride on the URL:
// ?__fixture=empty (first run) and ?__fixture=nonmember (the member gate).

const click = async (page, h, locator, ms = 700) => {
  if (!(await locator.count())) return false;
  await locator.first().click();
  await h.settle(ms);
  return true;
};

export const scenes = [
  // The phone's default is the dense list (thumb, name, type, place tape, attention dot); a desk's is the grid.
  { name: '01-library', goto: '/', wait: 1600 },
  {
    // The other view, one tap away: covers on a phone, the list (value and next-due columns) on a desk.
    name: '01b-library-other-view',
    goto: '/',
    wait: 1400,
    async setup(page, h) {
      const to = h.isPhone ? 'Show as covers' : 'Show as a list';
      if (!(await click(page, h, page.getByRole('button', { name: to }), 600))) return false;
    },
    async teardown(page, h) {
      const back = h.isPhone ? 'Show as a list' : 'Show as covers';
      await click(page, h, page.getByRole('button', { name: back }), 200);
    },
  },
  {
    // The search grammar helper under the focused field.
    name: '01c-search-hint',
    goto: '/',
    wait: 1400,
    async setup(page, h) {
      if (h.isPhone) {
        if (!(await click(page, h, page.locator('[data-geek-topbar="search"]'), 500))) return false;
      } else {
        await page.getByRole('searchbox', { name: 'Search your things' }).first().focus();
        await h.settle(400);
      }
    },
    teardown: (page, h) => h.esc(),
  },
  {
    // The phone's navigation: the tab bar, with Attention's count. No hamburger anywhere.
    name: '02-bottom-nav',
    goto: '/attention',
    viewports: ['phone'],
    wait: 1500,
    async setup(page) {
      if (!(await page.getByTestId('bottom-tabs').count())) throw new Error('no tab bar');
      if (await page.locator('[data-geek-topbar="menu"]').count()) throw new Error('a hamburger is back');
      if (!(await page.getByTestId('attention-badge').count())) throw new Error('no attention count on the tab');
    },
  },
  {
    // More: Types, Insurance report, Trash, Saved views and Settings — each one's only home on a phone.
    name: '02b-more-sheet',
    goto: '/',
    viewports: ['phone'],
    wait: 1400,
    async setup(page, h) {
      if (!(await click(page, h, page.getByTestId('bottom-tabs').getByRole('button', { name: 'More' }), 700))) return false;
      if (!(await page.getByTestId('nav-more').count())) throw new Error('the More sheet did not open');
    },
    teardown: (page, h) => h.esc(),
  },
  {
    // Desktop filter panel with a few filters on: counts, chips, the Where facet's tree labels.
    name: '03-filters-desktop',
    goto: '/?in=p-house&missing=receipt',
    viewports: ['desktop'],
    wait: 1600,
  },
  {
    // Lower in the same panel: Missing, Photos & documents, Acquired, Value.
    name: '03b-filters-lower',
    goto: '/?value=100-2000&year=2015-2024',
    viewports: ['desktop'],
    wait: 1600,
    async setup(page, h) {
      const s = page.locator('[data-facet="missing"]');
      if (!(await s.count())) return false;
      await s.evaluate((el) => el.scrollIntoView({ block: 'start' }));
      await h.settle(400);
    },
  },
  {
    // Locations aren't inventory: the Kind facet is how the library shows them.
    name: '03c-library-locations',
    goto: '/?kind=location',
    wait: 1600,
  },
  {
    name: '04-filters-sheet',
    goto: '/?tag=fishing',
    viewports: ['phone'],
    wait: 1400,
    async setup(page, h) {
      if (!(await click(page, h, page.getByTestId('filters-button'), 800))) return false;
    },
    teardown: (page, h) => h.esc(),
  },
  {
    // Deep link: Wendy's page, a full page — the photo strip, name, tape breadcrumb and actions above the fold.
    name: '05-detail',
    goto: '/thing/th1',
    wait: 1800,
    async setup(page) {
      if (await page.getByRole('dialog').count()) throw new Error('the thing page is a sheet again');
      if (!(await page.getByTestId('thing-page').count())) throw new Error('no thing page');
    },
  },
  {
    // The page scrolled: the action bar pins to the top on a phone.
    name: '05a-detail-scrolled',
    goto: '/thing/th1',
    viewports: ['phone'],
    wait: 1800,
    async setup(page, h) {
      await page.locator('main').evaluate((el) => el.scrollTo({ top: 520 }));
      await h.settle(400);
    },
  },
  {
    // Further down Wendy's page: Details (masked hull + registration), Dates, Accessories.
    name: '05b-detail-sections',
    goto: '/thing/th1',
    wait: 1800,
    async setup(page, h) {
      const d = page.locator('#details-heading');
      if (!(await d.count())) return false;
      await d.evaluate((el) => el.scrollIntoView({ block: 'start' }));
      await h.settle(400);
    },
    teardown: (page, h) => h.esc(),
  },
  {
    // A firearm: the serial masked to its last four.
    name: '06-detail-masked',
    goto: '/thing/th5',
    wait: 1800,
    async setup(page, h) {
      const d = page.locator('#details-heading');
      if (!(await d.count())) return false;
      await d.evaluate((el) => el.scrollIntoView({ block: 'start' }));
      await h.settle(300);
    },
    teardown: (page, h) => h.esc(),
  },
  {
    name: '06b-detail-revealed',
    goto: '/thing/th5',
    wait: 1800,
    async setup(page, h) {
      const d = page.locator('#details-heading');
      if (!(await d.count())) return false;
      await d.evaluate((el) => el.scrollIntoView({ block: 'start' }));
      if (!(await click(page, h, page.getByRole('button', { name: 'Reveal Serial number' }), 400))) return false;
      const shown = await page.getByTestId('identifier-value').first().getAttribute('data-masked');
      if (shown !== 'false') throw new Error('Reveal did not unmask the serial');
    },
    teardown: (page, h) => h.esc(),
  },
  {
    // The Van: breadcrumb House › Garage, Move to…, and what it Contains.
    name: '05c-detail-container',
    goto: '/thing/th13',
    wait: 1800,
    teardown: (page, h) => h.esc(),
  },
  {
    // The jumper cables: House › Garage › Van, each crumb a link.
    name: '05d-detail-breadcrumb',
    goto: '/thing/th14',
    wait: 1800,
    async setup(page) {
      if (!(await page.getByRole('navigation', { name: 'Where it is' }).count())) throw new Error('no breadcrumb');
    },
    teardown: (page, h) => h.esc(),
  },
  {
    // A location's own page: the Garage and everything directly in it.
    name: '05e-detail-location',
    goto: '/thing/p-garage',
    wait: 1800,
    async setup(page, h) {
      const d = page.locator('#contains-heading');
      if (!(await d.count())) return false;
      await d.evaluate((el) => el.scrollIntoView({ block: 'start' }));
      await h.settle(300);
    },
    teardown: (page, h) => h.esc(),
  },
  {
    // Move to…: every thing but the Van and what's inside it.
    name: '05f-move-picker',
    goto: '/thing/th13',
    wait: 1800,
    async setup(page, h) {
      if (!(await click(page, h, page.getByTestId('move-to'), 800))) return false;
      if (!(await page.getByTestId('move-list').count())) throw new Error('the move picker did not open');
    },
    teardown: async (page, h) => {
      await h.esc();
      await h.esc();
    },
  },
  {
    // Inside something in the Trash: the lures stay in the trashed tackle box.
    name: '05g-inside-trash',
    goto: '/thing/th17',
    wait: 1800,
    async setup(page) {
      if (!(await page.getByTestId('inside-trash').count())) throw new Error('no inside-the-Trash note');
    },
    teardown: (page, h) => h.esc(),
  },
  {
    // The gun safe: a container inside the Office, holding the firearms.
    name: '05h-detail-safe',
    goto: '/thing/p-safe',
    wait: 1800,
    teardown: (page, h) => h.esc(),
  },
  {
    // Trashing a container says what happens to what's inside.
    name: '05i-trash-container',
    goto: '/thing/th13',
    wait: 1800,
    async setup(page, h) {
      if (!(await click(page, h, page.getByRole('button', { name: 'More actions' }), 700))) return false;
      if (!(await click(page, h, page.getByText('Move to Trash', { exact: true }), 700))) return false;
      if (!(await page.getByTestId('trash-contents-note').count())) throw new Error('no contents note');
    },
    teardown: async (page, h) => {
      await h.esc();
      await h.esc();
    },
  },
  {
    // The lens: an accessory of the camera, wherever each is kept.
    name: '06c-detail-accessory',
    goto: '/thing/th16',
    wait: 1800,
    async setup(page, h) {
      const d = page.locator('#relationships-heading');
      if (!(await d.count())) return false;
      await d.evaluate((el) => el.scrollIntoView({ block: 'start' }));
      await h.settle(300);
    },
    teardown: (page, h) => h.esc(),
  },
  {
    name: '06d-lightbox',
    goto: '/thing/th1',
    wait: 1800,
    async setup(page, h) {
      if (!(await click(page, h, page.getByRole('button', { name: /^Open photo 1 of/ }), 700))) return false;
    },
    teardown: async (page, h) => {
      await h.esc();
      await h.esc();
    },
  },
  {
    name: '06e-add-photo-sheet',
    goto: '/thing/th6',
    wait: 1600,
    async setup(page, h) {
      if (!(await click(page, h, page.getByTestId('detail-actions').getByRole('button', { name: 'Add photo' }), 700))) return false;
    },
    teardown: async (page, h) => {
      await h.esc();
      await h.esc();
    },
  },
  // Add, on one screen: photo slot, name, type chips, where, Save / Save & add another.
  { name: '07-add', goto: '/add', wait: 1400 },
  {
    // The type chips opened out: most-used first, then everything under "More types".
    name: '07b-add-more-types',
    goto: '/add',
    wait: 1400,
    async setup(page, h) {
      if (!(await click(page, h, page.getByRole('button', { name: 'More types' }), 500))) return false;
    },
  },
  {
    // Filled in, with the keyboard down: the Save bar at the foot.
    name: '07c-add-filled',
    goto: '/add',
    wait: 1400,
    async setup(page, h) {
      await page.getByLabel('Name *').fill('DeWalt impact driver');
      if (!(await click(page, h, page.getByTestId('type-chips').getByRole('button', { name: 'Tool' }), 500))) return false;
      await page.getByLabel('Name *').blur();
      await h.settle(300);
    },
  },
  {
    // The place picker: locations and containers only, with a new location inline.
    name: '07d-add-where-picker',
    goto: '/add',
    wait: 1400,
    async setup(page, h) {
      if (!(await click(page, h, page.getByRole('button', { name: /^Where it is: / }), 800))) return false;
    },
    teardown: (page, h) => h.esc(),
  },
  {
    // "Add here" from the Van: the add screen arrives already pointed at it.
    name: '07e-add-here',
    goto: '/thing/th13',
    wait: 1800,
    async setup(page, h) {
      if (!(await click(page, h, page.getByTestId('add-here'), 900))) return false;
      if (!(await page.getByRole('button', { name: 'Where it is: House › Garage › Van. Change' }).count())) throw new Error('Add here did not preset the Van');
    },
  },
  {
    // Save & add another: saved, still here — the same place and type, the name and photo cleared.
    name: '07f-add-another',
    goto: '/thing/th13',
    wait: 1800,
    async setup(page, h) {
      if (!(await click(page, h, page.getByTestId('add-here'), 900))) return false;
      await page.getByLabel('Name *').fill('Tow strap');
      if (!(await click(page, h, page.getByTestId('type-chips').getByRole('button', { name: 'Tool' }), 400))) return false;
      if (!(await click(page, h, page.getByRole('button', { name: 'Save & add another' }), 1200))) return false;
      if ((await page.getByLabel('Name *').inputValue()) !== '') throw new Error('the name was not cleared');
      if ((await page.getByTestId('type-chips').getByRole('button', { name: 'Tool' }).getAttribute('aria-pressed')) !== 'true') throw new Error('the type was not kept');
      if (!(await page.getByRole('button', { name: 'Where it is: House › Garage › Van. Change' }).count())) throw new Error('the place was not kept');
      await page.getByLabel('Name *').blur();
      await h.settle(300);
    },
  },
  {
    name: '08-edit-form',
    goto: '/thing/th1',
    wait: 1800,
    async setup(page, h) {
      if (!(await click(page, h, page.getByTestId('detail-actions').getByRole('button', { name: 'Edit' }), 900))) return false;
    },
    teardown: async (page, h) => {
      await h.esc();
      await h.esc();
    },
  },
  {
    // The same form scrolled to its Details: fields by kind, identifiers locked.
    name: '08b-edit-details',
    goto: '/thing/th1',
    wait: 1800,
    async setup(page, h) {
      if (!(await click(page, h, page.getByTestId('detail-actions').getByRole('button', { name: 'Edit' }), 900))) return false;
      const d = page.locator('#edit-details');
      if (!(await d.count())) return false;
      await d.evaluate((el) => el.scrollIntoView({ block: 'start' }));
      await h.settle(400);
    },
    teardown: async (page, h) => {
      await h.esc();
      await h.esc();
    },
  },
  { name: '09-attention', goto: '/attention', wait: 1500 },
  // Where. A phone drills down (top level, then one place at a time); a desk shows the tree.
  { name: '10-where', goto: '/where', wait: 1400 },
  {
    // One level in: the House's places, then what's kept directly in it, under a tape breadcrumb.
    name: '10a-where-level',
    goto: '/where?at=p-house',
    viewports: ['phone'],
    wait: 1400,
    async setup(page) {
      if ((await page.getByTestId('where-level').getAttribute('data-at')) !== 'p-house') throw new Error('did not drill into the House');
    },
  },
  {
    // Two levels in: the Garage — its shelf, vehicles and boat — with Add here / Move in place.
    name: '10a2-where-level-garage',
    goto: '/where',
    viewports: ['phone'],
    wait: 1400,
    async setup(page, h) {
      // Walk it the way a thumb does: House, then Garage.
      if (!(await click(page, h, page.getByRole('link', { name: /^House: .*Look inside$/ }), 800))) return false;
      if (!(await click(page, h, page.getByRole('link', { name: /^Garage: .*Look inside$/ }), 800))) return false;
      if ((await page.getByTestId('where-level').getAttribute('data-at')) !== 'p-garage') throw new Error('did not drill into the Garage');
    },
  },
  {
    // The desk's tree, expanded to the items kept directly in the Van and the safe; the two groups below opened.
    name: '10b-where-expanded',
    goto: '/where',
    viewports: ['desktop'],
    wait: 1400,
    async setup(page, h) {
      if (!(await click(page, h, page.getByRole('button', { name: /^Show .* kept directly in Van$/ }), 400))) return false;
      await click(page, h, page.getByRole('button', { name: /^Show .* kept directly in Gun safe$/ }), 400);
      await click(page, h, page.getByTestId('where-nowhere').getByRole('button').first(), 300);
      await click(page, h, page.getByTestId('where-in-trash').getByRole('button').first(), 300);
    },
  },
  {
    // A place's ⋯ menu (a phone finds the Garage one level into the House; a desk, in the tree).
    name: '10c-where-menu',
    goto: '/where?at=p-house',
    wait: 1400,
    async setup(page, h) {
      if (!(await click(page, h, page.getByRole('button', { name: 'Garage: more' }), 500))) return false;
    },
    teardown: (page, h) => h.esc(),
  },
  {
    name: '10d-where-move',
    goto: '/where?at=p-garage',
    wait: 1400,
    async setup(page, h) {
      if (!(await click(page, h, page.getByRole('button', { name: 'Van: more' }), 400))) return false;
      if (!(await click(page, h, page.getByRole('menuitem', { name: 'Move to…' }), 700))) return false;
    },
    teardown: (page, h) => h.esc(),
  },
  {
    name: '10e-where-add-location',
    goto: '/where?at=p-house',
    wait: 1400,
    async setup(page, h) {
      if (!(await click(page, h, page.getByRole('button', { name: 'Garage: more' }), 400))) return false;
      if (!(await click(page, h, page.getByRole('menuitem', { name: 'Add a location inside' }), 600))) return false;
    },
    teardown: (page, h) => h.esc(),
  },
  { name: '11-types', goto: '/types', wait: 1400 },
  {
    name: '11b-type-editor',
    goto: '/types',
    wait: 1400,
    async setup(page, h) {
      if (!(await click(page, h, page.getByRole('button', { name: 'Edit Firearm' }), 800))) return false;
    },
    teardown: (page, h) => h.esc(),
  },
  { name: '12-insurance', goto: '/insurance', wait: 1800 },
  {
    // The printout itself: print media, the app shell swapped for the report.
    name: '12b-insurance-print',
    goto: '/insurance',
    wait: 1800,
    async setup(page, h) {
      await page.emulateMedia({ media: 'print' });
      await h.settle(400);
      if (!(await page.getByTestId('print-report').count())) throw new Error('the print report did not render');
    },
    async teardown(page) {
      await page.emulateMedia({ media: 'screen' });
    },
  },
  { name: '13-trash', goto: '/trash', wait: 1400 },
  { name: '14-settings', goto: '/settings', wait: 1400 },
  { name: '15-not-a-member', goto: '/?__fixture=nonmember', wait: 1600 },
  { name: '16-first-run', goto: '/?__fixture=empty', wait: 1600 },
  // Printable QR box labels (2026-09-29): the picker with nothing chosen yet…
  { name: '17-labels-selector', goto: '/labels', wait: 1400 },
  // …and a preview for one thing (Wendy, th1 — a container with a breadcrumb).
  { name: '17b-labels-preview', goto: '/labels?ids=th1', wait: 1600 },
  // "Walk the room" (2026-09-29): a full-screen capture loop — the place as
  // tape, a running count, the camera-or-name form, sticky type chips.
  { name: '18-walk-empty', goto: '/walk?at=p-garage', wait: 1400 },
  {
    // Two quick captures: the count reaches 2, and the trip list shows both saved.
    name: '18b-walk-two-items',
    goto: '/walk?at=p-garage',
    wait: 1400,
    async setup(page, h) {
      await page.getByLabel('Name *').fill('Extension cord');
      if (!(await click(page, h, page.getByRole('button', { name: 'Next' }), 900))) return false;
      await page.getByLabel('Name *').fill('Rake');
      if (!(await click(page, h, page.getByRole('button', { name: 'Next' }), 900))) return false;
      const count = await page.getByTestId('walk-count').textContent();
      if (!count?.includes('2 added')) throw new Error('the running count did not reach 2');
      await page.getByLabel('Name *').blur();
      await h.settle(300);
    },
  },
];

// Known, ticketed violations. The list starts empty and stays that way.
export const waivers = [];
