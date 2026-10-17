// Wave A scenes (settings, quick target, medications, reports, blood pressure).
// Prefix 6x: 60 Settings, 61 Settings in Full, 62 quick target, 63-65 medications,
// 66 Reports, 67-68 blood pressure, 69 Home's AI card. See scenes.mjs.
//
// Every scene stubs for itself (page-scoped GraphQL ops, page.route for the
// REST ones) and takes the stubs down again whether it passes or throws: one
// page serves every scene of a viewport. Every anchor is a must(), so a UI
// that moved fails loudly instead of skipping.
import { json, graphqlRoute } from '../../lib/net.mjs';
import { OPS, SETTINGS, USER, MEDS, experienceOf, heatherOps } from './fixtures.mjs';
import { scrollToSection, HEATHER, isoLocal } from './helpers.mjs';

// must(), but it waits: the lazy chart islands and the quick target's loader
// take a beat, and a slow machine is not a regression. Still THROWS when the
// anchor never shows.
const must = async (locator, what, ms = 8000) => {
  try {
    await locator.first().waitFor({ state: 'visible', timeout: ms });
  } catch {
    throw new Error(`missing: ${what}`);
  }
  return locator;
};

const daysAgoIso = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return isoLocal(d); };
const at = (n, hh, mm) => { const d = new Date(); d.setDate(d.getDate() - n); d.setHours(hh, mm, 0, 0); return d.toISOString(); };

/**
 * One scene with its own stubs. `ops` is a GraphQL op map, `profile` overrides
 * what /api/me says about the signed-in user, `rest` maps a glob to a handler.
 * `fn` runs after the page has settled; whatever it throws, the stubs go.
 */
const stubbed = (name, { ops, profile, rest = {}, path, wait = 1500, fn, viewports, dialog = false }) => {
  const undo = async (page) => {
    if (ops) await page.unroute('**/graphql');
    if (profile) await page.unroute('**/api/me');
    for (const glob of Object.keys(rest)) await page.unroute(glob);
  };
  return {
    name,
    ...(viewports ? { viewports } : {}),
    async setup(page, h) {
      try {
        if (ops) await graphqlRoute(page, ops);
        if (profile) await page.route('**/api/me', (r) => json(r, { user: { ...USER, ...profile } }));
        for (const [glob, handler] of Object.entries(rest)) await page.route(glob, handler);
        await page.goto(h.base + path, { waitUntil: 'networkidle' });
        await h.settle(wait);
        await fn(page, h);
      } catch (err) {
        await undo(page);
        throw err;
      }
    },
    async teardown(page, h) {
      if (dialog) await h.esc(400);
      await undo(page);
    },
  };
};

// ── Who is signed in ────────────────────────────────────────────────────
// Heather: Simple, 52, 5'4", female. Chef is the context's own USER (44, 6'1").
const HEATHER_ME = { email: 'heather@example.com', profile: { age: 52, height: '5\'4"', gender: 'female' } };
const HEATHER_NO_AGE = { email: 'heather@example.com', profile: { height: '5\'4"', gender: 'female' } };

const heatherSettings = heatherOps(HEATHER).GetFitnessUserSettings.fitnessUserSettings;
const withGoal = (patch) => ({
  ...heatherOps(HEATHER),
  GetFitnessUserSettings: {
    fitnessUserSettings: { ...heatherSettings, nutrition_goal: { ...heatherSettings.nutrition_goal, ...patch } },
  },
});

// Ten daily weigh-ins, newest lowest: the quick target's weight is the 7-day
// average the client works out (currentAverage) from these, not a stat.
const DAILY_WEIGHTS = Array.from({ length: 10 }, (_, i) => ({
  __typename: 'FitnessWeight',
  id: `qw${i}`,
  weight_value: Math.round((221.8 - i * 0.2) * 10) / 10,
  log_date: daysAgoIso(9 - i),
  notes: null,
  source: 'manual',
  formatted_date: daysAgoIso(9 - i),
}));

// Chef in Full with Garmin on and a login saved, household joined (SETTINGS).
const FULL_EXPERIENCE = experienceOf({ mode: 'full', first_run_done: true, preferred_name: 'Chef' });
const fullSettings = {
  fitnessUserSettings: { ...SETTINGS, garmin: { ...SETTINGS.garmin, enabled: true, username: 'chef@example.com' } },
};
const FULL = { ...OPS, GetFitnessExperience: FULL_EXPERIENCE, GetFitnessUserSettings: fullSettings };

