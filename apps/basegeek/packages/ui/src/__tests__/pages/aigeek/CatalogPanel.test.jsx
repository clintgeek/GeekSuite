/**
 * CatalogPanel.test.jsx — the Vision / Speed / Quality columns and the
 * concrete cooling tooltip (review §3.4 and the `catalogRows.health` item).
 *
 * Until 2026-09-19 `useAIGeek.catalogRows` computed `acceptsImageInput`,
 * `latency.p50Ms`/`weightClass` and `quality.score` nowhere, and `health`
 * was computed and passed but never rendered — the "cooling" chip's tooltip
 * was one fixed sentence regardless of when the row would try again or how
 * many times it had failed. This file pins the fix so a later "simplify the
 * columns" pass cannot quietly drop the measured facts back out.
 *
 * `coolingLine` is asserted directly (exported from `CatalogPanel.jsx`)
 * rather than by opening a real MUI `Tooltip` in jsdom, which needs pointer
 * events / timers this suite does not otherwise set up. Everything else here
 * is text that renders unconditionally, without needing a hover.
 */
import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import CatalogPanel, { coolingLine } from '../../../pages/aigeek/CatalogPanel';
import { renderWithProviders } from '../../testUtils';

function baseProps(overrides = {}) {
  return {
    rows: [],
    loading: false,
    error: null,
    overrideRow: null,
    onRefresh: vi.fn(),
    onOpenOverride: vi.fn(),
    onCloseOverride: vi.fn(),
    onSetOverride: vi.fn(),
    ...overrides,
  };
}

/** A catalog row with every field `CatalogPanel` reads, `catalogRows`-shaped. */
function row(overrides = {}) {
  return {
    key: 'groq::llama-3.3-70b-versatile',
    provider: 'groq',
    modelId: 'llama-3.3-70b-versatile',
    name: 'Llama 3.3 70B Versatile',
    fitness: 'structured',
    observed: null,
    health: null,
    override: null,
    alive: true,
    paid: false,
    lastSuccessAt: null,
    limits: {},
    hasKey: true,
    acceptsImageInput: null,
    latencyP50Ms: null,
    weightClass: null,
    qualityScore: null,
    qualityScoredAt: null,
    ...overrides,
  };
}

describe('CatalogPanel — Vision / Speed / Quality (review §3.4)', () => {
  it('shows a vendor-confirmed vision row as "sees images"', () => {
    renderWithProviders(<CatalogPanel {...baseProps({ rows: [row({ acceptsImageInput: true })] })} />);
    expect(screen.getByText('sees images')).toBeInTheDocument();
  });

  it('shows a vendor-confirmed-not row as "text only", not the same as unknown', () => {
    renderWithProviders(<CatalogPanel {...baseProps({ rows: [row({ acceptsImageInput: false })] })} />);
    expect(screen.getByText('text only')).toBeInTheDocument();
    expect(screen.queryByText('sees images')).not.toBeInTheDocument();
  });

  it('shows an unstated vision listing as "?", distinct from "text only"', () => {
    renderWithProviders(<CatalogPanel {...baseProps({ rows: [row({ acceptsImageInput: null })] })} />);
    expect(screen.getByText('?')).toBeInTheDocument();
    expect(screen.queryByText('text only')).not.toBeInTheDocument();
  });

  it('renders the measured weight class and the raw median, not a guessed speed label', () => {
    renderWithProviders(<CatalogPanel {...baseProps({
      rows: [row({ weightClass: 'fast', latencyP50Ms: 420 })],
    })} />);
    expect(screen.getByText('fast')).toBeInTheDocument();
    expect(screen.getByText('420ms median')).toBeInTheDocument();
  });

  it('reads a never-timed row as "not timed", not as slow', () => {
    renderWithProviders(<CatalogPanel {...baseProps({
      rows: [row({ weightClass: null, latencyP50Ms: null })],
    })} />);
    expect(screen.getByText('not timed')).toBeInTheDocument();
  });

  it('renders the golden-set score out of 100, not the raw 0-1 fraction', () => {
    renderWithProviders(<CatalogPanel {...baseProps({
      rows: [row({ qualityScore: 0.86 })],
    })} />);
    expect(screen.getByText('86/100')).toBeInTheDocument();
  });

  it('shows an unscored row as "—", not a score of 0', () => {
    renderWithProviders(<CatalogPanel {...baseProps({ rows: [row({ qualityScore: null })] })} />);
    // The Fitness column also renders "—" for a never-probed row, so this
    // scopes to "at least one" rather than assuming a single match.
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });
});

describe('coolingLine — review §2, catalogRows.health', () => {
  it('names the actual cooldown time and failure count when health has them', () => {
    const line = coolingLine({
      coolingUntil: new Date('2026-09-19T21:12:00.000Z').toISOString(),
      consecutiveFailures: 3,
    });
    expect(line).toContain('Cooling until');
    expect(line).toContain('after 3 failures');
  });

  it('does not pluralize a single failure', () => {
    const line = coolingLine({
      coolingUntil: new Date('2026-09-19T21:12:00.000Z').toISOString(),
      consecutiveFailures: 1,
    });
    expect(line).toContain('after 1 failure');
    expect(line).not.toContain('1 failures');
  });

  it('omits the failure count when health carries none, but still names the time', () => {
    const line = coolingLine({ coolingUntil: new Date('2026-09-19T21:12:00.000Z').toISOString() });
    expect(line).toContain('Cooling until');
    expect(line).not.toContain('after');
  });

  it('falls back to the generic line when there is no coolingUntil to be concrete about', () => {
    // The condition a test that only checked "some tooltip renders" could
    // not distinguish from the fix: the old code always returned this exact
    // sentence, for every cooling row, whether or not `health` had a real
    // `coolingUntil`. This is the one case where that is still correct.
    expect(coolingLine(null)).toBe('Not a candidate right now: cooling after a failure, or not on the free tier');
    expect(coolingLine({})).toBe('Not a candidate right now: cooling after a failure, or not on the free tier');
  });
});
