// Wave A scenes (settings, quick target, medications, Trends › Food, blood pressure).
// Prefix 6x: 60-61 Settings, 62 quick target, 63-65 medications,
// 66 Trends › Food, 67-68 blood pressure, 69 Today's AI card. See scenes.mjs.
//
// Every scene stubs for itself (page-scoped GraphQL ops, page.route for the
// REST ones) and takes the stubs down again whether it passes or throws: one
// page serves every scene of a viewport. Every anchor is a must(), so a UI
// that moved fails loudly instead of skipping.
import { json, graphqlRoute } from '../../lib/net.mjs';
import { withHistoryBounds } from './history-ops.mjs';
import { OPS, SETTINGS, USER, MEDS, experienceOf, opsWithPlan } from './fixtures.mjs';
import { scrollToSection, isoLocal } from './helpers.mjs';

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
        if (ops) await graphqlRoute(page, withHistoryBounds(ops));
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
// Chef, the context's own USER (44, 6'1", male). A scene that needs a
// different profile answer patches /api/me for itself.
const NO_AGE = { profile: { height: USER.profile.height, gender: USER.profile.gender } };
const absent = async (locator, what) => {
  if (await locator.count()) throw new Error(`still on the page: ${what}`);
};

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

// Chef with a name he chose, Garmin on with a login saved, household joined (SETTINGS).
const CHEF = {
  ...OPS,
  GetFitnessExperience: experienceOf({ first_run_done: true, preferred_name: 'Chef' }),
  GetFitnessUserSettings: {
    fitnessUserSettings: { ...SETTINGS, garmin: { ...SETTINGS.garmin, enabled: true, username: 'chef@example.com' } },
  },
};

