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
    expect(screen.getByRole('button', { name: 'Expand AI insights' })).toHaveAttribute('aria-expanded', 'false');
    await new Promise((r) => setTimeout(r, 50));
    expect(calls()).toBe(0);
  });

  it('opening it fetches the current tab once', async () => {
    renderCard();
    fireEvent.click(screen.getByRole('button', { name: 'Expand AI insights' }));
    await waitFor(() => expect(calls()).toBe(1));
    expect(insightsService.getMorningBrief.mock.calls.length + insightsService.getDailySummary.mock.calls.length).toBe(1);
  });

  it('picking a tab while collapsed opens it and fetches that tab', async () => {
    renderCard();
    fireEvent.click(screen.getByText('Coach'));
    await waitFor(() => expect(insightsService.getCoaching).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: 'Collapse AI insights' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('refresh is off while collapsed', () => {
    renderCard();
    expect(screen.getByRole('button', { name: /^Refresh/ })).toBeDisabled();
  });
});
