/**
 * Today — the one page, the same for everybody (DOCS/ONE_APP_PLAN.md §1):
 *
 *   - what is left, as a ring and a sentence, with the macros behind one
 *     "Macros and details" disclosure, closed until asked for and remembered
 *     on the device (and working when storage throws);
 *   - "What did you eat?", the page's one filled button, on this hour's meal;
 *   - a meal's "Add" opens the add sheet already set to that meal;
 *   - today's check-ins, the meds checklist, the numbers and the AI's notes,
 *     in that order on a phone;
 *   - the three-step first run for a person whose `needsFirstRun` is true.
 *
 * The person comes from a real ExperienceContext value, not a mock of the
 * page. No mode: nothing here is "Simple" or "Full".
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within, act, waitForElementToBeRemoved } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import { createFitnessTheme } from '../../theme/theme.jsx';

const TODAY = '2026-09-27';
const log = (id, name, meal, cal) => ({
  id, meal_type: meal, servings: 1, log_date: `${TODAY}T00:00:00.000Z`,
  nutrition: { calories_per_serving: cal }, food_item_id: { id: `f-${id}`, name },
});

vi.mock('../../services/fitnessGeekService.js', () => ({
  fitnessGeekService: {
    formatDate: () => '2026-09-27',
    getDailySummary: vi.fn(() => Promise.resolve({ data: { totals: { calories: 1680 }, calorieGoal: 2340, meals: {} } })),
    getGarminDaily: vi.fn(() => Promise.resolve(null)),
    getLogsForDate: vi.fn(() => Promise.resolve([
      log('a', 'Greek yogurt', 'breakfast', 190),
      log('b', 'Caesar salad', 'lunch', 480),
    ])),
    deleteFoodLog: vi.fn(),
  },
}));
vi.mock('../../services/goalsService.js', () => ({ goalsService: { getDerivedMacros: vi.fn(() => Promise.resolve({ data: { today: { target_calories: 2340, protein_g: 156 } } })) } }));
vi.mock('../../services/weightService.js', () => ({
  weightService: {
    getWeightStats: vi.fn(() => Promise.resolve(null)),
    getWeightLogs: vi.fn(() => Promise.resolve({ data: [{ log_date: '2026-09-27T00:00:00.000Z', weight_value: 180 }] })),
  },
}));
vi.mock('../../services/bpService.js', () => ({ bpService: { getCurrentBP: vi.fn(() => Promise.resolve(null)), getBPLogs: vi.fn(() => Promise.resolve({ data: [] })) } }));
vi.mock('../../services/streakService.js', () => ({ streakService: { getLoginStreak: vi.fn(() => Promise.resolve(null)) } }));
vi.mock('../../services/settingsService.js', () => ({ settingsService: { getSettings: vi.fn(() => Promise.resolve({ data: {} })) } }));
vi.mock('../../services/bodyCompService.js', () => ({ bodyCompService: { getSummary: vi.fn(() => Promise.resolve(null)) } }));
vi.mock('../../services/medsService.js', () => ({
  medsService: {
    list: vi.fn(() => Promise.resolve([
      { id: 'm1', display_name: 'Lisinopril', times_of_day: ['morning'] },
      { id: 'm2', display_name: 'Metformin', times_of_day: ['morning', 'evening'] },
    ])),
    getLogsByDate: vi.fn(() => Promise.resolve([{ medication_id: 'm1', time_of_day: 'morning', taken: true, created_at: '2026-09-27T13:00:00Z' }])),
    log: vi.fn(() => Promise.resolve({})),
  },
}));
vi.mock('../../services/foodService', () => ({ foodService: { suggest: vi.fn(() => Promise.resolve([])), search: vi.fn(() => Promise.resolve([])) } }));
vi.mock('../../hooks/useRecentLogs.js', () => ({ useRecentLogs: () => ({ logs: [], meals: [], loading: false }) }));
vi.mock('../../hooks/useFoodLogging.js', () => ({
  useFoodLogging: () => ({ logItems: vi.fn(), undoLogs: vi.fn(), describeMeal: vi.fn(), adjustLogCalories: vi.fn() }),
}));
vi.mock('../../components/Dashboard/AIInsightsCard.jsx', () => ({ default: () => <div data-testid="insights" /> }));
const notify = vi.fn();
vi.mock('@geeksuite/ui', async (importOriginal) => ({
  ...(await importOriginal()),
  useToast: () => ({ notify }),
}));
// "Today" is useToday()'s answer (review B3) — pinned here so the fixtures
// stay on one day; a test moves it to play a PWA resumed the next morning.
let todayValue = TODAY;
vi.mock('../../hooks/useToday.js', () => ({ useToday: () => todayValue, default: () => todayValue }));
const navigateSpy = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal()),
  useNavigate: () => navigateSpy,
}));

const { ExperienceContext } = await import('../../contexts/ExperienceContext.jsx');
const { fitnessGeekService } = await import('../../services/fitnessGeekService.js');
const { goalsService } = await import('../../services/goalsService.js');
const { bpService } = await import('../../services/bpService.js');
const { streakService } = await import('../../services/streakService.js');
const { medsService } = await import('../../services/medsService.js');
const { mealTypeForHour } = await import('../../utils/plainWords.js');
const { default: Today } = await import('../Today.jsx');
const { DETAILS_OPEN_KEY } = await import('../../components/Home/WhatIsLeft.jsx');
const { forgetDrafts } = await import('../../components/FoodSearch/composerDraft.js');

const experience = (over = {}) => ({
  loading: false,
  known: true,
  needsFirstRun: false,
  largerText: false,
  firstRunDone: true,
  preferredName: null,
  displayName: 'Chef',
  goal: null,
  setLargerText: vi.fn(),
  completeFirstRun: vi.fn(() => Promise.resolve({ ok: true })),
  update: vi.fn(),
  ...over,
});

const renderHome = (value) => render(
  <ThemeProvider theme={createFitnessTheme('light')}>
    <ExperienceContext.Provider value={value}>
      <MemoryRouter><Today /></MemoryRouter>
    </ExperienceContext.Provider>
  </ThemeProvider>
);
const openDetails = async () => fireEvent.click(await screen.findByTestId('macros-details-toggle'));
// a comes before b in the page.
const before = (a, b) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

beforeEach(() => {
  vi.clearAllMocks();
  todayValue = TODAY;
  forgetDrafts();
  try { window.localStorage.clear(); } catch { /* jsdom */ }
});
afterEach(() => { vi.restoreAllMocks(); });