// ── Settings, Simple ────────────────────────────────────────────────────
const SIMPLE_SETTINGS = heatherOps(HEATHER);

const settingsSimple = [
  // Simple Settings: How it looks, About you, and "More settings" still folded away.
  stubbed('60-settings-simple', {
    ops: SIMPLE_SETTINGS, profile: HEATHER_ME, path: '/settings',
    async fn(page) {
      await must(page.locator('[data-testid="experience-settings"]'), 'How it looks');
      await must(page.locator('[data-testid="about-you"]'), 'About you');
      const more = await must(page.getByRole('button', { name: /^more settings$/i }), 'More settings');
      if ((await more.getAttribute('aria-expanded')) !== 'false') throw new Error('More settings should start closed');
      if (await page.locator('#garmin').count()) throw new Error('Garmin showing before More settings was opened');
      await must(page.getByLabel('What should I call you?'), 'name field');
      const name = await page.getByLabel('What should I call you?').inputValue();
      if (name !== 'Heather') throw new Error(`name field says "${name}", wanted Heather`);
    },
  }),
  // The same page scrolled to About you: the name, the goal and her age, height and sex, filled from /api/me.
  stubbed('60a-settings-simple-you', {
    ops: SIMPLE_SETTINGS, profile: HEATHER_ME, path: '/settings',
    async fn(page, h) {
      await must(page.getByLabel('Age'), 'Age field');
      if ((await page.getByLabel('Age').inputValue()) !== '52') throw new Error('Age did not fill from the profile');
      await scrollToSection(page, h, '[data-testid="about-you"] >> text=Used to work out your calorie target.', 160);
    },
  }),
  // More settings opened in Simple: Household, Garmin (off), Health alerts, Account.
  stubbed('60b-settings-simple-more', {
    ops: SIMPLE_SETTINGS, profile: HEATHER_ME, path: '/settings',
    async fn(page, h) {
      await (await must(page.getByRole('button', { name: /^more settings$/i }), 'More settings')).click();
      await h.settle(700);
      await must(page.locator('#household'), 'Household');
      await must(page.locator('#garmin'), 'Garmin');
      await must(page.locator('#account'), 'Account');
      await scrollToSection(page, h, '#more-settings', 120);
    },
  }),
];

// ── Settings, Full: one section in view per scene ───────────────────────
const FULL_SETTINGS = { ops: FULL, profile: { email: 'chef@example.com' }, path: '/settings' };
const settingsFull = [
  // Merged Settings in Full: How it looks and About you on top, no "More settings" fold.
  stubbed('61-settings-full', {
    ...FULL_SETTINGS,
    async fn(page) {
      await must(page.locator('[data-testid="experience-settings"]'), 'How it looks');
      await must(page.locator('[data-testid="about-you"]'), 'About you');
      if (await page.getByRole('button', { name: /^more settings$/i }).count()) throw new Error('Full should not fold anything');
    },
  }),
  // Household, joined: the member list and what is shared.
  stubbed('61a-settings-household', {
    ...FULL_SETTINGS,
    async fn(page, h) { await must(page.locator('#household'), '#household'); await scrollToSection(page, h, '#household', 80); },
  }),
  // Garmin on with a login saved: the button offers to update it, never "Connect".
  stubbed('61b-settings-garmin', {
    ...FULL_SETTINGS,
    async fn(page, h) {
      await must(page.getByRole('button', { name: /^(update|save) garmin login$/i }), 'update-the-login button');
      if (await page.getByRole('button', { name: /^connect garmin$/i }).count()) throw new Error('"Connect Garmin" showing for a saved login');
      if ((await page.getByLabel('Garmin email').inputValue()) !== 'chef@example.com') throw new Error('Garmin email did not fill');
      await scrollToSection(page, h, '#garmin', 80);
    },
  }),
  // Health alerts: the sleep apnea suggestion switch and its caveat.
  stubbed('61c-settings-alerts', {
    ...FULL_SETTINGS,
    async fn(page, h) { await scrollToSection(page, h, '#health-alerts', 80); },
  }),
  // Account at the bottom: who is signed in, and Sign out.
  stubbed('61d-settings-account', {
    ...FULL_SETTINGS,
    async fn(page, h) {
      const email = await must(page.locator('[data-testid="account-email"]'), 'account email');
      if (!/chef@example\.com/.test(await email.innerText())) throw new Error('account email did not come from /api/me');
      await scrollToSection(page, h, '#account', 120);
    },
  }),
  // /profile redirects to /settings#you, and About you is the section in view.
  stubbed('61e-profile-lands-on-you', {
    ops: FULL, profile: { email: 'chef@example.com' }, path: '/profile',
    async fn(page, h) {
      const hash = new URL(page.url()).hash;
      if (hash !== '#you') throw new Error(`/profile landed on "${hash}", wanted #you`);
      if (!/\/settings/.test(page.url())) throw new Error(`/profile landed on ${page.url()}`);
      const you = await must(page.locator('#you'), '#you section');
      await h.settle(400);
      const box = await you.boundingBox();
      const vh = page.viewportSize().height;
      if (!box || box.y > vh * 0.4 || box.y + box.height < 0) throw new Error(`About you is not in view (top ${box && Math.round(box.y)} of ${vh})`);
    },
  }),
];

