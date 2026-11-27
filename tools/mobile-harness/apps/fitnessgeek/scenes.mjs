// FitnessGeek. ONE app (apps/fitnessgeek/DOCS/ONE_APP_PLAN.md): Today is the
// old Home and Food log in one page, Trends holds Reports / Activity / Health,
// Saved foods holds My meals / My foods, and there is no Simple or Full mode.
// One person (Chef, the context's fixtures) walks every scene; a scene that
// needs another state patches his data for itself. Scenes are independent:
// any scene that needs a dialog open re-navigates and re-opens it rather than
// relying on a previous scene's state.
import { json } from '../../lib/net.mjs';
import { OPS, FOODS, FOOD_LOGS, MEDS, BODY_COMP_SUMMARY_EARLY, BODY_COMP_SCANS_EARLY, opsWithPlan, experienceOf, DESCRIBED_SOUP } from './fixtures.mjs';
import {
  must, withPageOps, scrollToSection, SPEECH_STUB, foodRoutes, dropFoodRoutes, setDetails, openMealMenu,
  soupSuggest, fageSuggest, fageDeep, composerScene, typeInto, SOUP, YESTERDAY,
} from './helpers.mjs';


// A saved recipe for the My Foods scenes: 6 servings, three ingredients, one
// of them an AI estimate. Nutrition is what the gateway would compute.
const ing = (name, amount, unit, servings, size, sunit, kcal, estimated = false) => ({
  __typename: 'FitnessRecipeIngredient', food_item_id: null, name, amount, unit, servings,
  serving_size: size, serving_unit: sunit, estimated,
  nutrition: { __typename: 'NutritionData', calories_per_serving: kcal, protein_grams: 0, carbs_grams: 0, fat_grams: 0, fiber_grams: 0, sugar_grams: 0, sodium_mg: 0 },
});
const CHILI = {
  __typename: 'FitnessFood', id: 'r1', name: 'Turkey chili', brand: null, serving_size: 1, serving_unit: 'serving',
  source: 'custom', barcode: null, is_verified: false,
  nutrition: { __typename: 'NutritionData', calories_per_serving: 248, protein_grams: 24, carbs_grams: 18, fat_grams: 8, fiber_grams: 6, sugar_grams: 4, sodium_mg: 520 },
  recipe: {
    __typename: 'FitnessRecipe', yield_servings: 6,
    ingredients: [
      ing('Ground turkey 93/7', 2, 'lb', 9.07, 100, 'g', 150),
      ing('Kidney beans', 2, 'cup', 4, 0.5, 'cup', 110),
      ing('Chili seasoning blend', 1, 'serving', 1, 1, 'serving', 30, true),
    ],
  },
};


// A saved plan calculated after the BMR fix, from Mifflin — so the stale
// banner stands down and the measured-BMR offer can show.
const CURRENT_MIFFLIN_PLAN = { bmr_calc_version: 2, bmr_source: 'mifflin', lean_mass_lb: null };
// Internally consistent: Katch-McArdle BMR from the fixture scans' 140.7 lb
// lean mass, × 1.55 (moderate) for TDEE, less 500 for 1 lb/week.
const SCAN_PLAN = {
  bmr_calc_version: 2, bmr_source: 'scan', lean_mass_lb: 140.7,
  bmr: 1749, tdee: 2711, daily_calorie_target: 2211, weekly_schedule: Array(7).fill(2211),
};


const count = (locator) => locator.count();
const absent = async (locator, what) => {
  if (await count(locator)) throw new Error(`still on the page: ${what}`);
};
const landedOn = (page, path, query = {}) => {
  const url = new URL(page.url());
  if (url.pathname !== path) throw new Error(`landed on ${url.pathname}${url.search}, wanted ${path}`);
  for (const [k, v] of Object.entries(query)) {
    if (url.searchParams.get(k) !== v) throw new Error(`landed on ${url.pathname}${url.search}, wanted ${k}=${v}`);
  }
};

// ── The barcode scanner ──────────────────────────────────────────────────
// A camera for a browser that has none: `getUserMedia` answers with a canvas
// stream, so the scanner's own code runs end to end — one stream on the
// <video>, the guide-box crop, and the bundled WebAssembly decoder (headless
// Chromium on Linux has no built-in BarcodeDetector, which is exactly an
// iPhone's position). `ean13` draws that number as a real EAN-13 in the middle
// of a portrait frame; without it the frame is an empty shelf.
const FAKE_CAMERA = ({ ean13 } = {}) => {
  const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
  const R = L.map((p) => [...p].map((b) => (b === '1' ? '0' : '1')).join(''));
  const G = R.map((p) => [...p].reverse().join(''));
  const PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1920;
  const g = canvas.getContext('2d');
  let tick = 0;
  const paint = () => {
    g.fillStyle = '#8a8f98';
    g.fillRect(0, 0, 1080, 1920);
    if (ean13) {
      const parity = PARITY[Number(ean13[0])];
      let bits = '101';
      for (let i = 0; i < 6; i += 1) bits += (parity[i] === 'L' ? L : G)[Number(ean13[i + 1])];
      bits += '01010';
      for (let i = 0; i < 6; i += 1) bits += R[Number(ean13[i + 7])];
      bits += '101';
      const unit = 7;
      const width = bits.length * unit;
      const left = (1080 - width) / 2;
      g.fillStyle = '#fff';
      g.fillRect(left - 80, 810, width + 160, 300);
      g.fillStyle = '#000';
      [...bits].forEach((b, i) => { if (b === '1') g.fillRect(left + i * unit, 840, unit, 240); });
    }
    // A canvas stream only sends a frame when the canvas changes.
    g.fillStyle = tick % 2 ? '#8a8f98' : '#8b8f98';
    g.fillRect(0, 0, 2, 2);
    tick += 1;
  };
  paint();
  window.__fakeCameraTimer = setInterval(paint, 100);
  window.__fakeCameraOpens = 0;
  const media = navigator.mediaDevices;
  window.__realGetUserMedia = media.getUserMedia.bind(media);
  media.getUserMedia = async () => {
    window.__fakeCameraOpens += 1;
    return canvas.captureStream(15);
  };
};
const DROP_FAKE_CAMERA = () => {
  // The scanner's two per-device notes, so no scene inherits another's.
  try {
    localStorage.removeItem('barcodeScanHistory');
    localStorage.removeItem('barcodeScanCamera');
  } catch { /* storage unavailable */ }
  clearInterval(window.__fakeCameraTimer);
  if (window.__realGetUserMedia) navigator.mediaDevices.getUserMedia = window.__realGetUserMedia;
};
const openScanner = async (page, h) => {
  const add = await must(page.getByRole('button', { name: /^add to breakfast$/i }).first(), 'Breakfast’s "Add"');
  await add.click();
  await h.settle(900);
  await (await must(page.getByRole('button', { name: 'Scan a barcode' }), 'the "Scan a barcode" link')).click();
  await h.settle(900);
  return must(page.getByRole('dialog', { name: 'Scan a barcode' }), 'the scanner');
};
// The runner skips teardown when setup throws, and one page serves every
// scene of a viewport: a failed scanner scene must not leave its camera or its
// route behind for the next one.
const scannerScene = (fn) => async (page, h) => {
  try {
    await fn(page, h);
  } catch (err) {
    await page.evaluate(DROP_FAKE_CAMERA).catch(() => {});
    await page.unroute('**/api/foods*').catch(() => {});
    throw err;
  }
};
const closeScanner = async (page, h) => {
  await page.evaluate(DROP_FAKE_CAMERA);
  await page.unroute('**/api/foods*').catch(() => {});
  await h.esc(400);
  await h.esc(400);
};


