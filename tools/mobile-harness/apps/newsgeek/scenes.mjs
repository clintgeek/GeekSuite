// NewsGeek (County Gazette): Latest, Sources, Source detail, the Add a
// source sheet, the Source sheet and Settings (DOCS/NEWSGEEK_PLAN.md "Screens", "Reader-added sources"). Deep
// links everywhere; fixture modes ride on the URL (?__fixture=empty | nonadmin |
// free, ?__discover=nofeed | existing), see fixtures.mjs.

// Open the Add sheet, paste a link, "Find feed", wait for the answer.
const addSheet = (link) => async (page, h) => {
  const btn = page.getByRole('button', { name: /^add a source$/i });
  if (!(await btn.count())) return false;
  await btn.first().click();
  await h.settle(700);
  if (!link) return undefined;
  await page.getByLabel(/link to the site or a story/i).fill(link);
  await page.getByRole('button', { name: /^find feed$/i }).click();
  await page.locator('[data-testid="add-source-sheet"]:not([data-phase="discovering"])').waitFor({ timeout: 5000 });
  await h.settle(600);
  return undefined;
};
const scrollTo = (selector) => async (page, h) => {
  const el = page.locator(selector);
  if (!(await el.count())) return false;
  await el.first().scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, -80));
  await h.settle(400);
  return undefined;
};

// Tap a story's publisher line ("Settings for <publisher>"): the Source sheet.
const sourceSheet = (publisher) => async (page, h) => {
  const btn = page.getByRole('button', { name: `Settings for ${publisher}` });
  if (!(await btn.count())) return false;
  await btn.first().click();
  await page.locator('[data-testid="source-sheet"] [data-testid^="sheet-"]').first().waitFor({ timeout: 5000 });
  await h.settle(700);
  return undefined;
};

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
    // The Add sheet, idle, as an admin ("Enter the feed by hand" shows).
    setup: addSheet(''),
    teardown: (page, h) => h.esc(),
  },
  // "Free to read" on: the switch set, "14 paywalled stories hidden" under the tabs.
  { name: '08-latest-free-to-read', goto: '/?__fixture=free', wait: 1600 },
  { name: '09-source-paywall', goto: '/sources/s-mal', wait: 1600 },
  // Reader-added sources: the Sources sections and Suggested, as a reader.
  { name: '10-sources-others', goto: '/sources?__fixture=nonadmin', wait: 1600, setup: scrollTo('#sources-others') },
  { name: '11-sources-turned-off', goto: '/sources?__fixture=nonadmin', wait: 1600, setup: scrollTo('#sources-off') },
  { name: '12-sources-suggested', goto: '/sources?__fixture=nonadmin', wait: 1600, setup: scrollTo('#sources-suggested') },
  // The Add sheet: a preview, no feed, already here.
  { name: '13-add-preview', goto: '/sources?__fixture=nonadmin', wait: 1400, setup: addSheet('magnoliareporter.com'), teardown: (page, h) => h.esc() },
  { name: '14-add-nofeed', goto: '/sources?__fixture=nonadmin&__discover=nofeed', wait: 1400, setup: addSheet('examplehardware.com'), teardown: (page, h) => h.esc() },
  { name: '15-add-existing', goto: '/sources?__fixture=nonadmin&__discover=existing', wait: 1400, setup: addSheet('hopestar.com'), teardown: (page, h) => h.esc() },
  // The adder's view of their own source: Check now, Edit, Retire, "Added by you".
  { name: '16-source-adder', goto: '/sources/s-gurdon?__fixture=nonadmin', wait: 1600 },
  // An admin on a reader's source: "On for everyone", "Added by Heather".
  { name: '17-source-admin-reader-added', goto: '/sources/s-hope', wait: 1600 },
  // Settings → Open-with links (two example.com templates).
  { name: '18-settings', goto: '/settings', wait: 1600 },
  // A story's ⋯ menu: "Open at publisher", then the reader's links.
  {
    name: '19-article-menu',
    goto: '/',
    wait: 1600,
    async setup(page, h) {
      const btn = page.getByTestId('article-menu-button');
      if (!(await btn.count())) return false;
      await btn.nth(1).click();
      await h.settle(500);
      return undefined;
    },
    teardown: (page, h) => h.esc(),
  },
  // …and a reader with none: "Add open-with links…".
  {
    name: '20-article-menu-empty',
    goto: '/?__fixture=nonadmin',
    wait: 1600,
    async setup(page, h) {
      const btn = page.getByTestId('article-menu-button');
      if (!(await btn.count())) return false;
      await btn.nth(1).click();
      await h.settle(500);
      return undefined;
    },
    teardown: (page, h) => h.esc(),
  },
  // The Source sheet (plan "Source sheet"): a direct, paywalled source the
  // reader subscribes to ("Keeps it when Free to read is on" set heavier)…
  { name: '21-source-sheet-direct', goto: '/', wait: 1600, setup: sourceSheet('Malvern Daily Record'), teardown: (page, h) => h.esc() },
  // …and a story that came through Google News: hide / subscribe by domain.
  { name: '22-source-sheet-aggregator', goto: '/', wait: 1600, setup: sourceSheet('Magnolia Reporter'), teardown: (page, h) => h.esc() },
  // "More from this source": Latest filtered, the "Showing: … ×" chip.
  { name: '23-latest-filtered', goto: '/?source=s-ark', wait: 1600 },
  // Settings → Publishers: a subscribed source, a subscribed domain, two hidden.
  { name: '24-settings-publishers', goto: '/settings', wait: 1600, setup: scrollTo('#settings-publishers') },
  // …and a reader who has set none: the empty states.
  { name: '25-settings-publishers-empty', goto: '/settings?__fixture=nonadmin', wait: 1600, setup: scrollTo('#settings-publishers') },
];

export const waivers = [];
