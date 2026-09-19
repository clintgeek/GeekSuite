/**
 * UsagePanel.test.jsx — the panel that used to say everything twice.
 *
 * There were two tables: "Provider Usage" (six columns) and "App Usage
 * Breakdown" (seven), five of them the same five numbers read off the same
 * `stats.providerUsage` object. The second table was the first one split by
 * app, so reading the panel meant reading every figure twice and doing the
 * addition yourself to confirm they agreed.
 *
 * The provider totals are lines now and the app table stayed. These cases are
 * mostly about that shape holding: one table, every number still reachable,
 * and a provider with no app rows still visible — which is the case a
 * well-meant "just drop the provider section" patch would lose.
 */
import { describe, it, expect, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import UsagePanel from '../../../pages/aigeek/UsagePanel';
import { renderWithProviders } from '../../testUtils';

/**
 * `groq` is spent by two apps; `openrouter` has usage but no `appUsage` at
 * all, which is the row only the provider lines can show.
 */
const STATS = {
  totalCalls: 3,
  totalTokens: 1500,
  totalCost: 0,
  providerUsage: {
    groq: {
      calls: 640, freeCalls: 612, paidCalls: 28, tokens: 1200000, cost: 0.0412,
      appUsage: {
        storygeek: { calls: 400, freeCalls: 400, paidCalls: 0, tokens: 800000, cost: 0 },
        fitnessgeek: { calls: 240, freeCalls: 212, paidCalls: 28, tokens: 400000, cost: 0.0412 },
      },
    },
    openrouter: { calls: 12, freeCalls: 0, paidCalls: 12, tokens: 9000, cost: 0.31 },
  },
};

const LABELS = { groq: 'Groq', openrouter: 'OpenRouter' };

function baseProps(overrides = {}) {
  return {
    stats: STATS,
    statsError: null,
    spend: { monthUsd: 1.76, todayUsd: 0.02, capPerDayUsd: 0.25, capPerCallUsd: 0.02, paidCallsMonth: 98 },
    dailyCapFor: () => null,
    providerLabels: LABELS,
    isCompact: false,
    onRetry: vi.fn(),
    onResetStats: vi.fn(),
    ...overrides,
  };
}

describe('UsagePanel', () => {
  it('states the provider totals without a second table to hold them', () => {
    renderWithProviders(<UsagePanel {...baseProps()} />);
    // One table on the panel, and it is the per-app one.
    const tables = screen.queryAllByRole('table');
    expect(tables).toHaveLength(1);
    expect(within(tables[0]).getByText('App')).toBeInTheDocument();
  });

  it('keeps all five provider figures on the line that replaced the table', () => {
    renderWithProviders(<UsagePanel {...baseProps()} />);
    // "Groq" is also a provider cell in the app table, so pick the occurrence
    // that sits in a paragraph — the table renders its cells as bare `td`.
    const line = screen.getAllByText('Groq').map(el => el.closest('p')).find(Boolean);
    expect(line).toHaveTextContent('640 calls');
    expect(line).toHaveTextContent('612 free');
    expect(line).toHaveTextContent('28 paid');
    expect(line).toHaveTextContent('1,200,000 tokens');
    expect(line).toHaveTextContent('$0.0412');
  });

  it('still shows a provider that has usage but no app rows behind it', () => {
    // openrouter has no appUsage, so the app table cannot mention it. Dropping
    // the provider section outright would have hidden a paid provider.
    renderWithProviders(<UsagePanel {...baseProps()} />);
    expect(screen.getByText('OpenRouter')).toBeInTheDocument();
    const table = screen.getByRole('table');
    expect(within(table).queryByText('OpenRouter')).toBeNull();
  });

  it('calls the vendors what they call themselves, in both places', () => {
    renderWithProviders(<UsagePanel {...baseProps()} />);
    // `textTransform: capitalize` over the raw ids gave "Openrouter".
    expect(screen.queryByText('Openrouter')).toBeNull();
    expect(screen.getByText('OpenRouter')).toBeInTheDocument();
    expect(within(screen.getByRole('table')).getAllByText('Groq').length).toBeGreaterThan(0);
  });

  it('falls back to the raw id when the status payload carried no label', () => {
    renderWithProviders(<UsagePanel {...baseProps({ providerLabels: undefined })} />);
    expect(screen.getByText('openrouter')).toBeInTheDocument();
  });

  it('keeps one row per app and provider pair, sorted by app', () => {
    renderWithProviders(<UsagePanel {...baseProps()} />);
    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('fitnessgeek');
    expect(rows[1]).toHaveTextContent('storygeek');
  });

  it('says so when there is no usage at all, rather than drawing an empty line', () => {
    renderWithProviders(<UsagePanel {...baseProps({ stats: { providerUsage: {} } })} />);
    expect(screen.getByText('No usage recorded yet')).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('renders the month from the ledger, never from the session counters', () => {
    // The tables count in-process calls and reset on every deploy; the spend
    // line is `AISpend`. They disagree by however long ago the last restart was.
    renderWithProviders(<UsagePanel {...baseProps()} />);
    expect(screen.getByText(/This month: \$1\.76/)).toBeInTheDocument();
    expect(screen.getByText(/Since basegeek last restarted:/)).toBeInTheDocument();
  });

  it('does not compare the month figure to the $10 credit as a ratio (review §1.6)', () => {
    // `spend.monthUsd` resets every calendar month; the $10 named in
    // DOCS/ARCHIVE/AIGEEK_ELEVATION_PLAN.md is a one-time credit purchase with
    // no field tracking cumulative spend against it. "$X of the $10" implied a
    // remaining balance that nothing here actually computes — this pins that
    // the ratio framing is gone, and that the real, currently-enforced caps
    // are what the line leads with instead.
    //
    // This test goes RED against the pre-fix line ("This month: $1.76 of the
    // $10 · today ...") and GREEN once the "of the $10" ratio is removed.
    renderWithProviders(<UsagePanel {...baseProps()} />);
    expect(screen.queryByText(/of the \$10/)).toBeNull();
    expect(screen.getByText(/one-time purchase/)).toBeInTheDocument();
  });
});