export const scenes = [
  {
    // Today, from the top: the day and a greeting, what is left (ring and
    // sentence) with "Macros and details" CLOSED, one way to add food, the
    // check-in pills, the meals in one card.
    name: '01-home',
    goto: '/dashboard',
    wait: 1600,
    async setup(page, h) {
      // Closed until asked for is the default; the choice is remembered per
      // device, so start from a device that has never chosen.
      await page.evaluate(() => { try { localStorage.removeItem('fg.today.details.v1'); } catch { /* blocked */ } });
      await page.reload({ waitUntil: 'networkidle' });
      await h.settle(1600);
      await absent(page.locator('[data-testid="first-run"]'), 'the first run, for a person with history');
      await must(page.locator('[data-testid="day-header"]'), 'the day header');
      await must(page.locator('[data-testid="day-header-date"]'), 'the date over the greeting');
      const title = (await (await must(page.locator('h1[data-testid="day-header-title"]'), 'the greeting (the page h1)')).innerText()).trim();
      if (!/^Good (morning|afternoon|evening)/.test(title)) throw new Error(`Today's h1 reads "${title}", wanted a greeting`);
      await absent(page.locator('[data-testid="back-to-today"]'), '"Today" (back) while on today');
      await must(page.getByRole('button', { name: 'Previous day' }), 'Previous day');
      await must(page.getByRole('button', { name: 'Next day' }), 'Next day');
      await must(page.locator('[data-testid="home-hero"]'), 'the "what is left" card');
      await must(page.locator('[data-testid="plate-number"]'), 'the number in the ring');
      const sentence = (await (await must(page.locator('[data-testid="calories-sentence"]'), 'the calories sentence')).innerText()).trim();
      // 2,340 target less the fixtures' 1,680 eaten.
      if (sentence !== 'You have 660 calories left today') throw new Error(`the sentence reads "${sentence}"`);
      const toggle = await must(page.locator('[data-testid="macros-details-toggle"]'), '"Macros and details"');
      if ((await toggle.getAttribute('aria-expanded')) !== 'false') throw new Error('"Macros and details" should start closed');
      await absent(page.locator('[data-testid="today-details"]'), 'the details, before the disclosure is opened');
      await absent(page.locator('[data-testid="macro-strip"]'), 'the macro rows, before the disclosure is opened');
      // One way to add: the filled button on a phone, the box itself from md.
      await absent(page.locator('[data-testid="full-add-food"]'), 'the old "full-add-food" button');
      if (h.isPhone) {
        await must(page.locator('[data-testid="what-did-you-eat"]'), '"What did you eat?"');
        await absent(page.locator('[data-testid="inline-add"]'), 'the inline add box on a phone');
      } else {
        await must(page.locator('[data-testid="inline-add"]').getByLabel('Tell me what you ate'), 'the add box on the page');
        await absent(page.locator('[data-testid="what-did-you-eat"]'), '"What did you eat?" beside an inline add box');
      }
      await must(page.locator('[data-testid="today-strip"]'), 'the check-in pills');
      await must(page.locator('[data-testid="meal-cards"]'), 'the meals card');
    },
  },
  {
    // …with "Macros and details" open: the budget rows (Eaten, Protein, Carbs,
    // Fat), the activity add-back in a sentence, "Change today's target" and
    // the way to the calorie plan. Protein says where its target came from.
    name: '01b-today-details',
    setup: (page, h) => withPageOps(page, {
      ...OPS,
      GetDerivedMacros: { derivedMacros: { ...OPS.GetDerivedMacros.derivedMacros, rules: { ...OPS.GetDerivedMacros.derivedMacros.rules, protein_basis: 'lean_mass' } } },
    }, async () => {
      await page.goto(h.base + '/dashboard', { waitUntil: 'networkidle' });
      await h.settle(1600);
      await setDetails(page, h, true);
      const details = page.locator('[data-testid="today-details"]');
      const strip = await must(details.locator('[data-testid="macro-strip"]'), 'the macro rows');
      // 1,680 of 2,340 eaten (the fixtures' totals).
      await must(strip.getByText(/Eaten\s*1,680 cal/), 'the Eaten row');
      await must(strip.getByText('72%', { exact: true }), 'Eaten at 72%');
      for (const row of ['Protein', 'Carbs', 'Fat']) await must(strip.getByText(row, { exact: true }), `the ${row} row`);
      const note = (await (await must(strip.locator('[data-testid="macro-note-protein"]'), 'where the protein target came from')).innerText()).trim();
      if (!/from lean mass$/.test(note)) throw new Error(`the protein note reads "${note}"`);
      const allowance = (await (await must(details.locator('[data-testid="activity-allowance"]'), 'the activity add-back sentence')).innerText()).trim();
      if (allowance !== 'Includes 240 extra for today’s activity.') throw new Error(`the allowance reads "${allowance}"`);
      const editor = await must(details.locator('#calorie-goal-panel[data-testid="day-target-editor"]'), 'the day target editor');
      if ((await editor.getByLabel('Change today’s target').inputValue()) !== '2340') throw new Error('the day target editor does not start on today’s 2,340');
      await must(details.locator('[data-testid="calorie-plan-link"]'), 'the way to the calorie plan');
      await scrollToSection(page, h, '[data-testid="home-hero"]', 88);
    }),
    teardown: (page) => page.unroute('**/graphql'),
  },
  {
    // The same, eating keto: fat first, then protein, then the net-carb line
    // against its limit; a food that lists no fiber says what that means.
    name: '01c-today-details-keto',
    setup: (page, h) => withPageOps(page, {
      ...opsWithPlan({ mode: 'keto' }),
      GetFoodLogs: (vars = {}) => {
        const day = OPS.GetFoodLogs(vars).foodLogs;
        // Almonds, as a catalog row that never listed fiber.
        return { foodLogs: day.map((l) => (l.id === 'l7' ? { ...l, nutrition: { ...l.nutrition, fiber_grams: null }, calculatedNutrition: { ...l.calculatedNutrition, fiber_grams: null } } : l)) };
      },
    }, async () => {
      await page.goto(h.base + '/dashboard', { waitUntil: 'networkidle' });
      await h.settle(1600);
      await setDetails(page, h, true);
      const strip = await must(page.locator('[data-testid="today-details"] [data-testid="macro-strip"]'), 'the macro rows');
      // 87.5 g carbs less 14.4 g fiber in the fixtures' summary, against a 20 g limit.
      await must(strip.getByText(/Net carbs\s*73 g\s*of 20/), 'the net-carb line "Net carbs 73 g of 20"');
      await must(strip.getByText(/^Over your limit$/i), 'net carbs over, in words');
      await absent(strip.getByText('Carbs', { exact: true }), 'a plain Carbs row in keto');
      const rows = (await strip.innerText()).replace(/\s+/g, ' ');
      if (!(rows.indexOf('Fat') < rows.indexOf('Protein') && rows.indexOf('Protein') < rows.indexOf('Net carbs'))) throw new Error(`keto order is wrong: ${rows.slice(0, 160)}`);
      await must(page.locator('[data-testid="missing-fiber-note"]'), 'the no-fiber note');
      await scrollToSection(page, h, '[data-testid="home-hero"]', 88);
    }),
    teardown: (page) => page.unroute('**/graphql'),
  },
  {
    // The old Food log address: /food-log lands on Today and keeps its query,
    // so a link to a meal still opens on that meal.
    name: '02-log',
    goto: '/food-log?meal=dinner',
    wait: 1800,
    async setup(page) {
      landedOn(page, '/dashboard', { meal: 'dinner' });
      await must(page.locator('#meal-card-dinner[data-testid="meal-card-dinner"]'), 'dinner in the meals card');
      const top = (await page.locator('#meal-card-dinner').boundingBox())?.y;
      const vh = page.viewportSize().height;
      if (top == null || top < 0 || top > vh * 0.75) throw new Error(`?meal=dinner did not bring dinner into view (top ${top && Math.round(top)} of ${vh})`);
    },
  },
  {
    // The add sheet, opened from Breakfast's "Add".
    name: '03-food-dialog',
    viewports: ['phone'],
    goto: '/dashboard',
    wait: 1600,
    async setup(page, h) {
      const add = await must(page.getByRole('button', { name: /^add to breakfast$/i }).first(), 'Breakfast’s "Add"');
      await add.click();
      await h.settle(900);
      await must(page.getByRole('dialog'), 'the add sheet');
    },
    teardown: (page, h) => h.esc(),
  },
  {
    // The scanner with the camera running: the guide box over the picture,
    // the one line of help, and "Take a photo instead". Exactly one camera
    // stream was opened to get here.
    name: '03b-scanner-camera',
    viewports: ['phone'],
    goto: '/dashboard',
    wait: 1600,
    setup: scannerScene(async (page, h) => {
      await page.evaluate(FAKE_CAMERA, {});
      const dialog = await openScanner(page, h);
      await dialog.locator('[data-testid="scanner-guide"][data-state="scanning"]').waitFor({ timeout: 10000 });
      await must(dialog.getByText('Hold the barcode inside the box. If it’s blurry, move back a little.'), 'the line of help');
      await must(dialog.getByRole('button', { name: 'Take a photo instead' }), '"Take a photo instead"');
      const opens = await page.evaluate(() => window.__fakeCameraOpens);
      if (opens !== 1) throw new Error(`the scanner opened the camera ${opens} times, not once`);
      const playing = await dialog.locator('video').evaluate((v) => v.videoWidth > 0 && !v.paused && v.srcObject?.active === true);
      if (!playing) throw new Error('the camera stream is not the one playing in the scanner');
    }),
    teardown: closeScanner,
  },
  {
    // The scanner READS a barcode held in the box: the real decoder on the
    // real frame, "Got it", then the lookup — here a product that is in no
    // database, so the scanner stays open and says so.
    name: '03c-scanner-reads',
    viewports: ['phone'],
    goto: '/dashboard',
    wait: 1600,
    setup: scannerScene(async (page, h) => {
      const asked = [];
      await page.route('**/api/foods*', (r) => {
        asked.push(new URL(r.request().url()).searchParams.get('barcode'));
        return json(r, { success: true, data: [] });
      });
      await page.evaluate(FAKE_CAMERA, { ean13: '4006381333931' });
      const dialog = await openScanner(page, h);
      // "Got it" is on screen only for as long as the lookup takes; what it
      // leaves behind is the answer.
      await dialog.getByText(/That barcode isn’t in the food databases/).waitFor({ timeout: 15000 });
      if (!asked.includes('4006381333931')) throw new Error(`the scanner looked up ${JSON.stringify(asked)}, not the barcode in the picture`);
      await must(dialog.getByRole('button', { name: 'Start camera' }), '"Start camera", to try another');
      // The decoder is the app's own file: a .wasm was fetched, and from here.
      const wasm = await page.evaluate(() => performance.getEntriesByType('resource').map((e) => e.name).filter((n) => /\.wasm($|\?)/.test(n) || /jsdelivr|unpkg/.test(n)));
      const origin = new URL(page.url()).origin;
      if (!wasm.some((n) => n.startsWith(origin))) throw new Error('the scanner read a barcode without loading the bundled decoder');
      const foreign = wasm.filter((n) => !n.startsWith(origin));
      if (foreign.length) throw new Error(`the decoder was fetched from outside the app: ${foreign.join(', ')}`);
    }),
    teardown: closeScanner,
  },
  {
    // No camera (headless Chromium has none; a phone that said no is the same
    // screen): the reason, the number box, and the photo route still offered.
    name: '03d-scanner-no-camera',
    viewports: ['phone'],
    goto: '/dashboard',
    wait: 1600,
    setup: scannerScene(async (page, h) => {
      const dialog = await openScanner(page, h);
      await dialog.getByPlaceholder('8–14 digits').waitFor({ timeout: 10000 });
      await must(dialog.getByRole('alert'), 'why the camera is not being used');
      await must(dialog.getByRole('button', { name: 'Take a photo instead' }), '"Take a photo instead"');
    }),
    teardown: closeScanner,
  },
  {
    // A converted form dialog, full-screen below sm: Copy from another day,
    // out of a meal's "more" menu (it was a link under the Food log's meals).
    name: '04-copy-meal-dialog',
    goto: '/dashboard',
    wait: 1600,
    async setup(page, h) {
      const menu = await openMealMenu(page, h, 'breakfast');
      await (await must(menu.getByRole('menuitem', { name: 'Copy from another day' }), 'Copy from another day')).click();
      await h.settle(800);
      const dialog = await must(page.getByRole('dialog'), 'the copy dialog');
      await must(dialog.locator('[data-testid="copy-summary"]'), 'the copy summary sentence');
    },
    teardown: (page, h) => h.esc(400),
  },
  // Weight & body (FITNESSGEEK_BODY_DATA_PLAN D6), top: goal progress and the
  // smoothed weight trend. The body section and the log are further down, so
  // they get their own scrolled scenes — a screenshot is one viewport tall.
  { name: '05-weight', goto: '/weight', wait: 1600 },
  {
    // The weight chart itself: a 7-day-average line over faint reading dots.
    name: '05a-weight-trend',
    goto: '/weight',
    wait: 1800,
    async setup(page, h) {
      await scrollToSection(page, h, 'text=Weight trend', 88);
    },
  },
  {
    name: '05b-weight-body',
    goto: '/weight',
    wait: 1800,
    setup: async (page, h) => { await scrollToSection(page, h, '#body-composition'); },
  },
  {
    // The fat/lean trend (lazy Nivo island) under the summary and change cards.
    name: '05c-weight-body-trend',
    goto: '/weight',
    wait: 1800,
    async setup(page, h) {
      await scrollToSection(page, h, '#body-composition');
      await scrollToSection(page, h, 'text=Line: 7-day average · dots: each scan', 120);
    },
  },
  {
    name: '05d-weight-log',
    goto: '/weight',
    wait: 1800,
    async setup(page, h) {
      await scrollToSection(page, h, 'text=Weight log', 88);
    },
  },
  {
    // Edit a past weight — a scale row, so the re-import warning shows too.
    name: '05e-weight-edit-dialog',
    goto: '/weight',
    wait: 1800,
    async setup(page, h) {
      const edit = await must(page.getByRole('button', { name: /^edit the .* weigh-in from/i }).first(), 'weight log edit button');
      await edit.scrollIntoViewIfNeeded();
      await edit.click();
      await h.settle(800);
      await must(page.getByRole('dialog'), 'edit dialog');
    },
    teardown: (page, h) => h.esc(400),
  },
  {
    name: '06-weight-dialog',
    goto: '/weight',
    wait: 1600,
    viewports: ['phone'],
    async setup(page, h) {
      const wfab = await must(page.getByRole('button', { name: /log weight/i }).first(), 'the "Log weight" FAB');
      await wfab.click();
      await h.settle(800);
      await must(page.getByRole('dialog'), 'weight dialog');
    },
    teardown: (page, h) => h.esc(400),
  },
  // Blood pressure, with its FAB.
  { name: '07-bp', goto: '/blood-pressure', wait: 1800 },
  // Trends › Food (was Reports; /reports opens it): the averages coverage line, and the day
  // ribbon WITH targets. The ribbon's "Goal:" legend went in wave A; each day
  // card says its status in words instead ("a bit over", "over"), so that is
  // the anchor, and the meal rows carry protein.
  {
    name: '07r-reports',
    goto: '/reports',
    wait: 1800,
    async setup(page, h) {
      landedOn(page, '/trends', { tab: 'food' });
      await must(page.locator('[data-testid="reports-food"]'), 'the Food section');
      await must(page.locator('[data-testid="day-status"]').first(), 'day ribbon status words');
      await must(page.locator('[data-testid="meal-row"]').first(), 'meal rows');
      await scrollToSection(page, h, '[data-testid="report-days-logged"]', 96);
    },
  },
  // Reports › Body & recovery (FITNESSGEEK_TRENDS_PLAN D1–D3): 90-day Garmin
  // trends from GET /api/influx/trends (fixtures' INFLUX_TRENDS), then the
  // body cards. Three shots, one per group — the section is several screens
  // tall on a phone. The sparklines are one lazy Nivo island.
  {
    name: '07s-reports-body-recovery',
    goto: '/trends?tab=food',
    wait: 2000,
    async setup(page, h) {
      await must(page.locator('[data-testid="trend-restingHR"]'), 'resting HR trend card');
      await scrollToSection(page, h, '#body-recovery', 88);
    },
  },
  {
    name: '07t-reports-activity',
    goto: '/trends?tab=food',
    wait: 2000,
    async setup(page, h) {
      await must(page.locator('[data-testid="trend-intensity"]'), 'intensity minutes card');
      await scrollToSection(page, h, 'section[aria-label="Activity"]', 88);
    },
  },
  {
    name: '07u-reports-body',
    goto: '/trends?tab=food',
    wait: 2000,
    async setup(page, h) {
      await must(page.locator('[data-testid="trend-bp"]'), 'blood pressure card');
      await scrollToSection(page, h, 'section[aria-label="Body"]', 88);
    },
  },
  {
    name: '08-bp-dialog',
    goto: '/blood-pressure',
    wait: 1800,
    viewports: ['phone'],
    async setup(page, h) {
      // It used to skip silently (no PNG for weeks); now a missing FAB fails.
      const bfab = await must(page.getByRole('button', { name: /^log (bp|blood pressure)$/i }).first(), 'the "Log blood pressure" FAB');
      await bfab.click();
      await h.settle(800);
      await must(page.getByRole('dialog', { name: /log blood pressure/i }), 'BP dialog');
    },
    teardown: (page, h) => h.esc(400),
  },
  // Profile folded into Settings in wave A: /profile still works and lands on
  // the "About you" section (#you). 09 proves the redirect; 10 is the section
  // itself, scrolled under the top bar — the old Edit Profile dialog is gone.
  {
    name: '09-profile',
    goto: '/profile',
    wait: 1400,
    async setup(page) {
      if (!/\/settings#you$/.test(page.url())) throw new Error(`/profile landed on ${page.url()}, not /settings#you`);
      await must(page.locator('[data-testid="about-you"]'), 'About you');
    },
  },
  {
    name: '10-settings-about-you',
    goto: '/settings#you',
    wait: 1400,
    async setup(page, h) {
      await scrollToSection(page, h, '[data-testid="about-you"]', 88);
    },
  },
  {
    /*
     * Describe-and-log — the app's primary path
     * (apps/fitnessgeek/DOCS/THE_DESCRIBE_AND_LOG_PLAN.md).
     *
     * This scene used to drive the natural-language quick-add sheet: a
     * "Describe a meal" button behind the `natural_language_food_logging`
     * opt-in, a `quick-add-text` field and a "Read it" button. All of that was
     * deleted on 2026-09-14 when the sheet was folded into the search box, and
     * this scene has been **silently skipping** ever since — `setup` returning
     * false is a skip, not a failure, so the run kept saying PASS while one
     * scene covered nothing. Worth remembering: a scene that bails is quieter
     * than a scene that fails.
     *
     * What it covers now is the real thing: type a sentence into the one box,
     * and the offer to log it is the first thing under it.
     *
     * On a phone the box is in the add sheet behind "What did you eat?"; from
     * md it is on the page (ONE_APP_PLAN.md §1). The stubs are page-scoped
     * and dropped again in teardown or on a throw.
     */
    name: '11-describe-and-log',
    async setup(page, h) {
      const drop = async () => {
        await page.unroute('**/api/foods*');
        await page.unroute('**/api/logs/describe');
      };
      // The box's two search waves. Neither should be what answers here, but
      // both fire on a pause, and an unstubbed call would hang the scene.
      await page.route('**/api/foods*', (r) => json(r, { success: true, data: [] }));

      // POST /api/logs/describe — the front door. Shaped exactly as
      // `logDescription` returns it (routes/logRoutes.js).
      await page.route('**/api/logs/describe', (r) => json(r, {
        success: true,
        data: {
          logged: [{
            logId: 'log-desc-1',
            name: 'Chocolate chip pancakes, homemade',
            servings: 4,
            loggedServings: 1,
            mealType: 'breakfast',
            calories: 880,
            nutrition: { calories_per_serving: 880, protein_grams: 18, carbs_grams: 112, fat_grams: 34 },
            source: 'estimate',
            flags: [],
            needsJudge: false,
          }],
          skipped: [],
          logIds: ['log-desc-1'],
          questions: [],
          totalCalories: 880,
        },
      }));

      try {
        await page.goto(h.base + '/dashboard', { waitUntil: 'networkidle' });
        await h.settle(1600);

        let scope;
        if (h.isPhone) {
          await (await must(page.locator('[data-testid="what-did-you-eat"]'), '"What did you eat?"')).click();
          await h.settle(900);
          scope = await must(page.getByRole('dialog'), 'the add sheet');
        } else {
          scope = await must(page.locator('[data-testid="inline-add"]'), 'the add box on the page');
        }

        // The composer (REVIEW_2026-10 §4): "Tell me what you ate", with Log it
        // right under it. A sentence folds the list away.
        const box = await must(scope.getByLabel('Tell me what you ate').first(), 'the composer box');
        await box.fill('4 chocolate chip pancakes homemade');
        // Long enough for the 400ms deep-search debounce to come and go, so the
        // shot is of a settled surface rather than a spinner.
        await h.settle(900);

        // Log it is the point of the scene: if it isn't live under the box,
        // describing has stopped being the primary path.
        const logIt = await must(scope.locator('[data-testid="log-it"]').first(), 'Log it under the box');
        if (await logIt.isDisabled()) throw new Error('Log it is disabled with a sentence in the box');
      } catch (err) {
        await drop();
        throw err;
      }
    },
    async teardown(page, h) {
      await h.esc(400);
      // The words are a draft in the sheet and plain state in the inline box;
      // neither should follow the page into the next scene.
      await page.evaluate(() => { try { sessionStorage.clear(); } catch { /* blocked */ } });
      await page.unroute('**/api/foods*');
      await page.unroute('**/api/logs/describe');
    },
  },
  // Body-composition scan import. Reachable from the Android share sheet and
  // from its own file picker, so it is a real destination rather than a
  // sub-view of something already covered — it needs its own scene or the
  // gate never looks at it.
  { name: '12-scan-import', goto: '/scan-import', wait: 1600 },
  {
    // The change card before a comparison exists — today's real shape: eight
    // scans in a week, four on one day. It must say WHEN ("around 5 Oct"),
    // never a number (§0). A page-scoped GraphQL stub overrides the context's
    // month of scans for this scene only; teardown drops it so nothing after
    // this sees it.
    name: '13-weight-body-early',
    setup: (page, h) => withPageOps(page, {
      ...OPS,
      GetBodyCompositionSummary: { bodyCompositionSummary: BODY_COMP_SUMMARY_EARLY },
      GetBodyCompositions: { bodyCompositions: BODY_COMP_SCANS_EARLY },
    }, async () => {
      await page.goto(h.base + '/weight', { waitUntil: 'networkidle' });
      await h.settle(1800);
      await must(page.getByText(/Your first comparison appears around/).first(), 'change card "appears around" state');
      await scrollToSection(page, h, '#body-composition');
    }),
    teardown: (page) => page.unroute('**/graphql'),
  },
  {
    // Today, the other plan note: a current plan built on Mifflin while a
    // measured BMR exists — the dismissible "A measured BMR is available".
    // It is a quiet note at the foot of the "what is left" card now. (The
    // stale "needs recalculating" note is on 01-home: SETTINGS' plan has a
    // bmr and no bmr_calc_version.)
    name: '14-home-scan-bmr-banner',
    setup: (page, h) => withPageOps(page, opsWithPlan(CURRENT_MIFFLIN_PLAN), async () => {
      await page.goto(h.base + '/dashboard', { waitUntil: 'networkidle' });
      await h.settle(1600);
      await must(page.locator('[data-testid="plan-accuracy-banner"][data-kind="scan"]'), 'scan-BMR banner');
      await scrollToSection(page, h, '[data-testid="plan-accuracy-banner"]', 96);
    }),
    teardown: (page) => page.unroute('**/graphql'),
  },
  {
    // Today › Your numbers, the weight tile: 7-day mean now vs the 7-day mean ~30 days ago.
    name: '15-home-weight-stat',
    goto: '/dashboard',
    wait: 1800,
    async setup(page, h) {
      await must(page.locator('[data-testid="your-numbers"]').getByText(/^7-day avg · /).first(), 'weight tile caption');
      await scrollToSection(page, h, 'text=/^7-day avg · /', 260);
    },
  },
  {
    // Calorie wizard over a saved plan built from the scans: the metabolism
    // card names the source (plan D1).
    name: '16-wizard-scan-source',
    setup: (page, h) => withPageOps(page, opsWithPlan(SCAN_PLAN), async () => {
      await page.goto(h.base + '/calorie-wizard', { waitUntil: 'networkidle' });
      await h.settle(1600);
      // The source note is behind a tap ("How this was worked out").
      await (await must(page.locator('[data-testid="plan-working-toggle"]'), 'How this was worked out')).click();
      await h.settle(500);
      await must(page.locator('[data-testid="bmr-source"][data-source="scan"]'), 'scan BMR source note');
      await scrollToSection(page, h, 'text=What you burn', 96);
    }),
    teardown: (page) => page.unroute('**/graphql'),
  },
  {
    // Re-running the wizard over a saved (stale) weekender plan: old vs new,
    // before anything is saved (plan D2). Walks Change plan → Next ×3 (weight, goal
    // weight, speed) → See my target, with the profile coming from USER in fixtures.mjs.
    name: '17-wizard-old-vs-new',
    setup: (page, h) => withPageOps(page, opsWithPlan({
      // A weekender moves calories to Sat/Sun and keeps the weekly average
      // equal to the daily target: 5 × 1764 + 2 × 2415 = 7 × 1950.
      plan_type: 'weekender',
      weekly_schedule: [1764, 1764, 1764, 1764, 1764, 2415, 2415],
      daily_calorie_target: 1950,
    }), async () => {
      await page.goto(h.base + '/calorie-wizard', { waitUntil: 'networkidle' });
      await h.settle(1600);
      await (await must(page.getByRole('button', { name: /^change plan$/i }).first(), 'Change plan')).click();
      await h.settle(500);
      // Steps: weight, goal weight, speed — "Next" each — then the last one
      // says "See my target".
      for (const step of ['weight', 'goal weight', 'speed']) {
        const next = await must(page.getByRole('button', { name: /^next$/i }).first(), `Next (${step})`);
        if (await next.isDisabled()) throw new Error(`the ${step} step refuses to go on: Next is disabled`);
        await next.click();
        await h.settle(500);
      }
      await (await must(page.getByRole('button', { name: /^see my target$/i }).first(), 'See my target')).click();
      await h.settle(900);
      await must(page.locator('[data-testid="plan-comparison"]'), 'old-vs-new card');
      await scrollToSection(page, h, '[data-testid="plan-comparison"]', 120);
    }),
    teardown: (page) => page.unroute('**/graphql'),
  },
  {
    // Body & recovery for a user without the Influx connection: the trends
    // route answers 403 (settings.influxEnabled false). The body cards stay;
    // the Garmin groups become one quiet line. Page-scoped route, so last.
    name: '18-reports-no-influx',
    async setup(page, h) {
      await page.route('**/api/influx/trends*', (r) =>
        // What the endpoint sends a user without Influx (a 200 — a 403 would
        // make the auth interceptor refresh the token on every visit).
        json(r, { available: false, reason: 'not_enabled', days: [], fitnessAge: null, activeKcal30: null }));
      try {
        await page.goto(h.base + '/trends?tab=food', { waitUntil: 'networkidle' });
        await h.settle(1800);
        await must(page.locator('[data-testid="garmin-not-connected"]'), 'not-connected line');
        await must(page.locator('[data-testid="trend-weight"]'), 'weight card still shown');
        await scrollToSection(page, h, '#body-recovery', 88);
      } catch (err) {
        await page.unroute('**/api/influx/trends*');
        throw err;
      }
    },
    teardown: (page) => page.unroute('**/api/influx/trends*'),
  },
];

// ── Today's other states, More, Settings, Saved foods ────────────────────
// Page-scoped stubs where a scene needs its own data. The scenes THROW on a
// missing anchor — a skip would say PASS while covering nothing.

scenes.push(
  {
    // Today, scrolled to the check-ins: the pills and "Did you take your
    // meds?" (today only, for anyone with medications — one of three taken).
    name: '19a-today-meds',
    goto: '/dashboard',
    wait: 1800,
    async setup(page, h) {
      await must(page.locator('[data-testid="today-strip-meds"]'), 'meds check-in on the strip');
      const list = await must(page.locator('[data-testid="meds-checklist"]'), 'meds checklist');
      const doses = MEDS.reduce((n, m) => n + Math.max(1, m.times_of_day.length), 0);
      if ((await list.getByRole('checkbox').count()) !== doses) throw new Error(`expected ${doses} dose ticks, saw ${await list.getByRole('checkbox').count()}`);
      await scrollToSection(page, h, '[data-testid="meds-checklist"]', 96);
    },
  },
  {
    // Larger text, on Today.
    name: '22-larger-text',
    setup: (page, h) => withPageOps(page, { ...OPS, GetFitnessExperience: experienceOf({ larger_text: true }) }, async () => {
      await page.goto(h.base + '/dashboard', { waitUntil: 'networkidle' });
      await h.settle(1600);
      const size = await page.evaluate(() => document.documentElement.dataset.textSize);
      if (size !== 'larger') throw new Error(`larger text not applied (data-text-size=${size})`);
      await must(page.locator('[data-testid="calories-sentence"]'), 'the calories sentence');
    }),
    teardown: (page) => page.unroute('**/graphql'),
  },
  {
    // The add sheet from Today's Lunch: "Same as yesterday's lunch", the
    // Again chips, the box with its microphone (idle), and Log it dim until
    // there are words.
    name: '21-add-sheet-again',
    async setup(page, h) {
      await page.addInitScript(SPEECH_STUB);
      await page.goto(h.base + '/dashboard', { waitUntil: 'networkidle' });
      await h.settle(1600);
      await page.evaluate(() => { try { sessionStorage.clear(); } catch { /* blocked */ } });
      const add = await must(page.getByRole('button', { name: /^add to lunch$/i }).first(), 'Add to lunch');
      await add.click();
      await h.settle(1200);
      const sheet = await must(page.getByRole('dialog'), 'add sheet');
      await must(sheet.locator('[data-testid="again-chips"]'), 'Again chips');
      await must(sheet.locator('[data-testid="same-as-yesterday"]'), 'Same as yesterday');
      await must(sheet.getByRole('button', { name: /say what you ate/i }).first(), 'microphone');
      await must(sheet.locator('[data-testid="speak-button"]'), 'microphone button');
      await must(sheet.getByLabel('Tell me what you ate'), 'the composer box');
      await must(sheet.locator('[data-testid="log-it"][disabled]'), 'Log it, dim until there are words');
    },
    teardown: (page, h) => h.esc(400),
  },
  {
    // Today, scrolled to the meals: ONE card, a row per meal with its total,
    // "Add" and a "more" menu, and its foods under it. A food row is one
    // button that opens Edit — no star, pencil or trash on it — and a meal is
    // not a link.
    name: '23-today-meals',
    goto: '/dashboard',
    wait: 1800,
    async setup(page, h) {
      const card = await must(page.locator('[data-testid="meal-cards"]'), 'the meals card');
      const rows = card.locator('[data-testid="food-log-row"]');
      if ((await rows.count()) !== FOOD_LOGS.length) throw new Error(`expected ${FOOD_LOGS.length} food rows, saw ${await rows.count()}`);
      for (const meal of ['breakfast', 'lunch', 'dinner', 'snack']) {
        const group = await must(card.locator(`section#meal-card-${meal}[data-testid="meal-card-${meal}"]`), `the ${meal} group`);
        // "Add to breakfast" … "Add to snacks".
        await must(group.getByRole('button', { name: /^add to (breakfast|lunch|dinner|snacks)$/i }), `the ${meal} "Add"`);
        await must(card.locator(`[data-testid="meal-more-${meal}"]`), `the ${meal} "more" button`);
      }
      // 190 + half of 42.
      const breakfast = (await card.locator('[data-testid="meal-total-breakfast"]').innerText()).trim();
      if (breakfast !== '211 cal') throw new Error(`breakfast total reads "${breakfast}"`);
      await must(card.getByRole('button', { name: 'Edit Sourdough Toast, ×2, 240 cal' }), 'a row named with its amount and calories');
      // Each food is exactly one button; nothing else to aim at in a row.
      const inRows = await card.locator('li button, li a').count();
      if (inRows !== FOOD_LOGS.length) throw new Error(`${inRows} controls inside ${FOOD_LOGS.length} food rows: a row should be one button`);
      await absent(card.locator('a'), 'a link in the meals card (meals are not links)');
      await absent(page.locator('[id^="meal-section-"]'), 'the old Food log meal sections');
      await must(page.locator('[data-testid="household-link"]'), 'the household link');
      await scrollToSection(page, h, '#todays-meals', 88);
    },
  },
  {
    // More: everything the phone's tabs don't hold — six links, one list, no
    // group headings, the same for everybody.
    name: '24-more',
    goto: '/more',
    wait: 1400,
    async setup(page, h) {
      const more = await must(page.locator('[data-testid="more-page"]'), 'More page');
      const links = (await more.getByRole('link').evaluateAll((els) => els.map((el) => `${el.getAttribute('href')}|${el.querySelector('p')?.textContent?.trim()}`)));
      const want = ['/blood-pressure|Blood pressure', '/medications|Medications', '/saved-foods|Saved foods', '/calorie-wizard|Calorie plan', '/scan-import|Import a scan', '/settings|Settings'];
      if (links.join(' · ') !== want.join(' · ')) throw new Error(`More lists ${links.join(' · ')}`);
      await absent(more.locator('h2, h3'), 'a group heading on More');
      await absent(more.getByText(/needs|simple|full view/i), 'a mode-era line on More');
      if (h.isPhone) {
        // The phone's tabs: Today · Weight · Trends · More.
        const tabs = await (await must(page.locator('[data-geek-bottom-nav]'), 'the bottom tab bar')).locator('[data-geek-bottom-nav-item]').evaluateAll((els) => els.map((el) => el.getAttribute('aria-label')));
        if (tabs.join(' · ') !== 'Today · Weight · Trends · More') throw new Error(`the bottom tabs read ${tabs.join(' · ')}`);
      }
    },
  },
  {
    // Settings from the top: "How it looks" is Larger text and the theme.
    // There is no Simple / Full chooser.
    name: '25-settings-experience',
    goto: '/settings',
    wait: 1600,
    async setup(page) {
      const looks = await must(page.locator('[data-testid="experience-settings"]'), 'How it looks');
      await must(looks.getByRole('heading', { name: 'How it looks', level: 2 }), 'the "How it looks" heading');
      await must(looks.locator('[data-testid="larger-text-switch"]'), 'the Larger text switch');
      await must(looks.getByLabel('Theme'), 'the theme select');
      for (const gone of ['mode-simple', 'mode-full', 'simple-view-line']) await absent(page.locator(`[data-testid="${gone}"]`), gone);
      await absent(page.getByRole('radio', { name: /simple|full/i }), 'a Simple / Full choice');
    },
  },
  {
    // Saved foods › Foods with a recipe in it (RECIPES_PLAN.md): the "Recipe ·
    // makes 6" label and the New recipe / New food buttons.
    name: '26-my-foods-recipe',
    setup: (page, h) => withPageOps(page, { ...OPS, GetFitnessFoods: { fitnessFoods: [...FOODS, CHILI] } }, async () => {
      await page.goto(h.base + '/saved-foods?tab=foods', { waitUntil: 'networkidle' });
      await h.settle(1400);
      await must(page.getByText('Turkey chili').first(), 'recipe row');
      await must(page.getByRole('button', { name: /new recipe/i }), 'New recipe button');
    }),
    teardown: (page) => page.unroute('**/graphql'),
  },
  {
    // The builder, pre-filled from that recipe: rows with amount + unit, an
    // AI-estimate marker, the live per-serving preview.
    name: '27-recipe-builder',
    setup: (page, h) => withPageOps(page, { ...OPS, GetFitnessFoods: { fitnessFoods: [...FOODS, CHILI] } }, async () => {
      await page.goto(h.base + '/saved-foods?tab=foods', { waitUntil: 'networkidle' });
      await h.settle(1400);
      await (await must(page.getByRole('button', { name: /edit turkey chili/i }), 'edit recipe')).click();
      await h.settle(900);
      await must(page.getByRole('textbox', { name: /amount of ground turkey/i }).or(page.getByLabel(/amount of ground turkey/i)).first(), 'builder ingredient row');
    }),
    teardown: async (page, h) => { await h.esc(400); await page.unroute('**/graphql'); },
  },
);

// ── The food composer (REVIEW_2026-10 §4, Phase 3.16) ────────────────────
// Every state gets a scene here; the helpers (composerScene, foodRoutes…)
// live in helpers.mjs.

scenes.push(
  // Typing a sentence: the list folds into "Or pick an exact food (n)".
  composerScene('28-composer-sentence', {
    routes: { suggest: soupSuggest },
    fn: async (page, h, sheet) => {
      await typeInto(sheet, SOUP, h);
      await must(sheet.locator('[data-testid="exact-food-toggle"][aria-expanded="false"]'), 'folded "Or pick an exact food"');
      if (await sheet.getByText(/nothing found|fewer words/i).count()) throw new Error('"Nothing found" on a sentence');
    },
  }),
  // A short name: the list open, "+ Add" and "190 cal" on every row.
  composerScene('29-composer-short-query', {
    routes: { suggest: fageSuggest, deep: fageDeep },
    fn: async (page, h, sheet) => {
      await typeInto(sheet, 'fage', h, 1200);
      await must(sheet.getByText('+ Add').first(), '"+ Add" pill');
      await must(sheet.getByText('190 cal').first(), '"190 cal"');
    },
  }),
  // …and after the first add, the pill is "Make it 2".
  composerScene('29a-composer-short-query-added', {
    routes: { suggest: fageSuggest, deep: fageDeep },
    fn: async (page, h, sheet) => {
      await typeInto(sheet, 'fage', h, 1200);
      await (await must(sheet.getByRole('button', { name: /^Add Greek Yogurt, Plain Whole Milk/ }).first(), 'the yogurt row')).click();
      await h.settle(900);
      await must(sheet.getByRole('button', { name: /^Make it 2/ }), '"Make it 2"');
    },
  }),
  // Thinking, past eight seconds: "Still working".
  (() => {
    let release = null;
    return {
      ...composerScene('30-composer-thinking', {
        viewports: ['phone'],
        routes: {
          suggest: soupSuggest,
          describe: async (r) => {
            await new Promise((resolve) => { release = resolve; });
            try { await json(r, { success: true, data: DESCRIBED_SOUP }); } catch { /* gone */ }
          },
        },
        fn: async (page, h, sheet) => {
          await typeInto(sheet, SOUP, h, 400);
          await sheet.locator('[data-testid="log-it"]').click();
          await h.settle(8400);
          await must(sheet.getByText('Working it out…'), '"Working it out…"');
          await must(sheet.getByText('Still working — this one’s taking a moment.'), '"Still working"');
        },
      }),
      async teardown(page, h) {
        release?.();
        release = null;
        await h.settle(400);
        await h.esc(400);
        await dropFoodRoutes(page);
      },
    };
  })(),
  // After a describe the sheet closes and the meal carries "Just added"; its
  // Fix opens the Fix sheet for that entry.
  composerScene('31a-composer-fix-sheet', {
    routes: { suggest: soupSuggest },
    fn: async (page, h, sheet) => {
      await typeInto(sheet, SOUP, h, 400);
      await sheet.locator('[data-testid="log-it"]').click();
      await h.settle(1600);
      if (await page.getByRole('dialog').count()) throw new Error('the add sheet should have closed after a describe');
      const strip = await must(page.locator('[data-testid="meal-card-lunch"] [data-testid="just-added"]'), '"Just added" on lunch');
      await (await must(strip.getByRole('button', { name: 'Fix Chicken soup, 1 bowl' }), 'Fix')).click();
      await h.settle(700);
      await must(page.locator('[data-testid="fix-sheet"]'), 'Fix sheet');
    },
  }),
  // The sheet closes, and the meal carries "Just added" with what landed,
  // Undo all and Done. No result card stays behind.
  composerScene('32-just-added', {
    routes: { suggest: soupSuggest },
    fn: async (page, h, sheet) => {
      await typeInto(sheet, SOUP, h, 400);
      await sheet.locator('[data-testid="log-it"]').click();
      await h.settle(1600);
      if (await page.getByRole('dialog').count()) throw new Error('the add sheet should have closed after a describe');
      if (await page.locator('[data-testid="result-card"]').count()) throw new Error('a result card stayed open after a clean describe');
      const strip = await must(page.locator('[data-testid="meal-card-lunch"] [data-testid="just-added"]'), '"Just added" on lunch');
      await must(strip.getByText('Chicken soup, 1 bowl'), 'what landed, by name');
      await must(strip.getByRole('button', { name: 'Undo all' }), 'Undo all');
      await must(strip.getByRole('button', { name: 'Done' }), 'Done');
      if (await page.locator('[data-testid="just-added"]').count() !== 1) throw new Error('"Just added" is on more than the meal it landed in');
      await scrollToSection(page, h, '[data-testid="meal-card-lunch"]', 88);
    },
  }),
  // …and from the box on the page (md and up, where there is no sheet to
  // close): the same strip on the same meal.
  composerScene('32a-inline-just-added', {
    sheet: false,
    viewports: ['desktop', 'tablet-landscape'],
    routes: { suggest: soupSuggest },
    fn: async (page, h) => {
      const box = await must(page.locator('[data-testid="inline-add"]'), 'the add box on the page');
      await typeInto(box, SOUP, h, 400);
      await box.locator('[data-testid="log-it"]').first().click();
      await h.settle(1600);
      await must(page.locator('#meal-card-lunch [data-testid="just-added"]'), '"Just added" on lunch');
      if ((await box.getByLabel('Tell me what you ate').inputValue()) !== '') throw new Error('the page box kept its words after logging them');
      await scrollToSection(page, h, '#meal-card-lunch', 88);
    },
  }),
  // Errors, with the words kept: no signal, and a failure.
  composerScene('33-composer-offline', {
    viewports: ['phone'],
    offline: true,
    fn: async (page, h, sheet) => {
      await typeInto(sheet, SOUP, h, 600);
      await must(sheet.getByText('No signal — I can’t log this yet. Your words are saved here.'), 'the offline line');
      await must(sheet.locator('[data-testid="log-it"][disabled]'), 'Log it off while offline');
    },
  }),
  composerScene('34-composer-failure', {
    routes: { suggest: soupSuggest, describe: 500 },
    fn: async (page, h, sheet) => {
      await typeInto(sheet, SOUP, h, 400);
      await sheet.locator('[data-testid="log-it"]').click();
      await h.settle(1200);
      await must(sheet.getByText('That didn’t go through. Tap Log it to try again.'), 'the failure line');
    },
  }),
  // Day words: ask before logging.
  composerScene('35-composer-day-chip', {
    meal: 'dinner',
    fn: async (page, h, sheet) => {
      await typeInto(sheet, 'fried chicken and fries last night', h, 400);
      await sheet.locator('[data-testid="log-it"]').click();
      await h.settle(500);
      await must(sheet.locator('[data-testid="day-confirm"]'), '"Log this to yesterday?"');
    },
  }),
  // The add sheet on a day that isn't today names it.
  composerScene('36-add-sheet-yesterday', {
    path: `/dashboard?date=${YESTERDAY}&meal=dinner`,
    sheet: false,
    fn: async (page, h) => {
      await (await must(page.locator('#meal-card-dinner').getByRole('button', { name: /^add to dinner$/i }).first(), 'Dinner "Add"')).click();
      await h.settle(900);
      await must(page.getByRole('dialog').getByText(/^Add to \w+’s dinner \(yesterday\)$/), 'the title "Add to <weekday>’s dinner (yesterday)"');
    },
  }),
  {
    /*
     * DESKTOP LAYOUT STABILITY. Chef: "the entry form bounces around a lot on
     * the desktop when trying to enter foods." Open the add dialog, record
     * where the dialog and the box are, type a name that streams in wave one
     * and then (late) wave two, and record again. The dialog's and the box's
     * top edges may not move more than 2px, and a row under the pointer may
     * not move when the late batch lands.
     */
    name: '37-desktop-add-dialog-stable',
    viewports: ['desktop'],
    async setup(page, h) {
      await foodRoutes(page, { suggest: fageSuggest, deep: fageDeep, suggestMs: 250, deepMs: 1400 });
      try {
        await page.goto(h.base + '/dashboard', { waitUntil: 'networkidle' });
        await h.settle(1400);
        await (await must(page.locator('#meal-card-lunch').getByRole('button', { name: /^add to lunch$/i }).first(), 'Lunch "+ Add"')).click();
        await h.settle(900);
        const paper = await must(page.locator('[data-testid="add-food-dialog"]'), 'the add dialog');
        const box = await must(paper.getByLabel('Tell me what you ate'), 'the composer box');
        // Earlier scenes in this context may have left words in today's lunch
        // draft: they now survive closing the sheet (L18, d-fixes).
        if (await box.inputValue()) {
          await box.fill('');
          await h.settle(600);
        }
        const tops = async () => ({ dialog: (await paper.boundingBox()).y, input: (await box.boundingBox()).y });
        const before = await tops();

        await box.click();
        await box.pressSequentially('fage', { delay: 90 });
        await h.settle(700);
        const first = paper.locator('[data-testid="food-row"]').first();
        await must(first, 'wave one rows');
        const rowsAfterSuggest = await paper.locator('[data-testid="food-row"]').count();
        await first.hover();
        const rowTop = (await first.boundingBox()).y;
        const mid = await tops();

        await h.settle(2200);
        const rowsAfterDeep = await paper.locator('[data-testid="food-row"]').count();
        if (rowsAfterDeep <= rowsAfterSuggest) throw new Error(`wave two never landed (${rowsAfterSuggest} → ${rowsAfterDeep} rows)`);
        const after = await tops();
        const rowTopAfter = (await first.boundingBox()).y;

        const moved = [];
        for (const key of ['dialog', 'input']) {
          for (const [label, at] of [['typing', mid], ['late batch', after]]) {
            const dy = Math.abs(at[key] - before[key]);
            if (dy > 2) moved.push(`${key} top moved ${dy.toFixed(1)}px (${label})`);
          }
        }
        if (Math.abs(rowTopAfter - rowTop) > 2) moved.push(`hovered row moved ${(rowTopAfter - rowTop).toFixed(1)}px when the late batch landed`);
        if (moved.length) throw new Error(`the add dialog bounced: ${moved.join('; ')}`);
        h.log(`stable: dialog ${before.dialog}→${after.dialog}, input ${before.input}→${after.input}, row ${rowTop}→${rowTopAfter}, rows ${rowsAfterSuggest}→${rowsAfterDeep}`);
      } catch (err) {
        await dropFoodRoutes(page);
        throw err;
      }
    },
    async teardown(page, h) {
      await h.esc(400);
      await dropFoodRoutes(page);
    },
  },
);

// ── Wave A (2026-10-17) ─────────────────────────────────────────────────
// Every state the UX-review fixes built, and every screen that had no
// picture. Kept in their own files by area; each exports `scenes` and an
// optional `tail` — scenes that change something a page cannot take back
// (page.clock, an init script), which run after everything else.
import * as composerWave from './scenes-composer.mjs';
import * as pagesWave from './scenes-pages.mjs';
import * as settingsWave from './scenes-settings.mjs';

const WAVES = [composerWave, pagesWave, settingsWave];
for (const w of WAVES) scenes.push(...(w.scenes || []));
for (const w of WAVES) scenes.push(...(w.tail || []));

// FG_SCENES=<regex> walks only the matching scenes — for iterating on a few
// without the whole run. Unset in CI.
if (process.env.FG_SCENES) {
  const only = new RegExp(process.env.FG_SCENES);
  scenes.splice(0, scenes.length, ...scenes.filter((s) => only.test(s.name)));
}

// Known, ticketed violations. Each one should die when the app is fixed —
// an empty list is the goal, not a permanent parking lot.
export const waivers = [];
