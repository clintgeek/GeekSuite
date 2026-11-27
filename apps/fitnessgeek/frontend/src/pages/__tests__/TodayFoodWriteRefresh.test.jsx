/**
 * SUITE_REVIEW_2026-11 FitnessGeek #5 (and the Home half of #1), kept on
 * Today (DOCS/ONE_APP_PLAN.md §1).
 *
 * Every food write used to re-run the whole page load: eight reads, five of
 * them live Garmin calls behind `getGarminDaily`, plus every weight and
 * every BP reading ever — to redraw a ring. A food write can change the
 * day's summary and its logs, nothing else, so those two are all it re-asks.
 * Moving to another day is the same: only that day's food is asked for. The
 * page's first load (and Try again) still reads everything; the weight / BP
 * check-ins ask for the newest few rows, not the whole history.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import { createFitnessTheme } from '../../theme/theme.jsx';

const TODAY = '2026-09-27';
const log = (id, name, meal, cal, servings = 1) => ({
  id, meal_type: meal, servings, log_date: `${TODAY}T00:00:00.000Z`,
  nutrition: { calories_per_serving: cal }, food_item_id: { id: `f-${id}`, name },
});
const down = () => Promise.reject(Object.assign(new Error('Bad gateway'), { networkError: { statusCode: 502 } }));

vi.mock('../../services/fitnessGeekService.js', () => ({
  fitnessGeekService: {
    formatDate: (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
    getDailySummary: vi.fn(),
    getGarminDaily: vi.fn(() => Promise.resolve(null)),
    getLogsForDate: vi.fn(),
    deleteFoodLog: vi.fn(),
  },
}));
vi.mock('../../services/goalsService.js', () => ({ goalsService: { getDerivedMacros: vi.fn() } }));
vi.mock('../../services/weightService.js', () => ({
  weightService: { getWeightStats: vi.fn(() => Promise.resolve(null)), getWeightLogs: vi.fn() },
}));
vi.mock('../../services/bpService.js', () => ({ bpService: { getBPLogs: vi.fn(() => Promise.resolve({ data: [] })) } }));
vi.mock('../../services/streakService.js', () => ({ streakService: { getLoginStreak: vi.fn(() => Promise.resolve(null)) } }));
vi.mock('../../services/settingsService.js', () => ({ settingsService: { getSettings: vi.fn(() => Promise.resolve({ data: {} })) } }));
vi.mock('../../services/bodyCompService.js', () => ({ bodyCompService: { getSummary: vi.fn(() => Promise.resolve(null)) } }));
vi.mock('../../services/medsService.js', () => ({
  medsService: { list: vi.fn(() => Promise.resolve([])), getLogsByDate: vi.fn(() => Promise.resolve([])), log: vi.fn() },
}));
let onChanged = null;
vi.mock('../../hooks/useFoodLogging.js', () => ({
  useFoodLogging: (opts) => {
    onChanged = opts.onChanged;
    return { logItems: vi.fn(), undoLogs: vi.fn(), describeMeal: vi.fn(), adjustLogCalories: vi.fn() };
  },
}));
// The add sheet, reduced to what Home hands it: open, and onClose({ mealType }).
vi.mock('../../components/FoodLog/AddFoodDialog.jsx', () => ({
  default: ({ open, onClose, mealType }) => (open ? (
    <div role="dialog">
      <button type="button" onClick={() => onClose({ mealType })}>Done</button>
    </div>
  ) : null),
}));
vi.mock('../../components/Dashboard/AIInsightsCard.jsx', () => ({ default: () => <div data-testid="insights" /> }));
vi.mock('@geeksuite/ui', async (importOriginal) => ({ ...(await importOriginal()), useToast: () => ({ notify: vi.fn() }) }));
vi.mock('../../hooks/useToday.js', () => ({ useToday: () => TODAY, default: () => TODAY }));
const navigateSpy = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => ({ ...(await importOriginal()), useNavigate: () => navigateSpy }));

const { ExperienceContext } = await import('../../contexts/ExperienceContext.jsx');
const { fitnessGeekService } = await import('../../services/fitnessGeekService.js');
const { goalsService } = await import('../../services/goalsService.js');
const { weightService } = await import('../../services/weightService.js');
const { bpService } = await import('../../services/bpService.js');
const { streakService } = await import('../../services/streakService.js');
const { default: Today } = await import('../Today.jsx');

const experience = (over = {}) => ({
  loading: false, known: true, needsFirstRun: false, largerText: false,
  firstRunDone: true, preferredName: null, displayName: 'Chef', goal: null,
  setLargerText: vi.fn(), completeFirstRun: vi.fn(), update: vi.fn(),
  ...over,
});

const renderHome = (value) => render(
  <ThemeProvider theme={createFitnessTheme('light')}>
    <ExperienceContext.Provider value={value}>
      <MemoryRouter><Today /></MemoryRouter>
    </ExperienceContext.Provider>
  </ThemeProvider>
);


const goodDay = () => {
  fitnessGeekService.getDailySummary.mockImplementation(() => Promise.resolve({ data: { totals: { calories: 190 }, calorieGoal: 1650, meals: {} } }));
  fitnessGeekService.getLogsForDate.mockImplementation(() => Promise.resolve([log('a', 'Greek yogurt', 'breakfast', 190)]));
  goalsService.getDerivedMacros.mockImplementation(() => Promise.resolve({ data: { today: { target_calories: 1650 } } }));
  weightService.getWeightLogs.mockImplementation(() => Promise.resolve({ data: [{ log_date: `${TODAY}T00:00:00.000Z`, weight_value: 160 }] }));
};

const OTHER_READS = () => [
  fitnessGeekService.getGarminDaily,
  goalsService.getDerivedMacros,
  weightService.getWeightStats,
  weightService.getWeightLogs,
  bpService.getBPLogs,
  streakService.getLoginStreak,
];

beforeEach(() => { vi.clearAllMocks(); onChanged = null; goodDay(); });

describe('Today after a food write', () => {
  it('re-asks only the day\'s summary and logs — no Garmin, weights, BP, goals or streak', async () => {
    renderHome(experience());
    expect(await screen.findByText('Greek yogurt')).toBeInTheDocument();
    for (const fn of OTHER_READS()) expect(fn).toHaveBeenCalledTimes(1);
    vi.clearAllMocks();

    fitnessGeekService.getLogsForDate.mockImplementation(() => Promise.resolve([
      log('a', 'Greek yogurt', 'breakfast', 190),
      log('b', 'Caesar salad', 'lunch', 480),
    ]));
    fitnessGeekService.getDailySummary.mockImplementation(() => Promise.resolve({ data: { totals: { calories: 670 }, calorieGoal: 1650, meals: {} } }));
    await act(async () => { await onChanged(); });

    expect(fitnessGeekService.getDailySummary).toHaveBeenCalledTimes(1);
    expect(fitnessGeekService.getLogsForDate).toHaveBeenCalledTimes(1);
    for (const fn of OTHER_READS()) expect(fn).not.toHaveBeenCalled();
    // The ring moved; what was read before (the weigh-in) is still there.
    expect(screen.getByText('Caesar salad')).toBeInTheDocument();
    expect(screen.getByText('Weighed')).toBeInTheDocument();
  });

  it('moving to another day asks for that day\'s food only, and Garmin is still asked about the real today', async () => {
    renderHome(experience());
    await screen.findByText('Greek yogurt');
    expect(fitnessGeekService.getGarminDaily).toHaveBeenCalledWith(TODAY);
    vi.clearAllMocks();
    fitnessGeekService.getLogsForDate.mockImplementation(() => Promise.resolve([log('y', 'Leftover pizza', 'dinner', 600)]));
    fitnessGeekService.getDailySummary.mockImplementation(() => Promise.resolve({ data: { totals: { calories: 600 }, calorieGoal: 1650, meals: {} } }));

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Previous day' })); });

    expect(await screen.findByText('Leftover pizza')).toBeInTheDocument();
    expect(fitnessGeekService.getDailySummary).toHaveBeenCalledTimes(1);
    expect(fitnessGeekService.getDailySummary).toHaveBeenCalledWith('2026-09-26');
    expect(fitnessGeekService.getLogsForDate).toHaveBeenCalledWith('2026-09-26');
    for (const fn of OTHER_READS()) expect(fn).not.toHaveBeenCalled();
  });

  it('Try again reads everything again', async () => {
    fitnessGeekService.getLogsForDate.mockImplementation(down);
    renderHome(experience());
    const problem = await screen.findByTestId('home-load-problem');
    vi.clearAllMocks();
    goodDay();
    await act(async () => { fireEvent.click(within(problem).getByRole('button', { name: 'Try again' })); });
    expect(await screen.findByText('Greek yogurt')).toBeInTheDocument();
    for (const fn of OTHER_READS()) expect(fn).toHaveBeenCalledTimes(1);
  });

  it('asks for the newest few weight and BP rows, not every row ever', async () => {
    renderHome(experience());
    await screen.findByText('Greek yogurt');
    expect(weightService.getWeightLogs).toHaveBeenCalledWith({ limit: 20 });
    expect(bpService.getBPLogs).toHaveBeenCalledWith({ limit: 20 });
  });
});
