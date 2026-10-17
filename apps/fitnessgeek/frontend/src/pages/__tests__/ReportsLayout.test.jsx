/**
 * Reports, UX review 2026-10-17 (ia-copy-data.md §3, D-5 to D-11; visual.md C10).
 *
 *   D-5  Food (with its own range toggle) → Notes from the AI → Body and recovery.
 *   D-8  The day ribbon: "Each day (5 logged)", "Oct 10–16", macros in words,
 *        a status word, colour only on over days.
 *   D-9  Calories by meal per day, with protein; top foods say "over 7 days".
 *   D-10 Tiles: "1,760" / "a day", no tracked caps.
 *   D-11 One name for the AI panels, a title by range, and a footer that
 *        says what it was written from, when, and that it can be wrong.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import { createFitnessTheme } from '../../theme/theme.jsx';

const { reportsService, insightsService } = vi.hoisted(() => ({
  reportsService: { getOverview: vi.fn(), getTrends: vi.fn(), export: vi.fn() },
  insightsService: { getWeeklyReport: vi.fn(), getTrendWatch: vi.fn() },
}));
vi.mock('../../services/reportsService.js', () => ({ reportsService }));
vi.mock('../../services/insightsService.js', () => ({ insightsService }));
vi.mock('../../components/Reports/BodyRecoverySection.jsx', () => ({
  default: () => <section data-testid="body-recovery" />,
}));
vi.mock('@geeksuite/ui', async (importOriginal) => ({
  ...(await importOriginal()),
  useToast: () => ({ notify: vi.fn() }),
}));
const { default: Reports } = await import('../Reports.jsx');

const day = (date, calories, protein = 165, carbs = 141, fat = 70) => ({ date, calories, protein, carbs, fat, fiber: 20 });
const overview = {
  range: { start: '2026-10-10', end: '2026-10-16', days: 7 },
  totals: {},
  averages: { calories: 1760.4, protein: 162.2 },
  daily: [
    day('2026-10-10', 1400),
    day('2026-10-12', 1700),
    day('2026-10-13', 1690),
    day('2026-10-15', 1980),
    day('2026-10-16', 1805, 165.4, 140.6, 70.2),
  ],
  // Totals over the range, as the gateway sends them; 5 logged days.
  meals: {
    lunch: { calories: 3050, protein: 200, count: 5 },
    breakfast: { calories: 2100, protein: 160, count: 5 },
  },
  topFoods: [{ name: 'Greek yogurt, plain', count: 5, calories: 650 }, { name: 'Toast', count: 1, calories: 80 }],
  goalCompliance: null,
  targets: { calories: 1700 },
  days_logged: 5,
};

const renderReports = () => render(
  <ThemeProvider theme={createFitnessTheme('light')}>
    <MemoryRouter><Reports /></MemoryRouter>
  </ThemeProvider>,
);

beforeEach(() => {
  vi.clearAllMocks();
  reportsService.getOverview.mockResolvedValue({ success: true, data: overview });
  reportsService.getTrends.mockResolvedValue({ success: true, data: { highlights: [] } });
  insightsService.getWeeklyReport.mockResolvedValue({ type: 'weekly_report', content: 'A steady week.', generatedAt: new Date(2026, 9, 17, 9, 40).toISOString() });
  insightsService.getTrendWatch.mockResolvedValue({ type: 'trend_watch', content: 'Protein is up.', generatedAt: new Date(2026, 9, 17, 9, 41).toISOString() });
});

describe('D-5 — order and intro', () => {
  it('Food, then Notes from the AI, then Body and recovery', async () => {
    renderReports();
    await screen.findByText('A steady week.');
    const food = screen.getByTestId('reports-food');
    const notes = screen.getByTestId('reports-ai-notes');
    const body = screen.getByTestId('body-recovery');
    const follows = (a, b) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(follows(food, notes)).toBe(true);
    expect(follows(notes, body)).toBe(true);
  });

  it('the range toggle sits in the Food section header', async () => {
    renderReports();
    const food = await screen.findByTestId('reports-food');
    expect(within(food).getByRole('button', { name: '7 days' })).toBeInTheDocument();
    // The words are what shows, not "7d" behind an aria-label (review §2 toggle).
    expect(within(food).getByRole('button', { name: '30 days' })).toHaveTextContent(/^30 days$/);
    expect(within(screen.getByTestId('reports-ai-notes')).queryByRole('button', { name: '7 days' })).toBeNull();
  });

  it('the intro says what the page is, with no range sentence', async () => {
    renderReports();
    expect(screen.getByText('How your eating went, and how your body is trending.')).toBeInTheDocument();
    expect(screen.queryByText(/Deep dive/)).toBeNull();
    await screen.findByText('A steady week.');
  });
});

describe('D-8 — the day ribbon', () => {
  it('title with the count, range without ISO dates', async () => {
    renderReports();
    expect(await screen.findByText('Each day (5 logged)')).toBeInTheDocument();
    expect(screen.getByTestId('day-ribbon-range')).toHaveTextContent('Oct 10–16');
    expect(screen.queryByText(/2026-10-1/)).toBeNull();
  });

  it('macros as a line of text, calories with commas and "cal"', async () => {
    renderReports();
    const cards = await screen.findAllByTestId('day-card');
    // newest first, so the card you see first is whole on a phone
    expect(cards[0]).toHaveTextContent('Fri');
    expect(cards[0]).toHaveTextContent('Oct 16');
    expect(cards[0]).toHaveTextContent('1,805cal');
    expect(within(cards[0]).getByTestId('day-macros')).toHaveTextContent('P 165 · C 141 · F 70 g');
    expect(screen.queryByText(/kcal/)).toBeNull();
  });

  it('a status word on every day; only over days are marked', async () => {
    renderReports();
    const cards = await screen.findAllByTestId('day-card');
    // against 1,700: 1805 (a bit over), 1980 (over), 1690, 1700, 1400 (under)
    expect(cards.map((c) => within(c).getByTestId('day-status').textContent))
      .toEqual(['A bit over', 'Over', 'On target', 'On target', 'Under']);
    expect(cards.map((c) => c.dataset.over)).toEqual(['true', 'true', 'false', 'false', 'false']);
  });
});

describe('D-9 — meals and top foods', () => {
  it('calories by meal, average per logged day, with protein', async () => {
    renderReports();
    expect(await screen.findByText('Calories by meal, average per day')).toBeInTheDocument();
    const rows = screen.getAllByTestId('meal-row').map((r) => r.textContent);
    // meal order, not the server's key order; 2100 / 5 = 420, 160 / 5 = 32
    expect(rows).toEqual(['Breakfast · 420 cal a day · protein 32g', 'Lunch · 610 cal a day · protein 40g']);
  });

  it('a meal without a protein figure says nothing about protein', async () => {
    reportsService.getOverview.mockResolvedValue({ success: true, data: { ...overview, meals: { breakfast: { calories: 2100, count: 5 } } } });
    renderReports();
    expect((await screen.findAllByTestId('meal-row')).map((r) => r.textContent)).toEqual(['Breakfast · 420 cal a day']);
  });

  it('top foods are a total over the range, and a count of times', async () => {
    renderReports();
    const foods = await screen.findAllByTestId('top-food');
    expect(foods[0]).toHaveTextContent('650 cal over 7 days · 5 times');
    expect(foods[1]).toHaveTextContent('80 cal over 7 days · 1 time');
  });
});

describe('D-10 — tiles', () => {
  it('"Calories 1,760 a day", "Protein 162g a day"', async () => {
    renderReports();
    expect(await screen.findByTestId('average-calories')).toHaveTextContent('Calories1,760a day');
    expect(screen.getByTestId('average-protein')).toHaveTextContent('Protein162ga day');
    expect(screen.queryByText(/avg \/ day/i)).toBeNull();
    expect(screen.getByTestId('report-days-logged')).toHaveTextContent('Averages cover the 5 of 7 days you logged.');
  });
});

describe('D-11 — Notes from the AI', () => {
  it('one name, a title by range, and plain panel names', async () => {
    renderReports();
    const notes = screen.getByTestId('reports-ai-notes');
    expect(within(notes).getByText('Notes from the AI')).toBeInTheDocument();
    expect(within(notes).getByText('This week')).toBeInTheDocument();
    await screen.findByText('A steady week.');
    expect(screen.queryByText(/AI Coach|Weekly Summary|Trend Watch|AI Insight/)).toBeNull();
  });

  it('each panel ends with what it was written from, when, and that it can be wrong', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 17, 12, 0));
    try {
      renderReports();
      await screen.findByText('A steady week.');
      await screen.findByText('Protein is up.');
      const footers = screen.getAllByTestId('ai-note-footer').map((f) => f.textContent);
      expect(footers).toEqual([
        'Written by AI from your last 7 days of logs · 9:40 AM · It can be wrong — check the numbers above.',
        // trend watch always reads at least three weeks, and says so
        'Written by AI from your last 21 days of logs · 9:41 AM · It can be wrong — check the numbers above.',
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('the title follows the range', async () => {
    renderReports();
    await screen.findByText('A steady week.');
    fireEvent.click(screen.getByRole('button', { name: '30 days' }));
    const notes = screen.getByTestId('reports-ai-notes');
    expect(within(notes).getByText('Last 30 days')).toBeInTheDocument();
  });

  it('nothing logged: the summary asks for a few days, trends say nothing stands out', async () => {
    reportsService.getOverview.mockResolvedValue({ success: true, data: { ...overview, daily: [], meals: {}, topFoods: [], days_logged: 0 } });
    insightsService.getWeeklyReport.mockResolvedValue({ type: 'weekly_report', content: 'No data found.', generatedAt: new Date().toISOString() });
    insightsService.getTrendWatch.mockResolvedValue({ type: 'trend_watch', content: 'No data found.', generatedAt: new Date().toISOString() });
    renderReports();
    expect(await screen.findByTestId('weekly-ai-empty')).toHaveTextContent('Log a few days and I’ll write a summary here.');
    expect(await screen.findByTestId('trend-ai-empty')).toHaveTextContent('Nothing stands out yet.');
    expect(screen.queryByText('No data found.')).toBeNull();
    expect(screen.queryByTestId('ai-note-footer')).toBeNull();
  });
});
