/**
 * Today tells the truth about its own reads, and shows amounts (UX review
 * 2026-10-17, kept through DOCS/ONE_APP_PLAN.md §1 "A failed read is still
 * never an empty day"):
 *
 *   L1  a failed read is not an empty day: no "Nothing yet", no "Nothing
 *       logged yet today", no "Weigh in +" from a read that failed; what was
 *       on screen stays; one line says FitnessGeek can't be reached, with
 *       Try again. The same after a failed reload following her own log.
 *       Both halves of the page obey it: the summary and the meals.
 *   L4  "×2" beside a food when servings ≠ 1; every entry keeps its own row.
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
// The add sheet, reduced to what the page hands it: open, and onClose({ mealType }).
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

beforeEach(() => {
  vi.clearAllMocks();
  onChanged = null;
  goodDay();
  try { window.localStorage.clear(); } catch { /* jsdom */ }
});

describe('Today on a failed load (L1)', () => {
  it('a first load that fails never reads as an empty day', async () => {
    badDay();
    renderHome(experience({ goal: 'lose' }));
    const problem = await screen.findByTestId('home-load-problem');
    expect(problem).toHaveTextContent(PROBLEM);
    expect(within(problem).getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    const text = document.body.textContent;
    expect(text).not.toMatch(/Nothing yet/);
    expect(text).not.toMatch(/Nothing logged yet today/);
    expect(text).not.toMatch(/Weigh in/);
    expect(screen.queryByTestId('calories-sentence')).toBeNull();
    expect(screen.queryByTestId('plate-number')).toBeNull();
    // No target offer off a target that was never read.
    expect(screen.queryByTestId('set-daily-target')).toBeNull();
    // The meals are unknown, not empty.
    for (const meal of ['breakfast', 'lunch', 'dinner', 'snack']) {
      expect(screen.getByTestId(`meal-total-${meal}`)).toHaveTextContent('—');
    }
    // And the details never draw zeros from a summary that was never read.
    fireEvent.click(screen.getByTestId('macros-details-toggle'));
    expect(screen.getByTestId('today-details')).toBeInTheDocument();
    expect(screen.queryByTestId('macro-strip')).toBeNull();
  });

  it('Try again reads the day again, and the sentence comes back', async () => {
    badDay();
    renderHome(experience());
    const problem = await screen.findByTestId('home-load-problem');
    goodDay();
    await act(async () => { fireEvent.click(within(problem).getByRole('button', { name: 'Try again' })); });
    expect(await screen.findByTestId('calories-sentence')).toHaveTextContent('You have 980 calories left today');
    expect(screen.queryByTestId('home-load-problem')).toBeNull();
    expect(screen.getByText('Greek yogurt')).toBeInTheDocument();
  });

  it('a failed reload after her own log keeps the rows she filled, and says so', async () => {
    renderHome(experience());
    await screen.findByText('Greek yogurt');
    expect(screen.getByTestId('today-strip-weight')).toHaveAttribute('data-done', 'true');
    badDay();
    await act(async () => { await onChanged(); });
    expect(await screen.findByTestId('home-load-problem')).toHaveTextContent(PROBLEM);
    expect(screen.getByText('Greek yogurt')).toBeInTheDocument();
    expect(screen.getByText('Caesar salad')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/Nothing logged yet today|Weigh in/);
    expect(screen.getByTestId('meal-total-breakfast')).toHaveTextContent('190 cal');
    expect(screen.getByTestId('today-strip-weight')).toHaveAttribute('data-done', 'true');
  });

  it('only the meals failing still says so, and still never says "Nothing yet"', async () => {
    fitnessGeekService.getLogsForDate.mockImplementation(down);
    renderHome(experience());
    expect(await screen.findByTestId('home-load-problem')).toHaveTextContent(PROBLEM);
    expect(screen.getByTestId('meal-cards').textContent).not.toMatch(/Nothing yet/);
  });
});

describe('amounts on Today (L4)', () => {
  it('each entry keeps its own row, with its amount beside the name', async () => {
    fitnessGeekService.getLogsForDate.mockImplementation(() => Promise.resolve([
      log('e1', 'Egg', 'breakfast', 78),
      log('e2', 'Egg', 'breakfast', 78),
      log('t', 'Toast', 'breakfast', 90, 1.5),
      log('m', 'Milk', 'lunch', 100, 2),
    ]));
    renderHome(experience());
    const breakfast = await screen.findByTestId('meal-card-breakfast');
    const rows = within(breakfast).getAllByTestId('food-log-row');
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveAccessibleName('Edit Egg, 78 cal');
    expect(rows[2]).toHaveAccessibleName('Edit Toast, ×1.5, 135 cal');
    expect(within(screen.getByTestId('meal-card-lunch')).getByTestId('food-log-row')).toHaveAccessibleName('Edit Milk, ×2, 200 cal');
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