// ── Quick target ────────────────────────────────────────────────────────
const quickTarget = [
  // Quick target in Simple, with a target already saved: it knows everything, so it says one sentence.
  stubbed('62-quick-target', {
    ops: { ...withGoal({ enabled: true, daily_calorie_target: 1950, bmr: 1500, tdee: 2300 }), GetFitnessWeights: { fitnessWeights: DAILY_WEIGHTS } },
    profile: HEATHER_ME, path: '/calorie-wizard',
    async fn(page) {
      await must(page.locator('[data-testid="quick-target"]'), 'quick target');
      const known = await must(page.locator('[data-testid="quick-known"]'), 'the "Using ..." line');
      const text = await known.innerText();
      if (!/7-day average/.test(text) || !/age 52/.test(text)) throw new Error(`quick-known says "${text}"`);
      const current = await must(page.locator('[data-testid="quick-current-target"]'), 'current target line');
      if (!/1,950/.test(await current.innerText())) throw new Error('current target is not 1,950');
      const result = await must(page.locator('[data-testid="quick-result"]'), 'the one sentence');
      if (!/Your daily target: [\d,]+ calories\./.test(await result.innerText())) throw new Error('no one-sentence answer');
      if (await page.getByLabel('Your age').count()) throw new Error('asked for an age it already has');
    },
  }),
  // The same, with "How this was worked out" open: the BMR and TDEE card.
  stubbed('62a-quick-target-working', {
    ops: { ...withGoal({ enabled: true, daily_calorie_target: 1950, bmr: 1500, tdee: 2300 }), GetFitnessWeights: { fitnessWeights: DAILY_WEIGHTS } },
    profile: HEATHER_ME, path: '/calorie-wizard',
    async fn(page, h) {
      const how = await must(page.getByRole('button', { name: /how this was worked out/i }), 'How this was worked out');
      await how.click();
      await h.settle(700);
      if ((await how.getAttribute('aria-expanded')) !== 'true') throw new Error('the working did not open');
      await must(page.locator('[data-testid="bmr-source"]'), 'metabolism card');
      await scrollToSection(page, h, '[data-testid="quick-result"]', 96);
    },
  }),
  // No age on the profile: it asks for the age and nothing else it can work out.
  stubbed('62b-quick-target-asks-age', {
    ops: { ...withGoal({ enabled: true, daily_calorie_target: 1950, bmr: 1500, tdee: 2300 }), GetFitnessWeights: { fitnessWeights: DAILY_WEIGHTS } },
    profile: HEATHER_NO_AGE, path: '/calorie-wizard',
    async fn(page) {
      await must(page.getByLabel('Your age'), 'the age question');
      for (const asked of ['Your weight now (lb)', 'Your height']) {
        if (await page.getByLabel(asked).count()) throw new Error(`also asked "${asked}"`);
      }
      if (await page.locator('[data-testid="quick-result"]').count()) throw new Error('an answer before the age was given');
    },
  }),
  // First visit from Simple (no target yet): "Set your daily target", the speeds, then the answer.
  stubbed('62c-quick-target-first', {
    ops: { ...heatherOps(HEATHER), GetFitnessWeights: { fitnessWeights: DAILY_WEIGHTS } },
    profile: HEATHER_ME, path: '/calorie-wizard',
    async fn(page) {
      await must(page.getByRole('heading', { name: /set your daily target/i }), 'heading');
      await must(page.locator('[data-testid="quick-speed-1"]'), 'Steady speed');
      if (await page.locator('[data-testid="quick-current-target"]').count()) throw new Error('"target now" with no target saved');
      await must(page.locator('[data-testid="quick-result"]'), 'the answer');
    },
  }),
  // Full reaches the same screen with ?quick=1; without the flag it is the four-step wizard.
  stubbed('62d-quick-target-full', {
    ops: { ...FULL, GetFitnessWeights: { fitnessWeights: DAILY_WEIGHTS } }, path: '/calorie-wizard?quick=1',
    async fn(page) {
      await must(page.locator('[data-testid="quick-target"]'), 'quick target in Full');
      if (await page.getByText('Approach', { exact: true }).count()) throw new Error('the four-step stepper showed with ?quick=1');
      await must(page.locator('[data-testid="quick-result"]'), 'the answer');
    },
  }),
];

