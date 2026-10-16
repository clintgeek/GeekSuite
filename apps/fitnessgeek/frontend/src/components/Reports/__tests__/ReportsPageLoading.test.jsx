/**
 * Reports page — review 2026-10-16, P2.
 *
 *   - The food report shows as soon as it arrives; the two AI panels load,
 *     and fail, on their own.
 *   - A failure shows plain words (errorMessage), never raw GraphQL text.
 *   - Every window — the AI panels and the CSV included — is anchored on the
 *     LOCAL calendar day, sent as `start`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { localDateStringDaysAgo } from '@geeksuite/utils';

const { reportsService, insightsService, notify } = vi.hoisted(() => ({
  reportsService: { getOverview: vi.fn(), getTrends: vi.fn(), export: vi.fn() },
  insightsService: { getWeeklyReport: vi.fn(), getTrendWatch: vi.fn() },
  notify: vi.fn(),
}));

vi.mock('../../../services/reportsService.js', () => ({ reportsService }));
vi.mock('../../../services/insightsService.js', () => ({ insightsService }));
vi.mock('../BodyRecoverySection.jsx', () => ({ default: () => null }));
vi.mock('@geeksuite/ui', async (importOriginal) => ({
  ...(await importOriginal()),
  useToast: () => ({ notify }),
}));
const { default: Reports } = await import('../../../pages/Reports.jsx');

const overview = {
  range: { start: '2026-10-10', end: '2026-10-16', days: 7 },
  totals: {},
  averages: { calories: 1800, protein: 120 },
  daily: [],
  meals: {},
  topFoods: [],
  goalCompliance: null,
  days_logged: 7,
};
const never = () => new Promise(() => {});
/** What an ApolloError looks like when the server text is internal. */
const rawGraphQLError = (text) => Object.assign(new Error(text), { graphQLErrors: [{ message: text }] });

const renderReports = () => render(<MemoryRouter><Reports /></MemoryRouter>);

beforeEach(() => {
  vi.clearAllMocks();
  reportsService.getOverview.mockResolvedValue({ success: true, data: overview });
  reportsService.getTrends.mockResolvedValue({ success: true, data: { highlights: [] } });
  insightsService.getWeeklyReport.mockResolvedValue(null);
  insightsService.getTrendWatch.mockResolvedValue(null);
});

describe('Reports — the food report does not wait for the AI', () => {
  it('renders the averages while both AI calls are still out', async () => {
    insightsService.getWeeklyReport.mockImplementation(never);
    insightsService.getTrendWatch.mockImplementation(never);
    renderReports();
    expect((await screen.findAllByText('avg / day')).length).toBeGreaterThan(0);
    expect(screen.getByLabelText('Loading the weekly summary')).toBeInTheDocument();
    expect(screen.getByLabelText('Loading the trend watch')).toBeInTheDocument();
  });

  it('one AI panel answering does not wait for the other', async () => {
    insightsService.getWeeklyReport.mockResolvedValue({ type: 'weekly_report', content: 'You ate well this week.' });
    insightsService.getTrendWatch.mockImplementation(never);
    renderReports();
    expect(await screen.findByText('You ate well this week.')).toBeInTheDocument();
    expect(screen.getByLabelText('Loading the trend watch')).toBeInTheDocument();
  });
});

describe('Reports — failures in plain words', () => {
  it('an AI failure shows a sentence, not the server text', async () => {
    insightsService.getWeeklyReport.mockRejectedValue(rawGraphQLError('Request failed with status code 502'));
    insightsService.getTrendWatch.mockRejectedValue(rawGraphQLError('E11000 duplicate key error collection: x'));
    renderReports();
    expect(await screen.findByTestId('weekly-ai-error')).toHaveTextContent("The assistant isn't available right now.");
    expect(screen.getByTestId('trend-ai-error')).toHaveTextContent("The assistant isn't available right now.");
    expect(screen.queryByText(/status code|E11000/)).toBeNull();
    // and the food report still rendered
    expect(screen.getAllByText('avg / day').length).toBeGreaterThan(0);
  });

  it('a report failure shows a sentence, not raw GraphQL text', async () => {
    const raw = rawGraphQLError('Cast to ObjectId failed for value "x" (type string) at path "_id"');
    reportsService.getOverview.mockRejectedValue(raw);
    reportsService.getTrends.mockRejectedValue(raw);
    renderReports();
    expect(await screen.findByText("Your reports didn't load. Try again.")).toBeInTheDocument();
    expect(screen.queryByText(/Cast to ObjectId/)).toBeNull();
  });

  it('friendly server text still comes through', async () => {
    insightsService.getWeeklyReport.mockRejectedValue(rawGraphQLError('Something went wrong on our side. Try again in a moment.'));
    renderReports();
    expect(await screen.findByTestId('weekly-ai-error')).toHaveTextContent('Something went wrong on our side. Try again in a moment.');
  });
});

describe('Reports — every window is the local calendar', () => {
  it('the AI panels send a local `start`', async () => {
    renderReports();
    await waitFor(() => expect(insightsService.getTrendWatch).toHaveBeenCalled());
    expect(insightsService.getWeeklyReport).toHaveBeenCalledWith({ days: 7, start: localDateStringDaysAgo(6) });
    expect(insightsService.getTrendWatch).toHaveBeenCalledWith({ days: 21, start: localDateStringDaysAgo(20) });
    expect(reportsService.getOverview).toHaveBeenCalledWith({ days: 7, start: localDateStringDaysAgo(6) });
  });

  it('the CSV export sends a local `start`, and a failure says so in words', async () => {
    reportsService.export.mockRejectedValue(Object.assign(new Error('Request failed with status code 500'), { response: { status: 500 } }));
    renderReports();
    const button = await screen.findByRole('button', { name: /Export CSV/ });
    await waitFor(() => expect(button).not.toBeDisabled());
    fireEvent.click(button);
    await waitFor(() => expect(notify).toHaveBeenCalled());
    expect(reportsService.export).toHaveBeenCalledWith({ days: 7, start: localDateStringDaysAgo(6) });
    expect(notify).toHaveBeenCalledWith("The report didn't download. Try again.", { tone: 'error' });
  });
});
