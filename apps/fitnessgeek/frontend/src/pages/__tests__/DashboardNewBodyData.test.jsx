/**
 * DashboardNew wiring for the body-data plan: the stale-plan banner shows for
 * Chef's real saved plan, the protein target is captioned when derivedMacros
 * set it from lean mass, and the Weight card shows the smoothed change or
 * says why it can't.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
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
vi.mock('../../services/weightService.js', () => ({ weightService: { getWeightStats: vi.fn() } }));
vi.mock('../../services/bpService.js', () => ({ bpService: { getCurrentBP: vi.fn(() => Promise.resolve(null)) } }));
vi.mock('../../services/streakService.js', () => ({ streakService: { getLoginStreak: vi.fn(() => Promise.resolve(null)) } }));
vi.mock('../../services/settingsService.js', () => ({ settingsService: { getSettings: vi.fn() } }));
vi.mock('../../services/bodyCompService.js', () => ({ bodyCompService: { getSummary: vi.fn() } }));
vi.mock('../../hooks/useFoodLogging.js', () => ({ useFoodLogging: () => ({ logItems: vi.fn() }) }));
vi.mock('../../components/Dashboard/AIInsightsCard.jsx', () => ({ default: () => null }));
vi.mock('@geeksuite/ui', async (importOriginal) => ({
  ...(await importOriginal()),
  useToast: () => ({ notify: vi.fn() }),
}));

const { goalsService } = await import('../../services/goalsService.js');
const { weightService } = await import('../../services/weightService.js');
const { settingsService } = await import('../../services/settingsService.js');
const { bodyCompService } = await import('../../services/bodyCompService.js');
const { default: DashboardNew } = await import('../DashboardNew.jsx');

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
  render(<MemoryRouter><DashboardNew /></MemoryRouter>);
}

describe('DashboardNew — body data', () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows the stale-plan banner for Chef's saved plan", async () => {
    setup();
    const banner = await screen.findByTestId('plan-accuracy-banner');
    expect(banner).toHaveAttribute('data-kind', 'stale');
  });

  it('shows no banner without a plan', async () => {
    setup({ ng: null });
    await screen.findByText('Today\'s Meals');
    expect(screen.queryByTestId('plan-accuracy-banner')).toBeNull();
  });

  it('captions the protein target "from lean mass" only when derivedMacros says so', async () => {
    setup();
    expect(await screen.findByTestId('macro-note-protein')).toHaveTextContent('from lean mass');
  });

  it('no protein caption on the goal-weight rule', async () => {
    setup({ basis: 'goal_weight' });
    await screen.findByText('Today\'s Meals');
    expect(screen.queryByTestId('macro-note-protein')).toBeNull();
  });

  it('shows the smoothed weight change with its basis', async () => {
    setup();
    expect(await screen.findByText('−2.4')).toBeInTheDocument();
    expect(screen.getByText('7-day avg vs 30 days ago')).toBeInTheDocument();
  });

  it('says when the weight trend will exist instead of printing a number', async () => {
    setup({ weight: { totalChange: null, reason: 'insufficient_span', availableFrom: '2026-10-05', latestWeight: 318 } });
    expect(await screen.findByText('30-day trend from Oct 5')).toBeInTheDocument();
  });
});
