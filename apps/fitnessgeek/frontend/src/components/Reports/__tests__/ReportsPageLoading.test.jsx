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
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
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
    expect((await screen.findAllByText('a day')).length).toBeGreaterThan(0);
    expect(screen.getByLabelText('Loading the summary')).toBeInTheDocument();
    expect(screen.getByLabelText('Loading the patterns')).toBeInTheDocument();
  });

  it('one AI panel answering does not wait for the other', async () => {
    insightsService.getWeeklyReport.mockResolvedValue({ type: 'weekly_report', content: 'You ate well this week.' });
    insightsService.getTrendWatch.mockImplementation(never);
    renderReports();
    expect(await screen.findByText('You ate well this week.')).toBeInTheDocument();
    expect(screen.getByLabelText('Loading the patterns')).toBeInTheDocument();
  });
});

describe('Reports — failures in plain words', () => {
  it('an AI failure shows a sentence, not the server text', async () => {
    insightsService.getWeeklyReport.mockRejectedValue(rawGraphQLError('Request failed with status code 502'));
    insightsService.getTrendWatch.mockRejectedValue(rawGraphQLError('E11000 duplicate key error collection: x'));
    renderReports();
    expect(await screen.findByTestId('weekly-ai-error')).toHaveTextContent('The assistant isn’t available right now.');
    expect(screen.getByTestId('trend-ai-error')).toHaveTextContent('The assistant isn’t available right now.');
    expect(screen.queryByText(/status code|E11000/)).toBeNull();
    // and the food report still rendered
    expect(screen.getAllByText('a day').length).toBeGreaterThan(0);
  });

  it('a report failure shows a sentence, not raw GraphQL text', async () => {
    const raw = rawGraphQLError('Cast to ObjectId failed for value "x" (type string) at path "_id"');
    reportsService.getOverview.mockRejectedValue(raw);
    reportsService.getTrends.mockRejectedValue(raw);
    renderReports();
    expect(await screen.findByText('Couldn’t load your reports. Try again.')).toBeInTheDocument();
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

  it('the download is a quiet link at the foot of the page, sends a local `start`, and a failure says so in words', async () => {
    reportsService.export.mockRejectedValue(Object.assign(new Error('Request failed with status code 500'), { response: { status: 500 } }));
    renderReports();
    const button = await screen.findByRole('button', { name: 'Download as a spreadsheet' });
    expect(screen.queryByText(/Export CSV/)).toBeNull();
    // Last on the page: after the food report and the body section, not
    // the first action under the title.
    const follows = (a, b) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(follows(screen.getByTestId('reports-food'), button)).toBe(true);
    expect(within(screen.getByTestId('reports-food')).queryByRole('button', { name: /spreadsheet|export/i })).toBeNull();
    await waitFor(() => expect(button).not.toBeDisabled());
    fireEvent.click(button);
    await waitFor(() => expect(notify).toHaveBeenCalled());
    expect(reportsService.export).toHaveBeenCalledWith({ days: 7, start: localDateStringDaysAgo(6) });
    expect(notify).toHaveBeenCalledWith('Couldn’t download the report. Try again.', { tone: 'error' });
  });
});

describe('Reports — a failed read is never an empty week', () => {
  it('the overview failing alone is the report failing: no "nothing logged", no "no meals"', async () => {
    // Only BOTH halves failing used to count. With the overview down and the
    // highlights up, the page drew an empty day ribbon and "No meals logged
    // in this range" over a week that had plenty.
    reportsService.getOverview.mockRejectedValue(new Error('Request failed with status code 502'));
    renderReports();
    expect(await screen.findByText('Couldn’t load your reports')).toBeInTheDocument();
    expect(screen.queryByText(/No meals logged|Nothing logged in these days|No food logs/)).toBeNull();
    expect(screen.queryByTestId('meal-breakdown')).toBeNull();
    expect(screen.queryByText(/status code/)).toBeNull();
    // And the retry brings it back.
    reportsService.getOverview.mockResolvedValue({ success: true, data: overview });
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect((await screen.findAllByText('a day')).length).toBeGreaterThan(0);
  });

  it('the highlights failing alone says so in their panel, not "Nothing stands out yet"', async () => {
    reportsService.getTrends.mockRejectedValue(new Error('boom'));
    renderReports();
    expect(await screen.findByTestId('highlights-failed')).toBeInTheDocument();
    expect(screen.getAllByText('a day').length).toBeGreaterThan(0);
  });
});

describe('Reports — under the Trends tabs', () => {
  it('does not repeat "Food" under the tab that already says it, nor the intro line', async () => {
    render(<MemoryRouter><Reports embedded /></MemoryRouter>);
    expect((await screen.findAllByText('a day')).length).toBeGreaterThan(0);
    expect(screen.queryByText('Food')).toBeNull();
    expect(screen.queryByText(/How your eating went/)).toBeNull();
    expect(screen.getByRole('heading', { name: 'This week', level: 2 })).toBeInTheDocument();
  });
});