describe('what is left, in words', () => {
  it('"You have 660 calories left today", with the number in the ring', async () => {
    renderHome(experience());
    expect(await screen.findByTestId('calories-sentence')).toHaveTextContent('You have 660 calories left today');
    expect(screen.getByRole('heading', { name: 'What’s left today' })).toBeInTheDocument();
    // 660 sits in the ring; the sentence beside it says it once more in
    // words, and nothing says it a third time (review D-14).
    expect(screen.getByTestId('plate-number')).toHaveTextContent(/^660$/);
    expect(screen.queryByText('Amount left today')).toBeNull();
    expect(document.body.textContent.match(/660/g)).toHaveLength(2);
    expect(screen.getByTestId('home-hero')).toHaveTextContent('1,680 eaten of 2,340 · 2 meals logged');
    // No day-of-year counter, no receipt number.
    expect(document.body.textContent).not.toMatch(/\d+\/36[56]|NO\./);
  });

  it('over target: the ring is the amount over, tagged Over', async () => {
    fitnessGeekService.getDailySummary.mockResolvedValueOnce({ data: { totals: { calories: 2500 }, meals: {} } });
    renderHome(experience());
    expect(await screen.findByTestId('calories-sentence')).toHaveTextContent('You’re 160 calories over today');
    expect(screen.getByText('Over target today')).toBeInTheDocument();
    expect(screen.getByTestId('plate-number')).toHaveTextContent(/^Over160$/);
  });

  it('the target is the way to the calorie plan', async () => {
    renderHome(experience());
    const target = await screen.findByTestId('target-link');
    expect(target).toHaveTextContent(/Target\s2,340\scal/);
    expect(target).toHaveAttribute('href', '/calorie-wizard');
    expect(target).toHaveAccessibleName('Your target is 2,340 calories. Open your calorie plan');
  });
});

