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
vi.mock('@geeksuite/ui', async (importOriginal) => ({
  ...(await importOriginal()),
  useToast: () => ({ notify: vi.fn() }),
}));

const { ExperienceContext } = await import('../../contexts/ExperienceContext.jsx');
const { default: DashboardNew } = await import('../DashboardNew.jsx');

const experience = (over = {}) => ({
  loading: false,
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

beforeEach(() => vi.clearAllMocks());

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
    expect(within(strip).getByTestId('today-strip-bp')).toHaveTextContent('BP—');
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