// ── Medications ─────────────────────────────────────────────────────────
const M1 = { ...MEDS[0], id: 'm1', display_name: 'Lisinopril', times_of_day: ['morning'] };
const M2 = { ...MEDS[1], id: 'm2', display_name: 'Vitamin D', med_type: 'supplement', times_of_day: [] };
const LISIN = [{ rxcui: '29046', name: 'Lisinopril' }, { rxcui: '314076', name: 'Lisinopril 10 MG Oral Tablet' }];
const noLogs = (r) => json(r, { success: true, data: [] });
const searchOf = (rows) => (r) => json(r, { success: true, data: rows });
const DETAILS = (r) => json(r, { success: true, data: { strengths: [{ rxcui: '314076', name: '10 MG' }], suggested: ['hypertension'] } });
const medsOps = (base, meds) => ({ ...base, GetFitnessMedications: { fitnessMedications: meds } });
const MEDS_REST = (rows = []) => ({ '**/api/meds/logs/by-date*': noLogs, '**/api/meds/search*': searchOf(rows), '**/api/meds/rxcui/*': DETAILS });

const medications = [
  // Medications, empty, in Simple: one sentence and one big Add.
  stubbed('63-meds-empty-simple', {
    ops: medsOps(heatherOps(HEATHER), []), rest: MEDS_REST(), path: '/medications',
    async fn(page) {
      await must(page.getByText('No medications yet'), 'empty title');
      await must(page.getByRole('button', { name: /^add a medication$/i }), 'Add a medication');
    },
  }),
  // Simple add, typing "lisin": the RxNorm suggestions appear under the name after the 300ms pause.
  stubbed('63a-meds-suggest-simple', {
    ops: medsOps(heatherOps(HEATHER), []), rest: MEDS_REST(LISIN), path: '/medications', dialog: true,
    async fn(page, h) {
      await (await must(page.getByRole('button', { name: /^add a medication$/i }).first(), 'Add a medication')).click();
      await h.settle(700);
      const box = await must(page.locator('#simple-med-name'), 'name box');
      await box.pressSequentially('lisin', { delay: 40 });
      await h.settle(800);
      await must(page.getByRole('list', { name: 'Suggestions' }), 'suggestion list');
      await must(page.getByText('Lisinopril 10 MG Oral Tablet'), 'second suggestion');
    },
  }),
  // Simple add, "Vitamin D" typed (RxNorm knows nothing), Morning and Bedtime picked, Save in the footer.
  stubbed('63b-meds-add-simple-filled', {
    ops: medsOps(heatherOps(HEATHER), []), rest: MEDS_REST([]), path: '/medications', dialog: true,
    async fn(page, h) {
      await (await must(page.getByRole('button', { name: /^add a medication$/i }).first(), 'Add a medication')).click();
      await h.settle(700);
      const dialog = await must(page.getByRole('dialog'), 'add dialog');
      await dialog.locator('#simple-med-name').fill('Vitamin D');
      await h.settle(700);
      for (const slot of ['Morning', 'Bedtime']) {
        const t = dialog.getByRole('button', { name: slot, exact: true });
        await (await must(t, `${slot} toggle`)).click();
        if ((await t.getAttribute('aria-pressed')) !== 'true') throw new Error(`${slot} did not select`);
      }
      const save = dialog.getByRole('button', { name: /^save$/i });
      await must(save, 'Save');
      if (h.isPhone) await must(dialog.locator('[data-testid="thumb-save"]'), 'Save in the footer');
      await save.scrollIntoViewIfNeeded();
    },
  }),
  // Simple Home with no medications: the quiet "Track your meds" way in.
  stubbed('63c-home-track-meds', {
    ops: medsOps(heatherOps(HEATHER), []), rest: MEDS_REST(), path: '/dashboard',
    async fn(page, h) {
      await must(page.locator('[data-testid="track-meds"]'), 'Track your meds');
      await scrollToSection(page, h, '[data-testid="track-meds"]', 360);
    },
  }),
  // Full add form after a search: pick "Lisinopril 10 MG Oral Tablet", get Strength and the suggested "hypertension".
  stubbed('64-meds-add-full', {
    ops: medsOps(FULL, [M1, M2]), rest: MEDS_REST(LISIN), path: '/medications',
    async fn(page, h) {
      await (await must(page.getByLabel('Medication name (brand or generic)'), 'search box')).fill('lisinopril');
      await (await must(page.getByRole('button', { name: /^search$/i }), 'Search')).click();
      await h.settle(700);
      await (await must(page.getByText('Lisinopril 10 MG Oral Tablet'), 'search result')).click();
      await h.settle(900);
      await must(page.getByLabel('Display name'), 'the add form');
      await must(page.locator('#strength-label'), 'Strength');
      await must(page.getByRole('button', { name: 'hypertension' }).first(), 'suggested "hypertension"');
      await scrollToSection(page, h, 'text=Display name', 140);
    },
  }),
  // Full search with nothing found: "Nothing found" and the filled "Add ... as typed" button.
  stubbed('64a-meds-nothing-found', {
    ops: medsOps(FULL, [M1, M2]), rest: MEDS_REST([]), path: '/medications',
    async fn(page, h) {
      await (await must(page.getByLabel('Medication name (brand or generic)'), 'search box')).fill('Vitamin D');
      await (await must(page.getByRole('button', { name: /^search$/i }), 'Search')).click();
      await h.settle(700);
      await must(page.getByText(/Nothing found for/), 'nothing found');
      await must(page.getByRole('button', { name: /add .?vitamin d.? as typed/i }), 'Add as typed');
    },
  }),
  // "Add as typed" taken: the form opens with the typed name, no strength, no suggestions.
  stubbed('64b-meds-add-as-typed', {
    ops: medsOps(FULL, [M1, M2]), rest: MEDS_REST([]), path: '/medications',
    async fn(page, h) {
      await (await must(page.getByLabel('Medication name (brand or generic)'), 'search box')).fill('Vitamin D');
      await (await must(page.getByRole('button', { name: /^search$/i }), 'Search')).click();
      await h.settle(700);
      await (await must(page.getByRole('button', { name: /add .?vitamin d.? as typed/i }), 'Add as typed')).click();
      await h.settle(900);
      const name = await must(page.getByLabel('Display name'), 'the add form');
      if ((await name.inputValue()) !== 'Vitamin D') throw new Error('typed name did not carry over');
      await scrollToSection(page, h, 'text=Display name', 140);
    },
  }),
  // Yesterday's checklist: tap Yesterday, see "Yesterday's doses" with the one dose already ticked.
  stubbed('65-meds-yesterday', {
    ops: medsOps(heatherOps(HEATHER), [M1, M2]), path: '/medications',
    rest: {
      '**/api/meds/logs/by-date*': (r) => {
        const date = new URL(r.request().url()).searchParams.get('date');
        const y = daysAgoIso(1);
        const rows = date === y
          ? [{ _id: 'ml-y', medication_id: 'm2', time_of_day: 'morning', taken: true, log_date: `${y}T00:00:00.000Z`, created_at: at(1, 9, 5) }]
          : [];
        return json(r, { success: true, data: rows });
      },
    },
    async fn(page, h) {
      await must(page.getByText('Today’s doses'), 'today heading');
      await (await must(page.getByRole('button', { name: 'Yesterday', exact: true }), 'Yesterday')).click();
      await h.settle(900);
      await must(page.getByText('Yesterday’s doses'), 'yesterday heading');
      await must(page.getByText(/^Showing yesterday/), 'which day it is showing');
      const ticked = page.getByRole('checkbox', { name: /vitamin d.*taken/i });
      await must(ticked, 'Vitamin D ticked for yesterday');
      await scrollToSection(page, h, 'text=Yesterday’s doses', 220);
    },
  }),
];

