// NewsGeek (County Gazette): Latest, Sources, Source detail, and the Add
// source dialog (DOCS/NEWSGEEK_PLAN.md "Screens"). Deep links everywhere; fixture
// modes ride on the URL (?__fixture=empty | nonadmin), see fixtures.mjs.
export const scenes = [
  { name: '01-latest', goto: '/', wait: 1600 },
  { name: '02-latest-local', goto: '/?section=local', wait: 1600 },
  { name: '03-latest-empty', goto: '/?__fixture=empty', wait: 1600 },
  { name: '04-sources-admin', goto: '/sources', wait: 1600 },
  { name: '05-sources-reader', goto: '/sources?__fixture=nonadmin', wait: 1600 },
  { name: '06-source-failing', goto: '/sources/s-katv', wait: 1600 },
  {
    name: '07-add-source',
    goto: '/sources',
    wait: 1400,
    async setup(page, h) {
      const btn = page.getByRole('button', { name: /^add source$/i });
      if (!(await btn.count())) return false;
      await btn.first().click();
      await h.settle(800);
    },
    teardown: (page, h) => h.esc(),
  },
];

export const waivers = [];
