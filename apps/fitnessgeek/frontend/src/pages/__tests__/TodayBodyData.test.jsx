/**
 * Today's wiring for the body-data plan: the stale-plan note shows for
 * Chef's real saved plan (on the card, not behind the disclosure); the
 * protein target is captioned when derivedMacros set it from lean mass
 * (behind "Macros and details"); and the Weight tile shows the smoothed
 * change or says why it can't.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../services/fitnessGeekService.js', () => ({
  fitnessGeekService: {
    formatDate: () => '2026-09-22',
    getDailySummary: vi.fn(() => Promise.resolve({ data: { totals: {}, calorieGoal: 2000, meals: {} } })),
    getGarminDaily: vi.fn(() => Promise.resolve(null)),
    getLogsForDate: vi.fn(() => Promise.resolve([])),
    deleteFoodLog: vi.fn(),
  },
}));
vi.mock('../../services/goalsService.js', () => ({ goalsService: { getDerivedMacros: vi.fn() } }));
vi.mock('../../services/weightService.js', () => ({ weightService: { getWeightStats: vi.fn(), getWeightLogs: vi.fn(() => Promise.resolve({ data: [] })) } }));
vi.mock('../../services/bpService.js', () => ({ bpService: { getCurrentBP: vi.fn(() => Promise.resolve(null)), getBPLogs: vi.fn(() => Promise.resolve({ data: [] })) } }));
vi.mock('../../services/medsService.js', () => ({ medsService: { list: vi.fn(() => Promise.resolve([])), getLogsByDate: vi.fn(() => Promise.resolve([])), log: vi.fn() } }));
vi.mock('../../services/streakService.js', () => ({ streakService: { getLoginStreak: vi.fn(() => Promise.resolve(null)) } }));
vi.mock('../../services/settingsService.js', () => ({ settingsService: { getSettings: vi.fn() } }));
vi.mock('../../services/bodyCompService.js', () => ({ bodyCompService: { getSummary: vi.fn() } }));
vi.mock('../../hooks/useFoodLogging.js', () => ({ useFoodLogging: () => ({ logItems: vi.fn(), undoLogs: vi.fn(), describeMeal: vi.fn(), adjustLogCalories: vi.fn() }) }));
vi.mock('../../components/Dashboard/AIInsightsCard.jsx', () => ({ default: () => null }));
vi.mock('@geeksuite/ui', async (importOriginal) => ({
  ...(await importOriginal()),
  useToast: () => ({ notify: vi.fn() }),
}));

const { goalsService } = await import('../../services/goalsService.js');
const { weightService } = await import('../../services/weightService.js');
const { settingsService } = await import('../../services/settingsService.js');
const { bodyCompService } = await import('../../services/bodyCompService.js');
const { default: Today } = await import('../Today.jsx');

const CHEF_PLAN = { enabled: true, mode: 'standard', bmr: 3314, tdee: 3977, daily_calorie_target: 2977 };
const derived = (protein_basis) => ({
  data: {
    rules: { protein_basis },
    fixed: { protein_g: 177, fat_g: 88 },
    calories: { daily: 2977 },
    today: { target_calories: 2798, protein_g: 177, fat_g: 88, carbs_g: 300 },
  },
});

function setup({ ng = CHEF_PLAN, basis = 'lean_mass', weight = { totalChange: -2.4, reason: null } } = {}) {
  settingsService.getSettings.mockResolvedValue({ data: { nutrition_goal: ng } });
  bodyCompService.getSummary.mockResolvedValue({ data: { bmr: { bmr: 2104, source: 'scan', lean_mass_lb: 177, scans: 8 } } });
  goalsService.getDerivedMacros.mockResolvedValue(derived(basis));
  weightService.getWeightStats.mockResolvedValue({ success: true, data: weight });
  render(<MemoryRouter><Today /></MemoryRouter>);
}

describe('Today — body data', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    try { window.localStorage.clear(); } catch { /* jsdom */ }
  });

  const openDetails = async () => fireEvent.click(await screen.findByTestId('macros-details-toggle'));

  it("shows the stale-plan banner for Chef's saved plan", async () => {
    setup();
    const banner = await screen.findByTestId('plan-accuracy-banner');
    expect(banner).toHaveAttribute('data-kind', 'stale');
    // A warning is not a detail: it shows with the disclosure closed.
    expect(screen.queryByTestId('today-details')).toBeNull();
  });

  it('shows no banner without a plan', async () => {
    setup({ ng: null });
    await screen.findByText('Today’s meals');
    expect(screen.queryByTestId('plan-accuracy-banner')).toBeNull();
  });

  it('captions the protein target "from your body scans" only when derivedMacros says so', async () => {
    setup();
    await openDetails();
    expect(await screen.findByTestId('macro-note-protein')).toHaveTextContent('from your body scans');
  });

  it('no protein caption on the goal-weight rule', async () => {
    setup({ basis: 'goal_weight' });
    await openDetails();
    expect(await screen.findByTestId('macro-strip')).toBeInTheDocument();
    expect(screen.queryByTestId('macro-note-protein')).toBeNull();
  });

  it('shows the current 7-day average, with the smoothed change underneath', async () => {
    setup({ weight: { totalChange: -2.4, currentMean: 318.2, reason: null } });
    expect(await screen.findByText('318.2')).toBeInTheDocument();
    expect(screen.getByText('7-day avg · −2.4 lb in 30 days')).toBeInTheDocument();
  });

  it('still shows the weight when the change is not available yet, and says when it will be', async () => {
    setup({ weight: { totalChange: null, currentMean: 319.1, reason: 'no_baseline', availableFrom: '2026-10-15', latestWeight: 318.6 } });
    expect(await screen.findByText('319.1')).toBeInTheDocument();
    expect(screen.getByText('7-day avg · 30-day change from Oct 15')).toBeInTheDocument();
  });
});