// ── Reports ─────────────────────────────────────────────────────────────
const WHEN = at(0, 9, 40);
const WEEKLY = {
  fitnessInsightsWeeklyReport: {
    type: 'weekly_report', generatedAt: WHEN, context: { daysAnalyzed: 7 },
    content: 'You stayed close to your target on most days this week.\n\n- Protein averaged 162 g, a little under the 178 g goal.\n- Thursday ran over, at about 1,980 cal.\n- Breakfast was the steadiest meal.\n\nA second serving of vegetables at dinner would help with fiber.',
  },
};
const TREND = {
  fitnessInsightsTrendWatch: {
    type: 'trend_watch', generatedAt: WHEN, context: { daysAnalyzed: 30 },
    content: 'Your 7-day weight average is down about 1.1 lb over the month.\n\n- Calories are creeping up on weekends.\n- Fiber has held near 22 g.\n\nNothing here needs action.',
  },
};
const REPORT_OPS = { ...OPS, GetWeeklyInsightReport: WEEKLY, GetTrendWatch: TREND };
const BASE_OVERVIEW = OPS.GetFoodReportOverview.fitnessFoodReportOverview;
const EMPTY_OPS = {
  ...OPS,
  GetFoodReportOverview: {
    fitnessFoodReportOverview: { ...BASE_OVERVIEW, daily: [], days_logged: 0, averages: {}, meals: {}, topFoods: [], goalCompliance: {} },
  },
};