// ── Settings: one page, nothing folded; one section in view per scene ───
const SETTINGS_PAGE = { ops: CHEF, profile: { email: 'chef@example.com' }, path: '/settings' };
const settingsScenes = [
  // Settings from the top: How it looks, About you, Plans and imports, then
  // everything else — no "More settings" fold, and no Simple / Full chooser.
  stubbed('61-settings', {
    ...SETTINGS_PAGE,
    async fn(page) {
      const autosave = (await (await must(page.locator('[data-testid="settings-autosave"]'), 'the autosave line')).innerText()).trim();
      if (autosave !== 'Changes save as you make them.') throw new Error(`the autosave line reads "${autosave}"`);
      await must(page.locator('[data-testid="experience-settings"]'), 'How it looks');
      await must(page.locator('[data-testid="about-you"]'), 'About you');
      // The fixture plan is a weight-loss plan.
      if ((await page.getByRole('radio', { name: /^Lose weight/ }).getAttribute('aria-checked')) !== 'true') throw new Error('"Lose weight" is not the chosen goal');
      const plans = await must(page.locator('[data-testid="settings-plans"]'), 'Plans and imports');
      await must(plans.getByRole('link', { name: /Calorie plan/ }), 'the way to the calorie plan');
      await must(page.locator('[data-testid="settings-devices"]').getByRole('link', { name: /Import a scan/ }), 'the way to Import a scan (under Connected devices)');
      await absent(page.getByRole('button', { name: /^more settings$/i }), 'the "More settings" fold');
      await absent(page.locator('#more-settings'), 'the "More settings" fold');
      for (const gone of ['mode-simple', 'mode-full', 'simple-view-line']) await absent(page.locator(`[data-testid="${gone}"]`), gone);
      // What the fold used to hide is simply on the page.
      for (const id of ['household', 'garmin', 'health-alerts', 'account']) await must(page.locator(`#${id}`), `#${id}, with nothing to open first`);
      const order = await page.evaluate(() => ['looks', 'you', 'plans', 'household', 'garmin', 'health-alerts', 'account']
        .map((id) => [id, document.getElementById(id)?.getBoundingClientRect().top ?? null]));
      const tops = order.map(([, y]) => y);
      if (tops.some((y) => y === null) || tops.some((y, i) => i && y <= tops[i - 1])) throw new Error(`Settings sections are out of order: ${JSON.stringify(order)}`);
      const name = await page.getByLabel('What should I call you?').inputValue();
      if (name !== 'Chef') throw new Error(`name field says "${name}", wanted Chef`);
    },
  }),
  // The same page scrolled to About you: the name, the goal and age, height and sex, filled from /api/me.
  stubbed('60a-settings-you', {
    ...SETTINGS_PAGE,
    async fn(page, h) {
      await must(page.getByLabel('Age'), 'Age field');
      if ((await page.getByLabel('Age').inputValue()) !== '44') throw new Error('Age did not fill from the profile');
      await scrollToSection(page, h, '[data-testid="about-you"] >> text=Used to work out your calorie target.', 160);
    },
  }),
  // Plans and imports: the two pages with no row in the navigation.
  stubbed('61f-settings-plans', {
    ...SETTINGS_PAGE,
    async fn(page, h) {
      const plans = await must(page.locator('[data-testid="settings-plans"]'), 'Plans and imports');
      await must(plans.getByRole('heading', { name: 'Calorie plan', level: 2 }), 'its heading');
      if ((await plans.getByRole('link', { name: /Calorie plan/ }).getAttribute('href')) !== '/calorie-wizard') throw new Error('Calorie plan does not go to /calorie-wizard');
      const devices = await must(page.locator('[data-testid="settings-devices"]'), 'Connected devices');
      if ((await devices.getByRole('link', { name: /Import a scan/ }).getAttribute('href')) !== '/scan-import') throw new Error('Import a scan does not go to /scan-import');
      await scrollToSection(page, h, '#plans', 96);
    },
  }),
  // Household, joined: the member list and what is shared.
  stubbed('61a-settings-household', {
    ...SETTINGS_PAGE,
    async fn(page, h) { await must(page.locator('#household'), '#household'); await scrollToSection(page, h, '#household', 80); },
  }),
  // Garmin on with a login saved: the button offers to update it, never "Connect".
  stubbed('61b-settings-garmin', {
    ...SETTINGS_PAGE,
    async fn(page, h) {
      const connected = await must(page.locator('[data-testid="garmin-connected"]'), 'the "Connected as" line');
      if (!/^Connected as chef@example\.com$/.test((await connected.innerText()).trim())) throw new Error('garmin-connected does not read "Connected as chef@example.com"');
      // The login form is behind "Change Garmin login" now.
      await (await must(page.getByRole('button', { name: 'Change Garmin login' }), 'the "Change Garmin login" button')).click();
      await h.settle(500);
      await must(page.getByRole('button', { name: 'Update Garmin login', exact: true }), '"Update Garmin login" (it said "Save", d-fixes)');
      await must(page.getByText('Your Garmin password is kept encrypted.'), 'the password helper line');
      if (await page.getByRole('button', { name: /^connect garmin$/i }).count()) throw new Error('"Connect Garmin" showing for a saved login');
      if ((await page.getByLabel('Garmin email').inputValue()) !== 'chef@example.com') throw new Error('Garmin email did not fill');
      await scrollToSection(page, h, '#garmin', 80);
    },
  }),
  // Health alerts: the sleep apnea suggestion switch and its caveat.
  stubbed('61c-settings-alerts', {
    ...SETTINGS_PAGE,
    async fn(page, h) {
      await must(page.getByLabel('Tell me if my overnight breathing looks worth mentioning to a doctor'), 'the overnight-breathing switch');
      await scrollToSection(page, h, '#health-alerts', 80);
    },
  }),
  // Account at the bottom: who is signed in, and Sign out.
  stubbed('61d-settings-account', {
    ...SETTINGS_PAGE,
    async fn(page, h) {
      const email = await must(page.locator('[data-testid="account-email"]'), 'account email');
      if (!/chef@example\.com/.test(await email.innerText())) throw new Error('account email did not come from /api/me');
      await scrollToSection(page, h, '#account', 120);
    },
  }),
  // /profile redirects to /settings#you, and About you is the section in view.
  stubbed('61e-profile-lands-on-you', {
    ops: CHEF, profile: { email: 'chef@example.com' }, path: '/profile',
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
// The one-screen target, reached with ?quick=1 (Today's "Set your daily
// target" links there); /calorie-wizard without the flag is the four-step
// wizard for everybody (scenes 16 and 17).
const QUICK = '/calorie-wizard?quick=1';
const SAVED_TARGET = { ...opsWithPlan({ enabled: true, daily_calorie_target: 1950, weekly_schedule: Array(7).fill(1950), bmr: 1500, tdee: 2300 }), GetFitnessWeights: { fitnessWeights: DAILY_WEIGHTS } };
const NO_TARGET = { ...opsWithPlan({ enabled: false, daily_calorie_target: null, bmr: null, tdee: null }), GetFitnessWeights: { fitnessWeights: DAILY_WEIGHTS } };

const quickTarget = [
  // Quick target with a target already saved: it knows everything, so it says one sentence.
  stubbed('62-quick-target', {
    ops: SAVED_TARGET, path: QUICK,
    async fn(page) {
      await must(page.locator('[data-testid="quick-target"]'), 'quick target');
      if (await page.getByText('Approach', { exact: true }).count()) throw new Error('the four-step stepper showed with ?quick=1');
      const known = await must(page.locator('[data-testid="quick-known"]'), 'the "Using ..." line');
      const text = await known.innerText();
      if (!/7-day average/.test(text) || !/age 44/.test(text)) throw new Error(`quick-known says "${text}"`);
      const current = await must(page.locator('[data-testid="quick-current-target"]'), 'current target line');
      if (!/1,950/.test(await current.innerText())) throw new Error('current target is not 1,950');
      const result = await must(page.locator('[data-testid="quick-result"]'), 'the one sentence');
      if (!/Your daily target: [\d,]+ calories\./.test(await result.innerText())) throw new Error('no one-sentence answer');
      if (await page.getByLabel('Your age').count()) throw new Error('asked for an age it already has');
    },
  }),
  // The same, with "How this was worked out" open: the BMR and TDEE card.
  stubbed('62a-quick-target-working', {
    ops: SAVED_TARGET, path: QUICK,
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
    ops: SAVED_TARGET, profile: NO_AGE, path: QUICK,
    async fn(page) {
      await must(page.getByLabel('Your age'), 'the age question');
      for (const asked of ['Your weight now (lb)', 'Your height']) {
        if (await page.getByLabel(asked).count()) throw new Error(`also asked "${asked}"`);
      }
      if (await page.locator('[data-testid="quick-result"]').count()) throw new Error('an answer before the age was given');
    },
  }),
  // First visit (no target yet): "Set your daily target", the speeds, then the answer.
  stubbed('62c-quick-target-first', {
    ops: NO_TARGET, path: QUICK,
    async fn(page) {
      await must(page.getByRole('heading', { name: /set your daily target/i }), 'heading');
      await must(page.locator('[data-testid="quick-speed-1"]'), 'Steady speed');
      if (await page.locator('[data-testid="quick-current-target"]').count()) throw new Error('"target now" with no target saved');
      await must(page.locator('[data-testid="quick-result"]'), 'the answer');
    },
  }),
];

// ── Medications ─────────────────────────────────────────────────────────
// One page: today's ticks, one "Add a medication" button, one dialog (the
// name with live suggestions, when it is taken, and "More details" holding
// Strength, Type and what it is for). The inline "Find a medication" search
// and the inline editor are gone.
const M1 = { ...MEDS[0], id: 'm1', display_name: 'Lisinopril', times_of_day: ['morning'] };
const M2 = { ...MEDS[1], id: 'm2', display_name: 'Vitamin D', med_type: 'supplement', times_of_day: [] };
const LISIN = [{ rxcui: '29046', name: 'Lisinopril' }, { rxcui: '314076', name: 'Lisinopril 10 MG Oral Tablet' }];
const noLogs = (r) => json(r, { success: true, data: [] });
const searchOf = (rows) => (r) => json(r, { success: true, data: rows });
const DETAILS = (r) => json(r, { success: true, data: { strengths: [{ rxcui: '314076', name: '10 MG' }], suggested: ['hypertension'] } });
const medsOps = (meds) => ({ ...OPS, GetFitnessMedications: { fitnessMedications: meds } });
const MEDS_REST = (rows = []) => ({ '**/api/meds/logs/by-date*': noLogs, '**/api/meds/search*': searchOf(rows), '**/api/meds/rxcui/*': DETAILS });

const openAdd = async (page, h) => {
  const add = page.getByRole('button', { name: /^add a medication$/i });
  await must(add, 'Add a medication');
  if ((await add.count()) !== 1) throw new Error(`${await add.count()} "Add a medication" buttons; there is one`);
  await add.click();
  await h.settle(700);
  const dialog = await must(page.getByRole('dialog'), 'the add dialog');
  await must(dialog.getByRole('heading', { name: 'Add a medication' }), 'the dialog title');
  return dialog;
};
const moreDetails = (dialog) => dialog.locator('button[aria-controls="med-more-details"]');
const noInlineForms = async (page) => {
  await absent(page.getByLabel('Medication name (brand or generic)'), 'the inline "Find a medication" search box');
  await absent(page.getByRole('button', { name: /^search$/i }), 'the inline Search button');
  await absent(page.locator('main').getByLabel('Display name'), 'the inline medication editor');
};

const medications = [
  // Medications, empty: one sentence and one big Add.
  stubbed('63-meds-empty', {
    ops: medsOps([]), rest: MEDS_REST(), path: '/medications',
    async fn(page) {
      await must(page.getByText('No medications yet'), 'empty title');
      const add = page.getByRole('button', { name: /^add a medication$/i });
      await must(add, 'Add a medication');
      if ((await add.count()) !== 1) throw new Error(`${await add.count()} "Add a medication" buttons; there is one`);
      await noInlineForms(page);
      // Nothing to export yet.
      await absent(page.getByRole('button', { name: 'Download PDF' }), 'export buttons with no list');
    },
  }),
  // With medications: today's doses to tick, the one Add, the list by time of
  // day, and the export buttons for everybody.
  stubbed('63d-meds-list', {
    ops: medsOps([M1, M2]), rest: MEDS_REST(), path: '/medications',
    async fn(page) {
      await must(page.getByText('Today’s doses'), 'today’s doses');
      await must(page.locator('[data-testid="meds-checklist"]'), 'the dose ticks');
      const add = page.getByRole('button', { name: /^add a medication$/i });
      if ((await add.count()) !== 1) throw new Error(`${await add.count()} "Add a medication" buttons; there is one`);
      await must(page.getByRole('heading', { name: 'Your medications, by time of day' }), 'the list');
      for (const name of ['Copy text', 'Download .txt', 'Download PDF']) await must(page.getByRole('button', { name, exact: true }), `export: ${name}`);
      await must(page.getByRole('button', { name: 'Edit Lisinopril' }), 'Edit on a row');
      await noInlineForms(page);
    },
  }),
  // The add dialog, typing "lisin": the RxNorm suggestions appear under the name after the 300ms pause.
  stubbed('63a-meds-suggest', {
    ops: medsOps([]), rest: MEDS_REST(LISIN), path: '/medications', dialog: true,
    async fn(page, h) {
      const dialog = await openAdd(page, h);
      const box = await must(dialog.locator('#simple-med-name'), 'name box');
      await box.pressSequentially('lisin', { delay: 40 });
      await h.settle(800);
      await must(dialog.getByRole('list', { name: 'Suggestions' }), 'suggestion list');
      // Names are tidied for display: "Lisinopril 10 MG Oral Tablet" -> "Lisinopril 10 mg tablet".
      await must(dialog.getByText('Lisinopril 10 mg tablet', { exact: true }), 'second suggestion, tidied');
      await absent(dialog.getByText('Lisinopril 10 MG Oral Tablet'), 'the raw RxNorm name');
      const more = await must(moreDetails(dialog), '"More details"');
      if ((await more.getAttribute('aria-expanded')) !== 'false') throw new Error('"More details" should start closed');
      await absent(dialog.locator('#med-more-details'), 'Strength / Type / what it’s for, before "More details" is opened');
    },
  }),
  // "Vitamin D" typed (RxNorm knows nothing, and that is fine: a typed name
  // saves), Morning and Bedtime picked, Save in the footer.
  stubbed('63b-meds-add-filled', {
    ops: medsOps([]), rest: MEDS_REST([]), path: '/medications', dialog: true,
    async fn(page, h) {
      const dialog = await openAdd(page, h);
      await dialog.locator('#simple-med-name').fill('Vitamin D');
      await h.settle(700);
      await absent(dialog.getByRole('list', { name: 'Suggestions' }), 'suggestions for a name RxNorm does not know');
      await absent(dialog.getByText(/nothing found/i), 'a "Nothing found" dead end');
      // No "Once a day" button: with no time chosen the hint says what that means.
      await absent(dialog.getByRole('button', { name: 'Once a day', exact: true }), 'a "Once a day" button');
      const hint = dialog.locator('[data-testid="med-when-hint"]');
      if ((await (await must(hint, 'the when-hint')).first().innerText()).trim() !== 'No set time? Leave these off and it’s once a day.') throw new Error(`the hint reads "${await hint.first().innerText()}"`);
      for (const slot of ['Morning', 'Bedtime']) {
        const t = dialog.getByRole('button', { name: slot, exact: true });
        await (await must(t, `${slot} toggle`)).click();
        if ((await t.getAttribute('aria-pressed')) !== 'true') throw new Error(`${slot} did not select`);
      }
      if ((await hint.first().innerText()).trim() !== 'You’ll tick it 2 times a day.') throw new Error(`with two times chosen the hint reads "${await hint.first().innerText()}"`);
      const save = dialog.getByRole('button', { name: /^save$/i });
      await must(save, 'Save');
      if (await save.isDisabled()) throw new Error('Save is off for a typed name');
      // Full-screen (under 600px wide) Save lives in the thumb-zone footer
      // (thumb-save). At 600px and up the dialog is a window, so there is no
      // thumb-save: Save is the window's primary action and must sit inside
      // the viewport without scrolling the page.
      if (h.width < 600) {
        await must(dialog.locator('[data-testid="thumb-save"]'), 'Save in the footer');
      } else {
        if (await dialog.locator('[data-testid="thumb-save"]').count()) throw new Error('windowed dialog drew the phone footer');
        const box = await save.boundingBox();
        if (!box || box.y < 0 || box.y + box.height > h.height || box.x < 0 || box.x + box.width > h.width) throw new Error(`Save is not in view: ${JSON.stringify(box)}`);
      }
      await save.scrollIntoViewIfNeeded();
    },
  }),
  // Today with no medications: the quiet "Track your meds" way in.
  stubbed('63c-home-track-meds', {
    ops: medsOps([]), rest: MEDS_REST(), path: '/dashboard',
    async fn(page, h) {
      await must(page.locator('[data-testid="track-meds"]'), 'Track your meds');
      await absent(page.locator('[data-testid="meds-checklist"]'), 'a meds checklist with no medications');
      await scrollToSection(page, h, '[data-testid="track-meds"]', 360);
    },
  }),
  // The add dialog with "More details" open, after picking "Lisinopril 10 MG
  // Oral Tablet": Strength, Type, and the suggested "hypertension".
  stubbed('64-meds-add-details', {
    ops: medsOps([M1, M2]), rest: MEDS_REST(LISIN), path: '/medications', dialog: true,
    async fn(page, h) {
      const dialog = await openAdd(page, h);
      await dialog.locator('#simple-med-name').pressSequentially('lisin', { delay: 40 });
      await h.settle(800);
      await (await must(dialog.getByRole('list', { name: 'Suggestions' }).getByText('Lisinopril 10 mg tablet', { exact: true }), 'the suggestion')).click();
      await h.settle(900);
      const name = await dialog.locator('#simple-med-name').inputValue();
      if (name !== 'Lisinopril 10 mg tablet') throw new Error(`picking a suggestion left the name as "${name}", wanted the tidied "Lisinopril 10 mg tablet"`);
      const more = await must(moreDetails(dialog), '"More details"');
      // A pick that comes with strengths or a suggested use opens the details
      // itself, so the strength is not saved unseen.
      if ((await more.getAttribute('aria-expanded')) !== 'true') throw new Error('"More details" did not open for a pick that has strengths');
      const details = await must(dialog.locator('#med-more-details'), 'the details');
      await must(details.locator('#strength-label'), 'Strength');
      await must(details.locator('#type-label'), 'Type');
      await must(details.getByRole('button', { name: 'hypertension' }).first(), 'suggested "hypertension"');
      await must(details.getByLabel('Add what it’s for'), 'what it’s for');
      await more.scrollIntoViewIfNeeded();
      await h.settle(300);
    },
  }),
  // The name lookup is down: the dialog says so in a sentence, and a typed
  // name still saves. (This is what "Nothing found … Add as typed" became.)
  stubbed('64a-meds-lookup-down', {
    ops: medsOps([M1, M2]), path: '/medications', dialog: true,
    rest: { ...MEDS_REST(), '**/api/meds/search*': (r) => json(r, { success: false, error: { message: 'RxNorm is not answering' } }, 502) },
    async fn(page, h) {
      const dialog = await openAdd(page, h);
      await dialog.locator('#simple-med-name').pressSequentially('Vitamin D', { delay: 40 });
      await h.settle(1200);
      await must(dialog.getByText(/I can’t look names up right now\. Type it and save, that’s fine\./), 'the lookup-down line');
      if (await dialog.getByRole('button', { name: /^save$/i }).isDisabled()) throw new Error('Save is off while the lookup is down');
    },
  }),
  // Edit goes through the same dialog: "Edit medication", the name and its
  // times filled in, the same "More details".
  stubbed('64c-meds-edit', {
    ops: medsOps([M1, M2]), rest: MEDS_REST(), path: '/medications', dialog: true,
    async fn(page, h) {
      await (await must(page.getByRole('button', { name: 'Edit Lisinopril' }), 'Edit on the Lisinopril row')).click();
      await h.settle(800);
      const dialog = await must(page.getByRole('dialog'), 'the edit dialog');
      await must(dialog.getByRole('heading', { name: 'Edit medication' }), 'the dialog title');
      if ((await dialog.locator('#simple-med-name').inputValue()) !== 'Lisinopril') throw new Error('the name did not carry into the dialog');
      if ((await dialog.getByRole('button', { name: 'Morning', exact: true }).getAttribute('aria-pressed')) !== 'true') throw new Error('Morning is not selected for a morning medication');
      await must(moreDetails(dialog), '"More details"');
      await absent(page.locator('main').getByLabel('Display name'), 'the inline medication editor');
    },
  }),
  // Yesterday's checklist: tap Yesterday, see "Yesterday's doses" with the one dose already ticked.
  stubbed('65-meds-yesterday', {
    ops: medsOps([M1, M2]), path: '/medications',
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

// ── Trends › Food (was Reports) ─────────────────────────────────────────────────────────────
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

// The CSV export is a quiet text button at the foot of Food, in words.
const assertDownloadAtFoot = async (page) => {
  const dl = await must(page.locator('[data-testid="reports-download"]'), 'the download button');
  if ((await dl.first().innerText()).trim() !== 'Download as a spreadsheet') throw new Error(`the download button reads "${await dl.first().innerText()}"`);
  if (await page.getByText('Export CSV').count()) throw new Error('"Export CSV" is still on the page');
  const top = (await dl.first().boundingBox())?.y;
  const food = (await page.locator('[data-testid="meal-row"]').first().boundingBox())?.y;
  if (top == null || food == null || top < food) throw new Error('the download is not below the report');
};

const reports = [
  // Trends › Food from the top: Food is the first section, and the range toggle lives in its header.
  stubbed('66-reports-food', {
    ops: REPORT_OPS, path: '/trends?tab=food',
    async fn(page) {
      const food = await must(page.locator('[data-testid="reports-food"]'), 'Food section');
      const first = await food.boundingBox();
      const body = await page.locator('#body-recovery').boundingBox();
      if (body && body.y < first.y) throw new Error('Body and recovery is above Food');
      await must(page.locator('[data-testid="report-days-logged"]'), 'days logged line');
      await must(page.locator('[data-testid="meal-row"]').first(), 'meal rows');
      await assertDownloadAtFoot(page);
    },
  }),
  // The day ribbon: first card whole, status words, and the plum edge on the two over days.
  stubbed('66a-reports-ribbon', {
    ops: REPORT_OPS, path: '/trends?tab=food',
    async fn(page, h) {
      const cards = page.locator('[data-testid="day-card"]');
      if ((await cards.count()) < 5) throw new Error(`expected 5 day cards, got ${await cards.count()}`);
      const over = await page.locator('[data-testid="day-card"][data-over="true"]').count();
      if (over !== 2) throw new Error(`expected 2 over days, got ${over}`);
      // Each card says how its day sat against the target as a fact: "On
      // target", "165 over" or "300 under" (no "a bit over" bands).
      const statusOf = (loc) => loc.locator('[data-testid="day-status"]').allInnerTexts().then((t) => t.map((x) => x.trim()));
      const tags = await statusOf(page);
      if (!tags.every((t) => t === 'On target' || /^\d[\d,]* (over|under)$/.test(t))) throw new Error(`unexpected day statuses: ${tags.join('|')}`);
      if (!tags.includes('On target')) throw new Error(`no "On target" day in: ${tags.join('|')}`);
      const overTags = await statusOf(page.locator('[data-testid="day-card"][data-over="true"]'));
      if (overTags.length !== 2 || !overTags.every((t) => /^\d[\d,]* over$/.test(t))) throw new Error(`the two over days should read "N over": ${overTags.join('|')}`);
      const underTags = tags.filter((t) => /under$/.test(t));
      if (underTags.some((t) => !/^\d[\d,]* under$/.test(t))) throw new Error(`under days read ${underTags.join('|')}`);
      // The macros are three labelled numbers, never "P 165 · C 141".
      const macros = (await cards.first().locator('[data-testid="day-macros"]').innerText()).replace(/\s+/g, ' ').trim();
      if (!/^\d+g Protein \d+g Carbs \d+g Fat$/.test(macros)) throw new Error(`day macros read "${macros}"`);
      if (/P \d+ · C \d+/.test(await cards.first().innerText())) throw new Error('a day card still uses P/C/F initials');
      await scrollToSection(page, h, '[data-testid="day-ribbon-range"]', 96);
      const box = await cards.first().boundingBox();
      const vw = page.viewportSize().width;
      if (!box || box.x < 0 || box.x + box.width > vw + 0.5) throw new Error(`first day card is cut off (x ${box && Math.round(box.x)}, w ${box && Math.round(box.width)}, view ${vw})`);
    },
  }),
  // Notes from the AI: Summary and Trends with content, each ending in its "Written by AI ... can be wrong" footer.
  stubbed('66b-reports-ai-notes', {
    ops: REPORT_OPS, path: '/trends?tab=food',
    async fn(page, h) {
      await must(page.locator('[data-testid="weekly-ai"]'), 'Summary panel');
      const second = await must(page.locator('[data-testid="trend-ai"]'), 'the second notes card');
      const secondTitle = (await second.first().getByRole('heading').first().innerText()).trim();
      if (secondTitle !== 'Patterns') throw new Error(`the second card is titled "${secondTitle}", wanted "Patterns"`);
      const feet = await page.locator('[data-testid="ai-note-footer"]').allInnerTexts();
      if (feet.length !== 2 || !feet.every((t) => /^Written by AI from your last \d+ days of logs · .*It can be wrong/.test(t))) {
        throw new Error(`footers: ${JSON.stringify(feet)}`);
      }
      await scrollToSection(page, h, '[data-testid="reports-ai-notes"]', 88);
    },
  }),
  // Nothing logged: ONE empty state, in the app's own words, instead of a card each saying so.
  stubbed('66c-reports-empty', {
    ops: EMPTY_OPS, path: '/trends?tab=food',
    async fn(page, h) {
      // Said ONCE, in one place: no AI notes, no per-card empties, no averages.
      for (const gone of ['weekly-ai-empty', 'trend-ai-empty', 'reports-ai-notes']) await absent(page.locator(`[data-testid="${gone}"]`), gone);
      await absent(page.locator('[data-testid^="average-"]'), 'the average tiles');
      await absent(page.getByText(/Nothing stands out/), '"Nothing stands out"');
      const empty = await must(page.locator('[data-testid="reports-empty"]'), 'the one empty state');
      const text = (await empty.first().innerText()).replace(/\s+/g, ' ');
      if (!/Nothing logged in the last 7 days/.test(text)) throw new Error(`empty state reads "${text}"`);
      if (!/Log a few days and you’ll see how they compare here\./.test(text)) throw new Error(`empty state reads "${text}"`);
      await must(empty.first().getByRole('link', { name: 'Log food' }), 'its "Log food" link');
      await scrollToSection(page, h, '[data-testid="reports-empty"]', 120);
    },
  }),
  // Body and recovery with Garmin on: the header's window line, then the cards (07s-07u shoot the groups).
  stubbed('66d-reports-garmin-header', {
    ops: REPORT_OPS, path: '/trends?tab=food', wait: 2000,
    async fn(page, h) {
      await must(page.locator('[data-testid="trend-restingHR"]'), 'resting HR card');
      // The header names the week the cards compare with. It said "Sep 11–17"
      // above cards that each said "vs Sep 16–22" (d-fixes): the cards that
      // share the header's week say no dates of their own.
      const header = await page.locator('[data-testid="body-recovery-window"]').innerText();
      const garmin = ['restingHR', 'hrv', 'sleepScore', 'sleepHours', 'intensity', 'steps', 'stress'];
      const cards = await page.locator(garmin.map((k) => `[data-testid="trend-${k}"]`).join(', ')).allInnerTexts();
      if (cards.length !== garmin.length) throw new Error(`expected ${garmin.length} Garmin cards, saw ${cards.length}`);
      h.log(`header: ${header}`);
      // A card whose own history forces a different week still names it; the
      // header's week is the one most cards share, so those are the minority.
      const own = cards.filter((t) => /\bvs [A-Z][a-z]{2} \d/.test(t)).map((t) => t.match(/vs [^\n]+/)[0]);
      h.log(`cards naming their own week: ${JSON.stringify(own)}`);
      if (own.length * 2 >= cards.length) throw new Error(`most cards name a different week from the header ("${header}"): ${JSON.stringify(own)}`);
      const span = (header.match(/\(([^)]+)\)|week of ([^.]+)\./) || []).slice(1).find(Boolean);
      if (!span) throw new Error(`the header names no week: "${header}"`);
      if (own.some((v) => v.includes(span))) throw new Error(`a card repeats the header's week ${span}`);
      await scrollToSection(page, h, '#body-recovery', 88);
    },
  }),
  // Today's AI card opened on Advice: the content and its footer line.
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
      const words = (await head.innerText()).replace(/\s+/g, ' ').trim();
      if (!/^Your average this week is a little high\. Your last reading, today 7:42\s?AM, was normal\.$/.test(words)) throw new Error(`headline: ${words}`);
      const last = await must(page.locator('[data-testid="bp-last-reading"]'), 'last reading');
      if (!/Last reading\s*118\/74 · normal · today 7:42\s?AM/.test((await last.innerText()).replace(/\s+/g, ' '))) throw new Error(`last reading: ${await last.innerText()}`);
      const healthy = await must(page.locator('[data-testid="bp-healthy-range"]'), 'healthy range');
      if (!/In the normal range 1 of 14 readings\s*·\s*last 30 days/.test((await healthy.innerText()).replace(/\s+/g, ' '))) throw new Error(`healthy range: ${await healthy.innerText()}`);
      // At the very bottom of the page the "Log BP" button covers nothing:
      // the page leaves room under its last card (d-fixes).
      await page.evaluate(() => {
        const main = document.querySelector('main');
        if (main) main.scrollTop = main.scrollHeight;
        window.scrollTo(0, document.body.scrollHeight);
      });
      await page.waitForTimeout(500);
      const fab = await page.locator('[data-testid="add-bp-fab"]').boundingBox();
      if (fab) {
        const covered = await page.evaluate(({ x, y, w, hh }) => {
          const hits = [];
          // The Label's panels are plain bordered boxes (primitives/Surface.jsx
          // marks each one); with none found this check would prove nothing.
          const panels = document.querySelectorAll('main [data-fg-panel="card"], main .MuiCard-root, main [class*="MuiPaper-root"]');
          if (!panels.length) return ['no panels found to check'];
          panels.forEach((el) => {
            const r = el.getBoundingClientRect();
            if (r.width && r.x < x + w && x < r.right && r.y < y + hh && y < r.bottom) hits.push(`${Math.round(r.y)}-${Math.round(r.bottom)}`);
          });
          return hits;
        }, { x: fab.x, y: fab.y, w: fab.width, hh: fab.height });
        if (covered.length) throw new Error(`at the bottom, Log BP covers a card: ${covered.join(', ')}`);
        await page.evaluate(() => { const m = document.querySelector('main'); if (m) m.scrollTop = 0; window.scrollTo(0, 0); });
        await page.waitForTimeout(300);
      }
    },
  }),
  // The readings by range: the range toggle above, "Readings by range, last N days", and a labelled bar per range (no donut).
  stubbed('67a-bp-donut', {
    ops: BP_OPS, path: '/blood-pressure', wait: 1800,
    async fn(page, h) {
      await must(page.locator('[data-testid="bp-range-toggle"]'), 'range toggle');
      const title = await must(page.locator('[data-testid="bp-donut-title"]'), 'donut title');
      // The plan's window: it opened on 7 days (d-fixes).
      if ((await title.innerText()).trim() !== 'Readings by range, last 30 days') throw new Error(`donut title: ${await title.innerText()}`);
      await must(page.locator('[data-testid="bp-donut-legend"]'), 'legend');
      const toggleTop = (await page.locator('[data-testid="bp-range-toggle"]').boundingBox()).y;
      const titleTop = (await title.boundingBox()).y;
      if (toggleTop > titleTop) throw new Error('the range toggle is below the donut');
      // Labelled bars, not a donut: every range says its own name and a count
      // in words, and the colour only agrees with them.
      const rows = page.locator('[data-testid="bp-range-row"]');
      const n = await rows.count();
      if (n < 2) throw new Error(`expected a row per range with readings, saw ${n}`);
      const texts = (await rows.allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
      const bad = texts.filter((t) => !/^[A-Za-z][A-Za-z0-9 ,/()-]*\s\d+ readings?$/.test(t));
      if (bad.length) throw new Error(`range rows without a name and a count in words: ${JSON.stringify(bad)}`);
      const total = texts.reduce((a2, t) => a2 + Number(/(\d+) readings?$/.exec(t)[1]), 0);
      if (total !== 14) throw new Error(`the rows count ${total} readings, wanted the 14 in the window: ${JSON.stringify(texts)}`);
      await absent(page.locator('[data-testid="bp-donut-legend"]').locator('xpath=preceding-sibling::div[@role="img"]'), 'a donut chart');
      await absent(page.locator('[data-testid="bp-donut-tooltip"]'), 'a donut tooltip');
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
  // Same reading saved twice in a minute: the gateway says BP_DUPLICATE, and the form names both times with "Save as <time>".
  stubbed('68a-bp-dialog-duplicate', {
    ops: BP_OPS, path: '/blood-pressure', wait: 1800, viewports: ['phone'], dialog: true,
    rest: { '**/graphql': DUPLICATE_ERROR },
    async fn(page, h) {
      const dialog = await openBpDialog(page, h);
      await dialog.getByLabel('Top number (systolic)').fill('128');
      await dialog.getByLabel('Bottom number (diastolic)').fill('82');
      await dialog.getByRole('button', { name: /^save$/i }).click();
      await h.settle(1200);
      const note = await must(dialog.locator('[data-testid="bp-duplicate"]'), 'the duplicate note');
      const text = (await note.first().innerText()).replace(/\s+/g, ' ');
      if (!/You already have a reading at .+\. If this is a second one, save it as .+\./.test(text)) throw new Error(`duplicate note reads "${text}"`);
      await must(dialog.getByRole('button', { name: /^save as /i }), 'the "Save as <time>" button');
    },
  }),
];

// Signed out: the opposite of every other scene. The session reads (/api/me
// and the refresh behind it) answer 401, so the app has no user and /login
// shows its card. Page-scoped; dropped again in teardown.
const signedOut = (r) => json(r, { error: 'Unauthorized' }, 401);
settingsScenes.push(
  stubbed('62z-login-signed-out', {
    path: '/login',
    viewports: ['phone', 'desktop'],
    rest: { '**/api/me': signedOut, '**/api/auth/refresh': signedOut },
    async fn(page) {
      await must(page.locator('[data-testid="login-page"]'), 'the Login card');
      await must(page.getByText('FitnessGeek').first(), 'the FitnessGeek name');
      await must(page.getByText('Sign in to keep your food, weight and health in one place.'), 'the tagline');
      if (await page.getByText(/GeekSuite/).count()) throw new Error('the Login card still names GeekSuite');
      await must(page.getByRole('button', { name: 'Sign in', exact: true }), '"Sign in"');
      await must(page.getByRole('button', { name: 'Create an account', exact: true }), '"Create an account"');
      if (!/\/login$/.test(new URL(page.url()).pathname)) throw new Error(`left /login for ${page.url()}`);
    },
  }),
);

export const scenes = [
  ...settingsScenes,
  ...quickTarget,
  ...medications,
  ...reports,
  ...bloodPressure,
];
export const tail = [];
