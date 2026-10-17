/**
 * UX review 2026-10-17 — Home tells the truth about its own reads, and shows
 * amounts:
 *
 *   L1  a failed read is not an empty day: no "Nothing yet", no "Nothing
 *       logged yet today", no "Weigh in +" from a read that failed; what was
 *       on screen stays; one line says FitnessGeek can't be reached, with
 *       Try again. The same after a failed reload following her own log.
 *   L4  "Egg ×2" when servings ≠ 1, and identical names merge in Simple.
 *   L12 after the add sheet closes on a meal, that meal's card scrolls into view.
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

const PROBLEM = 'Can’t reach FitnessGeek right now. What you logged is safe.';
const goodDay = () => {
  fitnessGeekService.getDailySummary.mockImplementation(() => Promise.resolve({ data: { totals: { calories: 670 }, calorieGoal: 1650, meals: {} } }));
  fitnessGeekService.getLogsForDate.mockImplementation(() => Promise.resolve([
    log('a', 'Greek yogurt', 'breakfast', 190),
    log('b', 'Caesar salad', 'lunch', 480),
  ]));
  goalsService.getDerivedMacros.mockImplementation(() => Promise.resolve({ data: { today: { target_calories: 1650 } } }));
  weightService.getWeightLogs.mockImplementation(() => Promise.resolve({ data: [{ log_date: `${TODAY}T00:00:00.000Z`, weight_value: 160 }] }));
};
const badDay = () => {
  fitnessGeekService.getDailySummary.mockImplementation(down);
  fitnessGeekService.getLogsForDate.mockImplementation(down);
  goalsService.getDerivedMacros.mockImplementation(down);
  weightService.getWeightLogs.mockImplementation(down);
};

beforeEach(() => { vi.clearAllMocks(); onChanged = null; goodDay(); });

describe('Home on a failed load (L1)', () => {
  it.each([['Simple', SIMPLE], ['Full', {}]])('%s: a first load that fails never reads as an empty day', async (_mode, over) => {
    badDay();
    renderHome(experience({ ...over, goal: 'lose' }));
    const problem = await screen.findByTestId('home-load-problem');
    expect(problem).toHaveTextContent(PROBLEM);
    expect(within(problem).getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    const text = document.body.textContent;
    expect(text).not.toMatch(/Nothing yet/);
    expect(text).not.toMatch(/Nothing logged yet today/);
    expect(text).not.toMatch(/Weigh in/);
    expect(screen.queryByTestId('calories-sentence')).toBeNull();
    // No target offer off a target that was never read.
    expect(screen.queryByTestId('set-daily-target')).toBeNull();
    expect(screen.queryByTestId('macro-strip')).toBeNull();
  });

  it('Try again reads the day again, and the sentence comes back', async () => {
    badDay();
    renderHome(experience(SIMPLE));
    const problem = await screen.findByTestId('home-load-problem');
    goodDay();
    await act(async () => { fireEvent.click(within(problem).getByRole('button', { name: 'Try again' })); });
    expect(await screen.findByTestId('calories-sentence')).toHaveTextContent('You have 980 calories left today');
    expect(screen.queryByTestId('home-load-problem')).toBeNull();
    expect(screen.getByText('Greek yogurt')).toBeInTheDocument();
  });

  it('a failed reload after her own log keeps the cards she filled, and says so', async () => {
    renderHome(experience(SIMPLE));
    await screen.findByText('Greek yogurt');
    expect(screen.getByTestId('today-strip-weight')).toHaveAttribute('data-done', 'true');
    badDay();
    await act(async () => { await onChanged(); });
    expect(await screen.findByTestId('home-load-problem')).toHaveTextContent(PROBLEM);
    expect(screen.getByText('Greek yogurt')).toBeInTheDocument();
    expect(screen.getByText('Caesar salad')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/Nothing logged yet today|Weigh in/);
    expect(within(screen.getByTestId('meal-card-breakfast')).queryByText('Nothing yet')).toBeNull();
    expect(screen.getByTestId('today-strip-weight')).toHaveAttribute('data-done', 'true');
  });
});

describe('amounts on Home (L4)', () => {
  it('Simple: two Egg entries merge to "Egg ×2"; a 2-serving toast reads "Toast ×2"', async () => {
    fitnessGeekService.getLogsForDate.mockImplementation(() => Promise.resolve([
      log('e1', 'Egg', 'breakfast', 78),
      log('e2', 'Egg', 'breakfast', 78),
      log('t', 'Toast', 'lunch', 90, 2),
    ]));
    renderHome(experience(SIMPLE));
    const breakfast = await screen.findByTestId('meal-card-breakfast');
    expect(within(breakfast).getByText('Egg ×2')).toBeInTheDocument();
    expect(within(breakfast).queryByText('Egg')).toBeNull();
    expect(within(breakfast).queryByText(/more/)).toBeNull();
    expect(within(screen.getByTestId('meal-card-lunch')).getByText('Toast ×2')).toBeInTheDocument();
  });

  it('Full: each entry keeps its own row (and its ✕), with its amount', async () => {
    fitnessGeekService.getLogsForDate.mockImplementation(() => Promise.resolve([
      log('e1', 'Egg', 'breakfast', 78),
      log('t', 'Toast', 'breakfast', 90, 1.5),
    ]));
    renderHome(experience());
    const breakfast = await screen.findByTestId('meal-card-breakfast');
    expect(within(breakfast).getByText('Egg')).toBeInTheDocument();
    expect(within(breakfast).getByText('Toast ×1.5')).toBeInTheDocument();
    expect(within(breakfast).getAllByRole('button', { name: /^Remove / })).toHaveLength(2);
  });
});

describe('after the add sheet closes (L12)', () => {
  it("scrolls the landed meal's card into view", async () => {
    const scrolled = [];
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function record() { scrolled.push(this.id); };
    const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => { cb(0); return 0; });
    try {
      renderHome(experience());
      await screen.findByTestId('meal-cards');
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Add to dinner' })); });
      await act(async () => { fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Done' })); });
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(scrolled).toContain('meal-card-dinner');
    } finally {
      Element.prototype.scrollIntoView = original;
      raf.mockRestore();
    }
  });
});