describe('"Macros and details"', () => {
  it('is closed by default: no macros on the page until asked for', async () => {
    renderHome(experience());
    const toggle = await screen.findByTestId('macros-details-toggle');
    expect(toggle).toHaveTextContent('Protein, carbs and fat');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('macro-strip')).toBeNull();
    expect(screen.queryByTestId('today-details')).toBeNull();
    // The disclosure names what is inside; no numbers for them until opened.
    expect(screen.getByTestId('home-hero').textContent).not.toMatch(/\d+ ?g\b/);
  });

  it('opens to the day against target: eaten, protein, carbs and fat, each with a bar', async () => {
    renderHome(experience());
    await openDetails();
    const strip = await screen.findByTestId('macro-strip');
    expect(screen.getByTestId('macros-details-toggle')).toHaveAttribute('aria-expanded', 'true');
    expect(within(strip).getByRole('img', { name: 'Eaten: 1,680 of 2,340 cal' })).toBeInTheDocument();
    expect(within(strip).getByText('Eaten', { selector: 'b' }).closest('div')).toHaveTextContent(/72%$/);
    for (const name of ['Protein', 'Carbs', 'Fat']) expect(within(strip).getByText(name, { selector: 'b' })).toBeInTheDocument();
    // And the way to the plan, and today's target.
    expect(screen.getByTestId('calorie-plan-link')).toHaveAttribute('href', '/calorie-wizard');
    expect(screen.getByLabelText('Change today’s target')).toHaveValue(2340);
  });

  it('remembers the choice on this device', async () => {
    const first = renderHome(experience());
    await openDetails();
    expect(window.localStorage.getItem(DETAILS_OPEN_KEY)).toBe('1');
    first.unmount();

    const second = renderHome(experience());
    expect(await screen.findByTestId('macro-strip')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('macros-details-toggle'));
    expect(window.localStorage.getItem(DETAILS_OPEN_KEY)).toBe('0');
    second.unmount();

    renderHome(experience());
    await screen.findByTestId('macros-details-toggle');
    expect(screen.queryByTestId('macro-strip')).toBeNull();
  });

  it('still opens and closes when storage throws (a private window, blocked site data)', async () => {
    // Only this page's own key throws here: BarcodeScanner (not this page's
    // code) reads storage unguarded and would take the test down with it.
    const realGet = Storage.prototype.getItem;
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function get(key) {
      if (key === DETAILS_OPEN_KEY) throw new Error('SecurityError');
      return realGet.call(this, key);
    });
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceededError'); });
    renderHome(experience());
    expect(await screen.findByTestId('calories-sentence')).toBeInTheDocument();
    expect(screen.queryByTestId('macro-strip')).toBeNull();
    await openDetails();
    expect(await screen.findByTestId('macro-strip')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('macros-details-toggle'));
    expect(screen.getByTestId('macros-details-toggle')).toHaveAttribute('aria-expanded', 'false');
    // It did try, both ways, and both threw.
    expect(getItem).toHaveBeenCalledWith(DETAILS_OPEN_KEY);
    expect(setItem).toHaveBeenCalledWith(DETAILS_OPEN_KEY, '1');
  });
});

describe('"What did you eat?"', () => {
  it('is the page\'s one filled button, under what is left and above the meals, and opens the sheet on this hour\'s meal', async () => {
    renderHome(experience());
    const button = await screen.findByTestId('what-did-you-eat');
    expect(button).toHaveTextContent('What did you eat?');
    expect(button.className).toMatch(/MuiButton-contained/);
    expect(document.querySelectorAll('.MuiButton-contained')).toHaveLength(1);
    expect(screen.queryByTestId('full-add-food')).toBeNull();
    expect(before(screen.getByTestId('home-hero'), button)).toBe(true);
    expect(before(button, screen.getByTestId('meal-cards'))).toBe(true);
    await act(async () => { fireEvent.click(button); });
    const sheet = await screen.findByRole('dialog');
    const meal = mealTypeForHour(new Date().getHours());
    expect(within(sheet).getByText(new RegExp(`^Add to ${meal === 'snack' ? 'snacks?' : meal}$`))).toBeInTheDocument();
  });
});

