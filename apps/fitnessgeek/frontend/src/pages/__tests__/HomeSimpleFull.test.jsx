/**
 * Home, both faces (DOCS/SIMPLE_AND_FULL_PLAN.md items 1, 6 and "Simple mode,
 * specifically for Heather"):
 *
 *   - the answer in words, with the plate;
 *   - a meal card's "+ Add" opens the add sheet already set to that meal;
 *   - the Today strip's states;
 *   - Simple drops the macros and stat cards and adds "Did you take your
 *     meds?"; Full keeps them;
 *   - the first run shows once, only to a Simple person who never chose.
 *
 * The mode comes from a real ExperienceContext value, not a mock of the page.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within, act } from '@testing-library/react';
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
const { default: DashboardNew } = await import('../DashboardNew.jsx');

const experience = (over = {}) => ({
  loading: false,
  known: true,
  savedMode: 'full',
  effectiveMode: 'full',
  isSimple: false,
  largerText: false,
  firstRunDone: true,
  preferredName: null,
  displayName: 'Chef',
  goal: null,
  setMode: vi.fn(),
  setLargerText: vi.fn(),
  completeFirstRun: vi.fn(() => Promise.resolve({ ok: true })),
  update: vi.fn(),
  ...over,
});
const SIMPLE = { savedMode: 'simple', effectiveMode: 'simple', isSimple: true, displayName: 'Heather' };

const renderHome = (value) => render(
  <ThemeProvider theme={createFitnessTheme('light')}>
    <ExperienceContext.Provider value={value}>
      <MemoryRouter><DashboardNew /></MemoryRouter>
    </ExperienceContext.Provider>
  </ThemeProvider>
);

beforeEach(() => { vi.clearAllMocks(); todayValue = TODAY; });

describe('Home answers in words', () => {
  it('"You have 660 calories left today", with a plate that says the same', async () => {
    renderHome(experience());
    expect(await screen.findByTestId('calories-sentence')).toHaveTextContent('You have 660 calories left today');
    expect(screen.getByRole('img', { name: /You have 660 calories left today\. 1,680 eaten of 2,340/ })).toBeInTheDocument();
    // No day-of-year counter, no receipt number.
    expect(document.body.textContent).not.toMatch(/\d+\/36[56]|NO\./);
  });
});

describe('meal cards', () => {
  it("each card's + Add opens the add sheet already set to that meal", async () => {
    renderHome(experience());
    await screen.findByTestId('meal-cards');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Add to lunch' })); });
    const sheet = await screen.findByRole('dialog');
    expect(within(sheet).getByText('Add to lunch')).toBeInTheDocument();
    expect(within(sheet).getByRole('button', { name: 'Lunch', pressed: true })).toBeInTheDocument();
    expect(within(sheet).getByRole('button', { name: 'Breakfast', pressed: false })).toBeInTheDocument();
  });

  it('there are four, in meal order, each with its own Add', async () => {
    renderHome(experience());
    await screen.findByTestId('meal-cards');
    expect(screen.getAllByRole('button', { name: /^Add to / }).map((b) => b.getAttribute('aria-label')))
      .toEqual(['Add to breakfast', 'Add to lunch', 'Add to dinner', 'Add to snacks']);
  });
});

describe('the Today strip', () => {
  it('reads Weighed ✓ · BP — · Meds 1 of 3', async () => {
    renderHome(experience());
    const strip = await screen.findByTestId('today-strip');
    expect(within(strip).getByTestId('today-strip-weight')).toHaveAttribute('data-done', 'true');
    expect(within(strip).getByTestId('today-strip-bp')).toHaveTextContent('Add BP+');
    expect(within(strip).getByTestId('today-strip-bp')).toHaveAttribute('href', '/blood-pressure?add=1');
    expect(await within(strip).findByTestId('today-strip-meds')).toHaveTextContent('Meds1 of 3');
  });
});

describe('Simple and Full', () => {
  it('Full keeps the macros, the numbers and insights; no meds checklist on Home', async () => {
    renderHome(experience());
    expect(await screen.findByTestId('macro-strip')).toBeInTheDocument();
    expect(screen.getByTestId('insights')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Your numbers' })).toBeInTheDocument();
    expect(screen.queryByTestId('meds-checklist')).toBeNull();
    expect(screen.getByRole('button', { name: 'Remove Greek yogurt from breakfast' })).toBeInTheDocument();
  });

  it('Simple keeps them out of the way and asks "Did you take your meds?"', async () => {
    renderHome(experience(SIMPLE));
    expect(await screen.findByTestId('calories-sentence')).toBeInTheDocument();
    expect(screen.queryByTestId('macro-strip')).toBeNull();
    expect(screen.queryByTestId('insights')).toBeNull();
    expect(screen.queryByRole('region', { name: 'Your numbers' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Remove / })).toBeNull();
    expect(await screen.findByRole('heading', { name: 'Did you take your meds?' })).toBeInTheDocument();
    expect(screen.getByText('Good', { exact: false })).toHaveTextContent(/, Heather$/);
  });
});

describe('first run', () => {
  it('shows to a Simple person who never chose and never finished it', async () => {
    renderHome(experience({ ...SIMPLE, savedMode: null, firstRunDone: false }));
    expect(await screen.findByTestId('first-run')).toBeInTheDocument();
    expect(screen.queryByTestId('meal-cards')).toBeNull();
  });

  it('shows to a Simple person whose derived mode was saved but who never finished it', async () => {
    renderHome(experience({ ...SIMPLE, savedMode: 'simple', firstRunDone: false }));
    expect(await screen.findByTestId('first-run')).toBeInTheDocument();
  });

  it('never while the saved settings could not be read', async () => {
    renderHome(experience({ ...SIMPLE, savedMode: null, firstRunDone: false, known: false }));
    expect(await screen.findByTestId('meal-cards')).toBeInTheDocument();
    expect(screen.queryByTestId('first-run')).toBeNull();
  });

  it('a failed first-run save tells her, in plain words', async () => {
    const completeFirstRun = vi.fn(() => Promise.resolve({ ok: false, error: { networkError: { statusCode: 503 } } }));
    renderHome(experience({ ...SIMPLE, savedMode: null, firstRunDone: false, completeFirstRun }));
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

  it('never to Full, and never again once done', async () => {
    const { unmount } = renderHome(experience({ savedMode: null, firstRunDone: false }));
    expect(await screen.findByTestId('meal-cards')).toBeInTheDocument();
    expect(screen.queryByTestId('first-run')).toBeNull();
    unmount();
    renderHome(experience({ ...SIMPLE, savedMode: 'simple', firstRunDone: true }));
    expect(await screen.findByTestId('meal-cards')).toBeInTheDocument();
    expect(screen.queryByTestId('first-run')).toBeNull();
  });
});

describe('a PWA resumed the next morning (review B3)', () => {
  it("Home reads useToday()'s day, not the day it was opened", async () => {
    todayValue = '2026-10-16';
    renderHome(experience());
    await screen.findByTestId('meal-cards');
    expect(fitnessGeekService.getLogsForDate).toHaveBeenCalledWith('2026-10-16');
    expect(screen.getByText('Friday, October 16')).toBeInTheDocument();
  });
});

describe('Simple Home: Add first (review Phase 2.13)', () => {
  it('a big "What did you eat?" right under the greeting opens the sheet on this hour\'s meal', async () => {
    renderHome(experience(SIMPLE));
    const button = await screen.findByTestId('what-did-you-eat');
    const hero = screen.getByTestId('home-hero');
    // Above the plate in the page.
    expect(button.compareDocumentPosition(hero) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await act(async () => { fireEvent.click(button); });
    const sheet = await screen.findByRole('dialog');
    const meal = mealTypeForHour(new Date().getHours());
    expect(within(sheet).getByText(new RegExp(`^Add to ${meal === 'snack' ? 'snacks?' : meal}$`))).toBeInTheDocument();
  });

  it('the plate does not repeat the number the sentence says', async () => {
    renderHome(experience(SIMPLE));
    await screen.findByTestId('calories-sentence');
    expect(screen.queryByTestId('plate-number')).toBeNull();
    expect(document.body.textContent.match(/660/g)).toHaveLength(1);
  });

  it('Full keeps the number in the plate and has no big Add button', async () => {
    renderHome(experience());
    await screen.findByTestId('calories-sentence');
    expect(screen.getByTestId('plate-number')).toBeInTheDocument();
    expect(screen.queryByTestId('what-did-you-eat')).toBeNull();
  });
});

describe('the first-run goal is used (review Phase 2.14)', () => {
  it('"lose a little" with no target: one sentence and Set your daily target, not "No daily target is set"', async () => {
    goalsService.getDerivedMacros.mockResolvedValueOnce({ data: {} });
    fitnessGeekService.getDailySummary.mockResolvedValueOnce({ data: { totals: { calories: 480 }, meals: {} } });
    renderHome(experience({ ...SIMPLE, goal: 'lose' }));
    const button = await screen.findByTestId('set-daily-target');
    expect(document.body.textContent).not.toMatch(/No daily target is set/);
    await act(async () => { fireEvent.click(button); });
    expect(navigateSpy).toHaveBeenCalledWith('/calorie-wizard');
  });

  it('no offer when a target exists', async () => {
    renderHome(experience({ ...SIMPLE, goal: 'lose' }));
    await screen.findByTestId('calories-sentence');
    expect(screen.queryByTestId('set-daily-target')).toBeNull();
  });
});

describe('Simple Home with no medications', () => {
  it('offers a quiet "Track your meds" to /medications', async () => {
    medsService.list.mockResolvedValueOnce([]);
    medsService.getLogsByDate.mockResolvedValueOnce([]);
    renderHome(experience(SIMPLE));
    const link = await screen.findByTestId('track-meds');
    expect(link).toHaveAttribute('href', '/medications');
    expect(screen.queryByRole('heading', { name: 'Did you take your meds?' })).toBeNull();
  });
});

describe('Full numbers', () => {
  it('the streak card reads the response envelope', async () => {
    streakService.getLoginStreak.mockResolvedValueOnce({ success: true, data: { currentStreak: 12, longestStreak: 30 } });
    renderHome(experience());
    const region = await screen.findByRole('region', { name: 'Your numbers' });
    await screen.findByText('12');
    expect(within(region).getByText('12')).toBeInTheDocument();
  });

  it('the BP card shows the newest reading by time taken, not the first row of the day', async () => {
    bpService.getCurrentBP.mockResolvedValueOnce({ systolic: 128, diastolic: 84, measured_at: `${TODAY}T12:05:00.000Z`, log_date: `${TODAY}T00:00:00.000Z` });
    bpService.getBPLogs.mockResolvedValueOnce({ data: [
      { systolic: 128, diastolic: 84, measured_at: `${TODAY}T12:05:00.000Z`, log_date: `${TODAY}T00:00:00.000Z` },
      { systolic: 117, diastolic: 76, measured_at: `${TODAY}T23:40:00.000Z`, log_date: `${TODAY}T00:00:00.000Z` },
    ] });
    renderHome(experience());
    expect(await screen.findByText('117/76')).toBeInTheDocument();
  });
});