const reports = [
  // Reports from the top: Food is the first section, and the range toggle lives in its header.
  stubbed('66-reports-food', {
    ops: REPORT_OPS, path: '/reports',
    async fn(page) {
      const food = await must(page.locator('[data-testid="reports-food"]'), 'Food section');
      const first = await food.boundingBox();
      const body = await page.locator('#body-recovery').boundingBox();
      if (body && body.y < first.y) throw new Error('Body and recovery is above Food');
      await must(page.locator('[data-testid="report-days-logged"]'), 'days logged line');
      await must(page.locator('[data-testid="meal-row"]').first(), 'meal rows');
    },
  }),
  // The day ribbon: first card whole, status words, and the plum edge on the two over days.
  stubbed('66a-reports-ribbon', {
    ops: REPORT_OPS, path: '/reports',
    async fn(page, h) {
      const cards = page.locator('[data-testid="day-card"]');
      if ((await cards.count()) < 5) throw new Error(`expected 5 day cards, got ${await cards.count()}`);
      const over = await page.locator('[data-testid="day-card"][data-over="true"]').count();
      if (over !== 2) throw new Error(`expected 2 over days, got ${over}`);
      const words = (await page.locator('[data-testid="day-status"]').allInnerTexts()).join('|');
      for (const w of ['Over', 'A bit over', 'On target']) if (!words.includes(w)) throw new Error(`no "${w}" status in: ${words}`);
      await scrollToSection(page, h, '[data-testid="day-ribbon-range"]', 96);
      const box = await cards.first().boundingBox();
      const vw = page.viewportSize().width;
      if (!box || box.x < 0 || box.x + box.width > vw + 0.5) throw new Error(`first day card is cut off (x ${box && Math.round(box.x)}, w ${box && Math.round(box.width)}, view ${vw})`);
    },
  }),
  // Notes from the AI: Summary and Trends with content, each ending in its "Written by AI ... can be wrong" footer.
  stubbed('66b-reports-ai-notes', {
    ops: REPORT_OPS, path: '/reports',
    async fn(page, h) {
      await must(page.locator('[data-testid="weekly-ai"]'), 'Summary panel');
      await must(page.locator('[data-testid="trend-ai"]'), 'Trends panel');
      const feet = await page.locator('[data-testid="ai-note-footer"]').allInnerTexts();
      if (feet.length !== 2 || !feet.every((t) => /^Written by AI from your last \d+ days of logs · .*It can be wrong/.test(t))) {
        throw new Error(`footers: ${JSON.stringify(feet)}`);
      }
      await scrollToSection(page, h, '[data-testid="reports-ai-notes"]', 88);
    },
  }),
  // Nothing logged: the Summary and Trends say so in their own words, not the model's.
  stubbed('66c-reports-empty', {
    ops: EMPTY_OPS, path: '/reports',
    async fn(page, h) {
      const summary = await must(page.locator('[data-testid="weekly-ai-empty"]'), 'Summary empty line');
      if (!/Log a few days and I.ll write a summary here\./.test(await summary.innerText())) throw new Error('wrong summary empty text');
      const trends = await must(page.locator('[data-testid="trend-ai-empty"]'), 'Trends empty line');
      if (!/Nothing stands out yet\./.test(await trends.innerText())) throw new Error('wrong trends empty text');
      await scrollToSection(page, h, '[data-testid="reports-ai-notes"]', 88);
    },
  }),
  // Body and recovery with Garmin on: the header's window line, then the cards (07s-07u shoot the groups).
  stubbed('66d-reports-garmin-header', {
    ops: REPORT_OPS, path: '/reports', wait: 2000,
    async fn(page, h) {
      await must(page.locator('[data-testid="trend-restingHR"]'), 'resting HR card');
      await scrollToSection(page, h, '#body-recovery', 88);
    },
  }),
  // Home (Full) AI card opened on Advice: the content and its footer line.
  stubbed('69-home-ai-advice', {
    ops: {
      ...OPS,
      GetCoaching: {
        fitnessInsightsCoaching: {
          type: 'coaching', generatedAt: WHEN, context: { daysAnalyzed: 14 },
          content: 'Your protein is steady, which is the hard part.\n\n- Add a snack with 15 g of protein in the afternoon.\n- Keep weighing in; the average is moving the right way.',
        },
      },
    },
    path: '/dashboard',
    async fn(page, h) {
      await (await must(page.getByRole('button', { name: 'Advice', exact: true }), 'Advice chip')).click();
      await h.settle(1200);
      const foot = await must(page.locator('[data-testid="ai-note-footer"]'), 'footer line');
      if (!/Written by AI from your last 14 days of logs/.test(await foot.first().innerText())) throw new Error('footer does not say what it was written from');
      await foot.first().scrollIntoViewIfNeeded();
      await scrollToSection(page, h, '[data-testid="ai-note-footer"]', 460);
    },
  }),
];