describe('the meals', () => {
  it("each meal's Add opens the add sheet already set to that meal", async () => {
    renderHome(experience());
    await screen.findByTestId('meal-cards');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Add to lunch' })); });
    const sheet = await screen.findByRole('dialog');
    expect(within(sheet).getByText('Add to lunch')).toBeInTheDocument();
    expect(within(sheet).getByRole('button', { name: 'Lunch', pressed: true })).toBeInTheDocument();
    expect(within(sheet).getByRole('button', { name: 'Breakfast', pressed: false })).toBeInTheDocument();
  });

  it('there are four, in meal order, each with its own Add, its foods under it', async () => {
    renderHome(experience());
    await screen.findByTestId('meal-cards');
    expect(screen.getAllByRole('button', { name: /^Add to / }).map((b) => b.getAttribute('aria-label')))
      .toEqual(['Add to breakfast', 'Add to lunch', 'Add to dinner', 'Add to snacks']);
    expect(within(screen.getByTestId('meal-card-breakfast')).getByRole('button', { name: 'Edit Greek yogurt, 190 cal' })).toBeInTheDocument();
    expect(screen.getByTestId('meal-total-lunch')).toHaveTextContent('480 cal');
    expect(screen.getByTestId('meal-total-dinner')).toHaveTextContent('Nothing yet');
  });
});

/**
 * L18: the sheet's words outlive closing it. Closing used to reset the meal
 * to snack while the sheet was still on its way out, so the lunch draft
 * moved to snack and "Add to lunch" opened on an empty box — and "Your words
 * are saved here" wasn't true.
 */
describe('the add sheet keeps her words when closed (L18)', () => {
  const closeAndReopen = async (reopen) => {
    const sheet = await screen.findByRole('dialog');
    const box = within(sheet).getByLabelText('Tell me what you ate');
    fireEvent.change(box, { target: { value: 'chicken noodle soup' } });
    fireEvent.keyDown(sheet, { key: 'Escape' });
    await waitForElementToBeRemoved(() => screen.queryByRole('dialog'));
    await act(async () => { fireEvent.click(reopen()); });
    const again = await screen.findByRole('dialog');
    return within(again).getByLabelText('Tell me what you ate');
  };

  it("from a meal's Add", async () => {
    renderHome(experience());
    await screen.findByTestId('meal-cards');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Add to lunch' })); });
    const box = await closeAndReopen(() => screen.getByRole('button', { name: 'Add to lunch' }));
    expect(box).toHaveValue('chicken noodle soup');
  });

  it('from "What did you eat?"', async () => {
    renderHome(experience());
    const button = await screen.findByTestId('what-did-you-eat');
    await act(async () => { fireEvent.click(button); });
    const box = await closeAndReopen(() => screen.getByTestId('what-did-you-eat'));
    expect(box).toHaveValue('chicken noodle soup');
  });
});

describe('today\'s check-ins', () => {
  it('reads Weighed ✓ · Blood pressure + · Meds 1 of 3', async () => {
    renderHome(experience());
    const strip = await screen.findByTestId('today-strip');
    expect(within(strip).getByTestId('today-strip-weight')).toHaveAttribute('data-done', 'true');
    expect(within(strip).getByTestId('today-strip-bp')).toHaveTextContent('Blood pressure+');
    expect(within(strip).getByTestId('today-strip-bp')).toHaveAttribute('href', '/blood-pressure?add=1');
    expect(await within(strip).findByTestId('today-strip-meds')).toHaveTextContent('Meds1 of 3');
  });

  it('"Meds" brings the ticks on this page into view instead of leaving it', async () => {
    const scrolled = [];
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function record() { scrolled.push(this); };
    try {
      renderHome(experience());
      const pill = await screen.findByTestId('today-strip-meds');
      expect(pill).not.toHaveAttribute('href');
      fireEvent.click(pill);
      expect(scrolled).toHaveLength(1);
      expect(within(scrolled[0]).getByTestId('meds-checklist')).toBeInTheDocument();
    } finally {
      Element.prototype.scrollIntoView = original;
    }
  });
});

