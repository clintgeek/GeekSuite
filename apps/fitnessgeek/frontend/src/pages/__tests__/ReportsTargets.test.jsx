/**
 * Reports — the day ribbon colours against the plan's targets, and the
 * averages say how many days they cover (2026-09-23). The ribbon read
 * `overview.targets`, which nothing returned, so its compliance legend and
 * macro fills never once rendered.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

let overview;
vi.mock('../../services/reportsService.js', () => ({
  reportsService: {
    getOverview: vi.fn(async () => ({ success: true, data: overview })),
    getTrends: vi.fn(async () => ({ success: true, data: { highlights: [] } })),
    export: vi.fn(),
  },
}));
vi.mock('../../services/insightsService.js', () => ({
  insightsService: {
    getWeeklyReport: vi.fn(async () => null),
    getTrendWatch: vi.fn(async () => null),
  },
}));
// The Body & recovery section has its own suite; here it would only make
// real network calls that fail noisily in jsdom.
vi.mock('../../components/Reports/BodyRecoverySection.jsx', () => ({ default: () => null }));
vi.mock('@geeksuite/ui', async (importOriginal) => ({
  ...(await importOriginal()),
  useToast: () => ({ notify: vi.fn() }),
}));
const { default: Reports } = await import('../Reports.jsx');

const day = (date, calories) => ({ date, calories, protein: 150, carbs: 150, fat: 70, fiber: 20, sugar: 30 });
const base = {
  range: { start: '2026-09-17', end: '2026-09-23', days: 7 },
  totals: {}, averages: { calories: 1800, protein: 150, carbs: 150, fat: 70, fiber: 20, sugar: 30, net_carbs: 130, sodium: 2100 },
  daily: [day('2026-09-20', 1700), day('2026-09-21', 1900), day('2026-09-22', 1750), day('2026-09-23', 1850)],
  meals: {}, topFoods: [], goalCompliance: null,
};
const renderReports = () => render(<MemoryRouter><Reports /></MemoryRouter>);

describe('Reports targets and coverage', () => {
  it('with the plan\'s targets, the ribbon shows its compliance legend', async () => {
    overview = { ...base, days_logged: 4, targets: { calories: 1691, protein: 178, carbs: 150, fat: 77, fiber: 25 } };
    renderReports();
    expect(await screen.findByText('Goal:')).toBeInTheDocument();
    expect(screen.getByText('on target')).toBeInTheDocument();
  });

  it('says the averages cover only the logged days', async () => {
    overview = { ...base, days_logged: 4, targets: null };
    renderReports();
    expect(await screen.findByTestId('report-days-logged')).toHaveTextContent('Averages cover the 4 of 7 days you logged.');
    expect(screen.queryByText('Goal:')).toBeNull();
  });

  it('no coverage line when every day was logged', async () => {
    overview = { ...base, days_logged: 7, targets: null };
    renderReports();
    // Guard against a vacuous pass: the averages must have rendered first.
    expect((await screen.findAllByText('avg / day')).length).toBeGreaterThan(0);
    expect(screen.queryByTestId('report-days-logged')).toBeNull();
  });
});

describe('Reports averages include sodium and net carbs (TRENDS_PLAN D6)', () => {
  it('labels both, with units', async () => {
    overview = { ...base, days_logged: 7, targets: null };
    renderReports();
    expect(await screen.findByText('Sodium (mg)')).toBeInTheDocument();
    expect(screen.getByText('Net carbs (g)')).toBeInTheDocument();
  });
});