// ── Blood pressure ──────────────────────────────────────────────────────
// 14 readings over the last 7 days: 7 elevated (126/78), 6 stage 1 (131/80),
// and the newest a normal 118/74 this morning at 7:42.
const BP14 = [
  { id: 'bp-now', systolic: 118, diastolic: 74, pulse: 64, measured_at: at(0, 7, 42), log_date: `${daysAgoIso(0)}T00:00:00.000Z` },
  ...Array.from({ length: 7 }, (_, i) => ({ id: `bp-e${i}`, systolic: 126, diastolic: 78, pulse: 66, measured_at: at((i % 6) + 1, 8, 10 + i), log_date: `${daysAgoIso((i % 6) + 1)}T00:00:00.000Z` })),
  ...Array.from({ length: 6 }, (_, i) => ({ id: `bp-s${i}`, systolic: 131, diastolic: 80, pulse: 68, measured_at: at(i + 1, 19, 30 + i), log_date: `${daysAgoIso(i + 1)}T00:00:00.000Z` })),
].map((b) => ({ __typename: 'BloodPressure', notes: null, formatted_date: b.log_date.slice(0, 10), status: null, ...b }));
const BP_OPS = { ...OPS, GetBps: { bloodPressures: BP14 } };

const DUPLICATE_ERROR = (r) => {
  let op = null;
  try { op = JSON.parse(r.request().postData() || '{}').operationName; } catch { /* not ours */ }
  if (op !== 'AddBp') return r.fallback();
  return json(r, { data: null, errors: [{ message: 'Duplicate blood pressure reading', extensions: { code: 'BP_DUPLICATE' } }] });
};