describe('one page for everybody', () => {
  it('has the greeting, the meds checklist, the numbers and the AI\'s notes — nothing waits on a mode', async () => {
    renderHome(experience({ displayName: 'Heather' }));
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent(/^Good (morning|afternoon|evening), Heather$/);
    expect(await screen.findByRole('heading', { name: 'Did you take your meds?' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Your numbers' })).toBeInTheDocument();
    expect(screen.getByTestId('insights')).toBeInTheDocument();
  });

  it('a phone reads top to bottom: what is left, the button, the check-ins, the meals, the meds, the numbers, the notes', async () => {
    renderHome(experience());
    const meds = await screen.findByTestId('meds-checklist');
    const order = [
      screen.getByTestId('day-header'),
      screen.getByTestId('home-hero'),
      screen.getByTestId('what-did-you-eat'),
      screen.getByTestId('today-strip'),
      screen.getByTestId('meal-cards'),
      meds,
      screen.getByTestId('your-numbers'),
      screen.getByTestId('insights'),
    ];
    for (let i = 1; i < order.length; i += 1) expect(before(order[i - 1], order[i])).toBe(true);
    // On a phone the add box is behind the button, not on the page.
    expect(screen.queryByTestId('inline-add')).toBeNull();
  });

  it('says neither "Simple" nor "Full" anywhere', async () => {
    renderHome(experience());
    await screen.findByTestId('meds-checklist');
    await openDetails();
    expect(document.body.textContent).not.toMatch(/\bSimple\b|\bFull\b/);
  });
});

describe('first run', () => {
  it('shows to a person who needs it, instead of the day', async () => {
    renderHome(experience({ needsFirstRun: true, firstRunDone: false }));
    expect(await screen.findByTestId('first-run')).toBeInTheDocument();
    expect(screen.queryByTestId('meal-cards')).toBeNull();
  });

  it('never to a person who does not, finished or not', async () => {
    const { unmount } = renderHome(experience({ needsFirstRun: false, firstRunDone: false }));
    expect(await screen.findByTestId('meal-cards')).toBeInTheDocument();
    expect(screen.queryByTestId('first-run')).toBeNull();
    unmount();
    renderHome(experience({ needsFirstRun: false, firstRunDone: true }));
    expect(await screen.findByTestId('meal-cards')).toBeInTheDocument();
    expect(screen.queryByTestId('first-run')).toBeNull();
  });

  it('never while the saved settings are still loading', async () => {
    renderHome(experience({ needsFirstRun: true, loading: true }));
    await act(async () => {});
    expect(screen.queryByTestId('first-run')).toBeNull();
  });

  it('a failed first-run save tells her, in plain words', async () => {
    const completeFirstRun = vi.fn(() => Promise.resolve({ ok: false, error: { networkError: { statusCode: 503 } } }));
    renderHome(experience({ needsFirstRun: true, firstRunDone: false, completeFirstRun }));
    await screen.findByTestId('first-run');
    // Walk the first run to its end with whatever buttons it offers.
    for (let i = 0; i < 6 && !completeFirstRun.mock.calls.length; i += 1) {
      const next = screen.queryByRole('button', { name: /^(Next|Continue|Done|Skip|Start|Let's go|Finish|Maybe later|Not now)/i })
        || screen.queryAllByRole('button').find((b) => /lose|track|maintain/i.test(b.textContent));
      if (!next) break;
      await act(async () => { fireEvent.click(next); });
    }
    expect(completeFirstRun).toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith('FitnessGeek is restarting. Try again in a moment.', { tone: 'error' });
  });
});

describe('a PWA resumed the next morning (review B3)', () => {
  it("reads useToday()'s day, not the day it was opened", async () => {
    todayValue = '2026-10-16';
    renderHome(experience());
    await screen.findByTestId('meal-cards');
    expect(fitnessGeekService.getLogsForDate).toHaveBeenCalledWith('2026-10-16');
    expect(screen.getByTestId('day-header-date')).toHaveTextContent('Friday, October 16');
  });
});

describe('the first-run goal is used (review Phase 2.14)', () => {
  it('"lose a little" with no target: one sentence and Set your daily target, not "No daily target is set"', async () => {
    goalsService.getDerivedMacros.mockResolvedValueOnce({ data: {} });
    fitnessGeekService.getDailySummary.mockResolvedValueOnce({ data: { totals: { calories: 480 }, meals: {} } });
    renderHome(experience({ goal: 'lose' }));
    const button = await screen.findByTestId('set-daily-target');
    expect(screen.getByTestId('home-hero')).toHaveTextContent('A daily target makes losing a little easier.');
    expect(document.body.textContent).not.toMatch(/No daily target is set/);
    expect(screen.queryByTestId('target-link')).toBeNull();
    await act(async () => { fireEvent.click(button); });
    // The one-screen "How fast?" form, for everybody.
    expect(navigateSpy).toHaveBeenCalledWith('/calorie-wizard?quick=1');
  });

  it('no offer when a target exists', async () => {
    renderHome(experience({ goal: 'lose' }));
    await screen.findByTestId('calories-sentence');
    expect(screen.queryByTestId('set-daily-target')).toBeNull();
  });
});

describe('with no medications', () => {
  it('offers a quiet "Track your meds" to /medications, and no checklist', async () => {
    medsService.list.mockResolvedValueOnce([]);
    medsService.getLogsByDate.mockResolvedValueOnce([]);
    renderHome(experience());
    const link = await screen.findByTestId('track-meds');
    expect(link).toHaveAttribute('href', '/medications');
    expect(screen.queryByRole('heading', { name: 'Did you take your meds?' })).toBeNull();
    expect(screen.queryByTestId('today-strip-meds')).toBeNull();
  });
});

describe('your numbers', () => {
  it('the streak tile reads the response envelope', async () => {
    streakService.getLoginStreak.mockResolvedValueOnce({ success: true, data: { currentStreak: 12, longestStreak: 30 } });
    renderHome(experience());
    const region = await screen.findByRole('region', { name: 'Your numbers' });
    await screen.findByText('12');
    expect(within(region).getByText('12')).toBeInTheDocument();
  });

  it('the BP tile shows the newest reading by time taken, not the first row of the day', async () => {
    bpService.getBPLogs.mockResolvedValueOnce({ data: [
      { systolic: 128, diastolic: 84, measured_at: `${TODAY}T12:05:00.000Z`, log_date: `${TODAY}T00:00:00.000Z` },
      { systolic: 117, diastolic: 76, measured_at: `${TODAY}T23:40:00.000Z`, log_date: `${TODAY}T00:00:00.000Z` },
    ] });
    renderHome(experience());
    expect(await screen.findByText('117/76')).toBeInTheDocument();
  });

  it('the tiles lead to their pages; with no watch there is no Steps tile', async () => {
    renderHome(experience());
    const region = await screen.findByRole('region', { name: 'Your numbers' });
    const hrefs = within(region).getAllByRole('link').map((l) => l.getAttribute('href'));
    expect(hrefs).toEqual(['/weight', '/blood-pressure']);
    expect(within(region).queryByText('Steps')).toBeNull();
  });

  it('a step count from a watch brings the Steps tile, leading to the Activity tab of Trends', async () => {
    fitnessGeekService.getGarminDaily.mockResolvedValueOnce({ steps: 8421 });
    renderHome(experience());
    const region = await screen.findByRole('region', { name: 'Your numbers' });
    expect(await within(region).findByText('Steps')).toBeInTheDocument();
    const hrefs = within(region).getAllByRole('link').map((l) => l.getAttribute('href'));
    expect(hrefs).toEqual(['/weight', '/blood-pressure', '/trends?tab=activity']);
  });
});
