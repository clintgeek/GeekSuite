/**
 * The gateway's insight resolvers became governed on 2026-11-06: when no
 * model answers (daily cap, aiGeek down or slow) they return
 * `{ ok: false, content: null, message }` instead of throwing a GraphQL
 * error. That only helps if the UI's GraphQL documents SELECT `ok` and
 * `message` — a field the query doesn't ask for never arrives.
 *
 * So this test runs the real chain (card → insightsService →
 * fitnessGeekService → apiService) and fakes only the Apollo client, which
 * answers like a GraphQL server does: with exactly the fields the document
 * selected, nothing more.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { createFitnessTheme } from '../../../theme/theme.jsx';

const GATEWAY_MESSAGE = "The assistant isn't available right now.";
const softEnvelope = (type) => ({
  type,
  content: null,
  generatedAt: new Date().toISOString(),
  context: null,
  ok: false,
  reason: 'unavailable',
  message: GATEWAY_MESSAGE,
  provenance: { source: 'fallback', reason: 'unavailable', model: null, provider: null, cached: false, callsToday: 1, cap: 20 },
});

/** Answer with only the selected sub-fields of the document's one root field. */
const answer = (doc, envelope) => {
  const root = doc.definitions[0].selectionSet.selections[0];
  const picked = {};
  for (const sel of root.selectionSet.selections) picked[sel.name.value] = envelope[sel.name.value];
  return { data: { [root.name.value]: picked } };
};

const query = vi.fn(async ({ query: doc }) => answer(doc, softEnvelope('coaching')));
const mutate = vi.fn(async ({ mutation: doc }) => answer(doc, softEnvelope('chat')));
vi.mock('@geeksuite/api-client', () => ({
  createApolloClient: () => ({ query, mutate }),
}));

const { default: AIInsightsCard } = await import('../AIInsightsCard.jsx');
const { apiService } = await import('../../../services/apiService.js');

const renderCard = () => render(<ThemeProvider theme={createFitnessTheme('light')}><AIInsightsCard /></ThemeProvider>);

describe('a governed soft failure reaches the UI as a sentence, not a blank', () => {
  beforeEach(() => vi.clearAllMocks());

  it('the Advice tab shows the gateway\'s message', async () => {
    renderCard();
    fireEvent.click(screen.getByText('Advice'));
    expect(await screen.findByText(GATEWAY_MESSAGE)).toBeInTheDocument();
    expect(screen.queryByTestId('ai-notes-error')).toBeNull();
  });

  it('Ask answers in the thread with the gateway\'s message', async () => {
    renderCard();
    fireEvent.click(screen.getByText('Ask'));
    fireEvent.change(await screen.findByPlaceholderText(/Ask about your food/), { target: { value: 'how am I doing?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send your question' }));
    expect(await screen.findByText(GATEWAY_MESSAGE)).toBeInTheDocument();
  });

  it.each([
    ['/insights/morning-brief'],
    ['/insights/daily-summary'],
    ['/insights/correlations'],
    ['/insights/coaching'],
    ['/insights/weekly-report?days=7'],
    ['/insights/trend-watch?days=30'],
  ])('%s carries ok and message through', async (path) => {
    const res = await apiService.get(path);
    expect(res.data).toMatchObject({ ok: false, message: GATEWAY_MESSAGE });
  });
});
