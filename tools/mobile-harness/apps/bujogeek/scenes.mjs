// BuJoGeek — the M2 surfaces (MOBILE_UI_PLAN.md §4 bujogeek).
export const scenes = [
  { name: '01-today', goto: '/today', wait: 1500 },
  {
    // The FAB opens the quick-add sheet (the same InlineQuickAdd the desktop
    // page uses), so the shortcut grammar has to survive the move.
    name: '02-add-sheet',
    goto: '/today',
    wait: 1500,
    viewports: ['phone'],
    async setup(page, h) {
      const fab = page.getByRole('button', { name: /^add task$/i }).first();
      if (!(await fab.count())) return h.log('no "Add task" FAB') ?? false;
      await fab.click();
      await h.settle(700);
      await page.keyboard.type('Ring the surveyor #house !high /tomorrow');
      await h.settle(400);
    },
    teardown: (page, h) => h.esc(),
  },
  {
    // A row's ⋯ action sheet — the six 28px row actions became one 44px target.
    name: '03-row-actions-sheet',
    goto: '/today',
    wait: 1500,
    viewports: ['phone'],
    async setup(page, h) {
      const more = page.getByRole('button', { name: /^actions for /i }).first();
      if (!(await more.count())) return h.log('no row ⋯ button') ?? false;
      await more.click();
      await h.settle(700);
    },
    teardown: (page, h) => h.esc(),
  },
  {
    // …and Edit off that sheet: TaskEditor, full-screen below `sm`.
    name: '04-task-editor',
    goto: '/today',
    wait: 1500,
    viewports: ['phone'],
    async setup(page, h) {
      const more = page.getByRole('button', { name: /^actions for /i }).first();
      if (!(await more.count())) return false;
      await more.click();
      await h.settle(700);
      const edit = page.getByRole('button', { name: /^edit$/i }).first();
      if (!(await edit.count())) return false;
      await edit.click();
      await h.settle(900);
    },
    teardown: (page, h) => h.esc(),
  },
  {
    // The More tab's sheet — the pattern GeekSheet was promoted from.
    name: '05-more-sheet',
    goto: '/today',
    wait: 1500,
    viewports: ['phone'],
    async setup(page, h) {
      const moreTab = page.getByRole('button', { name: /^more$/i }).first();
      if (!(await moreTab.count())) return false;
      await moreTab.click();
      await h.settle(700);
    },
    teardown: (page, h) => h.esc(),
  },
  { name: '06-plan-monthly', goto: '/plan/monthly', wait: 1500 },
  { name: '07-collection', goto: '/collections/c1', wait: 1400, viewports: ['phone'] },
  {
    name: '08-collection-add-sheet',
    goto: '/collections/c1',
    wait: 1400,
    viewports: ['phone'],
    async setup(page, h) {
      const addEntry = page.getByRole('button', { name: /^add entry$/i }).first();
      if (!(await addEntry.count())) return false;
      await addEntry.click();
      await h.settle(700);
    },
    teardown: (page, h) => h.esc(),
  },
  { name: '09-habits', goto: '/habits', wait: 1400, viewports: ['phone'] },
  {
    name: '10-habit-dialog',
    goto: '/habits',
    wait: 1400,
    viewports: ['phone'],
    async setup(page, h) {
      const newHabit = page.getByRole('button', { name: /^new$/i }).first();
      if (!(await newHabit.count())) return false;
      await newHabit.click();
      await h.settle(700);
    },
    teardown: (page, h) => h.esc(),
  },
];

export const waivers = [];