const openBpDialog = async (page, h) => {
  const fab = await must(page.locator('[data-testid="add-bp-fab"]'), 'Log BP button');
  await fab.click();
  await h.settle(800);
  return must(page.getByRole('dialog'), 'BP dialog');
};

const bloodPressure = [
  // The BP page: the week's average in words, last reading, "1 of 14" in the healthy range.
  stubbed('67-bp-week', {
    ops: BP_OPS, path: '/blood-pressure', wait: 1800,
    async fn(page) {
      const head = await must(page.locator('[data-testid="bp-headline"]'), 'headline');
      if (!/Your average this week: 128\/79 — a little high \(elevated\)/.test(await head.innerText())) throw new Error(`headline: ${await head.innerText()}`);
      const last = await must(page.locator('[data-testid="bp-last-reading"]'), 'last reading');
      if (!/^Last reading 118\/74 · normal · today 7:42\s?AM$/.test((await last.innerText()).replace(/\s+/g, ' '))) throw new Error(`last reading: ${await last.innerText()}`);
      const healthy = await must(page.locator('[data-testid="bp-healthy-range"]'), 'healthy range');
      if (!/1 of 14 readings/.test(await healthy.innerText())) throw new Error(`healthy range: ${await healthy.innerText()}`);
    },
  }),
  // The charts: range toggle above the donut, "Readings by range, last N days", and the plain legend.
  stubbed('67a-bp-donut', {
    ops: BP_OPS, path: '/blood-pressure', wait: 1800,
    async fn(page, h) {
      await must(page.locator('[data-testid="bp-range-toggle"]'), 'range toggle');
      const title = await must(page.locator('[data-testid="bp-donut-title"]'), 'donut title');
      if (!/^Readings by range, last \d+ days$/.test((await title.innerText()).trim())) throw new Error(`donut title: ${await title.innerText()}`);
      await must(page.locator('[data-testid="bp-donut-legend"]'), 'legend');
      const toggleTop = (await page.locator('[data-testid="bp-range-toggle"]').boundingBox()).y;
      const titleTop = (await title.boundingBox()).y;
      if (toggleTop > titleTop) throw new Error('the range toggle is below the donut');
      await scrollToSection(page, h, '[data-testid="bp-range-toggle"]', 88);
    },
  }),
  // The BP dialog (phone): three numbers, the time, and Save in the footer.
  stubbed('68-bp-dialog', {
    ops: BP_OPS, path: '/blood-pressure', wait: 1800, viewports: ['phone'], dialog: true,
    async fn(page, h) {
      const dialog = await openBpDialog(page, h);
      await must(dialog.getByLabel('Top number (systolic)'), 'systolic');
      await must(dialog.getByLabel('Bottom number (diastolic)'), 'diastolic');
      await must(dialog.locator('[data-testid="thumb-save"]'), 'Save in the footer');
    },
  }),
  // Same reading saved twice in a minute: the gateway says BP_DUPLICATE, the form says so with "Save it one minute later".
  stubbed('68a-bp-dialog-duplicate', {
    ops: BP_OPS, path: '/blood-pressure', wait: 1800, viewports: ['phone'], dialog: true,
    rest: { '**/graphql': DUPLICATE_ERROR },
    async fn(page, h) {
      const dialog = await openBpDialog(page, h);
      await dialog.getByLabel('Top number (systolic)').fill('128');
      await dialog.getByLabel('Bottom number (diastolic)').fill('82');
      await dialog.getByRole('button', { name: /^save$/i }).click();
      await h.settle(1200);
      await must(dialog.getByText('You already saved a reading at that time.'), 'duplicate message');
      await must(dialog.getByRole('button', { name: /^save it one minute later$/i }), 'Save it one minute later');
    },
  }),
];

export const scenes = [
  ...settingsSimple,
  ...settingsFull,
  ...quickTarget,
  ...medications,
  ...reports,
  ...bloodPressure,
];
export const tail = [];
