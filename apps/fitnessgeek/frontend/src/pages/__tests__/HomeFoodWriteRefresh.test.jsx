/**
 * SUITE_REVIEW_2026-11 FitnessGeek #5 (and the Home half of #1).
 *
 * Every food write on Home used to re-run the whole page load: eight reads,
 * five of them live Garmin calls behind `getGarminDaily`, plus every weight
 * and every BP reading ever — to redraw a plate. A food write can change the
 * day's summary and its logs, nothing else, so those two are all it re-asks.
 * The page's first load (and Try again) still reads everything; Home's
 * weight/BP check-ins ask for the newest few rows, not the whole history.
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
    formatDate: () => '2026-09-27',
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
const { default: DashboardNew } = await import('../DashboardNew.jsx');

const experience = (over = {}) => ({
  loading: false, known: true, savedMode: 'full', effectiveMode: 'full', isSimple: false, largerText: false,
  firstRunDone: true, preferredName: null, displayName: 'Chef', goal: null,
  setMode: vi.fn(), setLargerText: vi.fn(), completeFirstRun: vi.fn(), update: vi.fn(),
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

describe('Home after a food write', () => {
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
    // The plate moved; what was read before (the weigh-in) is still there.
    expect(screen.getByText('Caesar salad')).toBeInTheDocument();
    expect(screen.getByText('Weighed')).toBeInTheDocument();
  });

  it('Home asks for the newest few weight and BP rows, not every row ever', async () => {
    renderHome(experience());
    await screen.findByText('Greek yogurt');
    expect(weightService.getWeightLogs).toHaveBeenCalledWith({ limit: 20 });
    expect(bpService.getBPLogs).toHaveBeenCalledWith({ limit: 20 });
  });
});
