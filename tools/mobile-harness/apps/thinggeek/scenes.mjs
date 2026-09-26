// ThingGeek — every surface of the MVP (DOCS/THINGGEEK_PLAN.md "Screens").
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
  { name: '01-library', goto: '/', wait: 1600 },
  {
    // The list view: value and next-due columns (a phone folds them under the name).
    name: '01b-library-list',
    goto: '/',
    wait: 1400,
    async setup(page, h) {
      if (!(await click(page, h, page.getByRole('button', { name: 'Show as a list' }), 600))) return false;
    },
    async teardown(page, h) {
      await click(page, h, page.getByRole('button', { name: 'Show as covers' }), 200);
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
    name: '02-drawer',
    goto: '/',
    viewports: ['phone'],
    async setup(page, h) {
      if (!(await click(page, h, page.locator('[data-geek-topbar="menu"]'), 600))) return false;
    },
    teardown: (page, h) => h.esc(),
  },
  {
    // Desktop filter panel with a few filters on: counts, chips, the tree-aware place labels.
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
    // Deep link: the library underneath, Wendy's page on top — gallery, readiness, dates, relationships.
    name: '05-detail',
    goto: '/thing/th1',
    wait: 1800,
    teardown: (page, h) => h.esc(),
  },
  {
    // Further down Wendy's page: Details (masked hull + registration), Dates, Relationships.
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
    // The fish finder: the inverse relationship ("Equipped on: Wendy") and its gaps.
    name: '06c-detail-inverse',
    goto: '/thing/th2',
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
  { name: '07-add-photo-step', goto: '/add', wait: 1200, teardown: (page, h) => h.esc() },
  {
    name: '07b-add-type-step',
    goto: '/add',
    wait: 1200,
    async setup(page, h) {
      if (!(await click(page, h, page.getByRole('button', { name: /Skip — no photo yet/ }), 600))) return false;
    },
    teardown: (page, h) => h.esc(),
  },
  {
    name: '07c-add-name-step',
    goto: '/add',
    wait: 1200,
    async setup(page, h) {
      if (!(await click(page, h, page.getByRole('button', { name: /Skip — no photo yet/ }), 500))) return false;
      if (!(await click(page, h, page.getByTestId('type-card').filter({ hasText: 'Boat' }), 600))) return false;
      await page.getByLabel('Name *').fill('Wendy');
      await h.settle(300);
    },
    teardown: (page, h) => h.esc(),
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
  { name: '10-places', goto: '/places', wait: 1400 },
  {
    name: '10b-place-delete',
    goto: '/places',
    wait: 1400,
    async setup(page, h) {
      if (!(await click(page, h, page.getByRole('button', { name: 'Garage: more' }), 400))) return false;
      if (!(await click(page, h, page.getByRole('menuitem', { name: 'Delete' }), 600))) return false;
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
];

// Known, ticketed violations. The list starts empty and stays that way.
export const waivers = [];
