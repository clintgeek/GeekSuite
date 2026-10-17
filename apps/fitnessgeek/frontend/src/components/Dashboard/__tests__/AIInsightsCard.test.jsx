/**
 * The AI insights card costs an AI call per load, so it starts collapsed and
 * fetches NOTHING until it's opened (Chef, 2026-09-27: "hide the AI INSIGHTS
 * and don't pull them unless you expand its container").
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { createFitnessTheme } from '../../../theme/theme.jsx';

vi.mock('../../../services/insightsService.js', () => {
  const insightsService = {
    getMorningBrief: vi.fn(async () => ({ ok: true, text: 'brief' })),
    getDailySummary: vi.fn(async () => ({ ok: true, text: 'summary' })),
    getCoaching: vi.fn(async () => ({ ok: true, text: 'coach' })),
    getCorrelations: vi.fn(async () => ({ ok: true, text: 'trends' })),
    chat: vi.fn(),
  };
  return { insightsService, default: insightsService };
});
const { insightsService } = await import('../../../services/insightsService.js');
const { default: AIInsightsCard } = await import('../AIInsightsCard.jsx');

const renderCard = () => render(<ThemeProvider theme={createFitnessTheme('light')}><AIInsightsCard /></ThemeProvider>);
const calls = () => ['getMorningBrief', 'getDailySummary', 'getCoaching', 'getCorrelations']
  .reduce((n, k) => n + insightsService[k].mock.calls.length, 0);

describe('AIInsightsCard: nothing is pulled until you open it', () => {
  beforeEach(() => vi.clearAllMocks());

  it('starts collapsed and makes no AI call', async () => {
    renderCard();
    expect(screen.getByRole('button', { name: 'Show notes from the AI' })).toHaveAttribute('aria-expanded', 'false');
    await new Promise((r) => setTimeout(r, 50));
    expect(calls()).toBe(0);
  });

  it('opening it fetches the current tab once', async () => {
    renderCard();
    fireEvent.click(screen.getByRole('button', { name: 'Show notes from the AI' }));
    await waitFor(() => expect(calls()).toBe(1));
    expect(insightsService.getMorningBrief.mock.calls.length + insightsService.getDailySummary.mock.calls.length).toBe(1);
  });

  it('picking a tab while collapsed opens it and fetches that tab', async () => {
    renderCard();
    fireEvent.click(screen.getByText('Advice'));
    await waitFor(() => expect(insightsService.getCoaching).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: 'Hide notes from the AI' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('refresh is off while collapsed', () => {
    renderCard();
    expect(screen.getByRole('button', { name: /^Refresh/ })).toBeDisabled();
  });
});

describe('AIInsightsCard: Notes from the AI (UX review 2026-10-17, D-11)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('is called Notes from the AI, with plain tab names', () => {
    renderCard();
    expect(screen.getByRole('heading', { name: 'Notes from the AI' })).toBeInTheDocument();
    for (const name of ['Advice', 'Patterns', 'Ask']) expect(screen.getByText(name)).toBeInTheDocument();
    expect(screen.queryByText(/AI Insights|Coach|Ask AI|Morning Brief|Daily Summary/)).toBeNull();
  });

  it('a note ends with what it was written from, when, and that it can be wrong', async () => {
    insightsService.getCoaching.mockResolvedValueOnce({
      ok: true, type: 'coaching', content: 'Eat more beans.', generatedAt: new Date().toISOString(), context: { daysAnalyzed: 14 },
    });
    renderCard();
    fireEvent.click(screen.getByText('Advice'));
    expect(await screen.findByText('Eat more beans.')).toBeInTheDocument();
    expect(screen.getByTestId('ai-note-footer').textContent)
      .toMatch(/^Written by AI from your last 14 days of logs · \d{1,2}:\d{2} (am|pm) · It can be wrong — check the numbers above\.$/);
    expect(screen.queryByText(/^Generated/)).toBeNull();
  });

  it('a failure shows plain words, never the raw error', async () => {
    insightsService.getCoaching.mockRejectedValueOnce(new Error('Request failed with status code 500'));
    renderCard();
    fireEvent.click(screen.getByText('Advice'));
    expect(await screen.findByTestId('ai-notes-error')).not.toHaveTextContent(/status code/);
  });
});
