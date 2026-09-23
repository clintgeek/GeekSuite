/**
 * The body-composition section: what it shows, and what it refuses to.
 *
 * §0 (FITNESSGEEK_BODY_DATA_PLAN): before a 7-vs-7-day comparison with a
 * 14-day gap exists, the change card says WHEN — never a number. Once it
 * exists, both windows are named, and every figure is the server's.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

process.env.TZ = 'America/Chicago';

// The chart is lazy and Nivo cannot paint in jsdom.
vi.mock('../BodyCompTrend.jsx', () => ({ default: () => <div data-testid="trend" /> }));

const { default: BodyCompositionSection } = await import('../BodyCompositionSection.jsx');

const win = (from, to, scans, extra = {}) => ({
  from: `${from}T00:00:00.000Z`, to: `${to}T00:00:00.000Z`, scans,
  weight_lb: 316.3, fat_mass_lb: 139.7, lean_mass_lb: 176.6, body_fat_pct: 44.2,
  skeletal_muscle_lb: 98.1, body_water_pct: 40.3, visceral_fat_index: 18, bmr_kcal: 2107, ...extra,
});

// Today's real shape: 8 scans Sep 15–22, change not yet available.
const EARLY = {
  total_scans: 8,
  first_scan_at: '2026-09-15T12:10:00.000Z',
  latest_scan_at: '2026-09-22T12:05:00.000Z',
  current: win('2026-09-15', '2026-09-22', 8),
  change: {
    available: false, available_from: '2026-10-04T00:00:00.000Z', gap_days: 1,
    baseline: win('2026-09-15', '2026-09-20', 7), latest: null,
    weight_change_lb: null, fat_change_lb: null, lean_change_lb: null,
  },
  bmr: { bmr: 2107, source: 'scan', lean_mass_lb: 176.6, scans: 8, scan_age_days: 0 },
};

const LATER = {
  ...EARLY,
  total_scans: 30,
  change: {
    available: true, available_from: null, gap_days: 21,
    baseline: win('2026-08-26', '2026-09-01', 7), latest: win('2026-09-16', '2026-09-22', 6),
    weight_change_lb: -8, fat_change_lb: -7, lean_change_lb: -1,
  },
};

const renderSection = (props) => render(
  <MemoryRouter>
    <BodyCompositionSection loading={false} error="" scansError="" scans={[]} {...props} />
  </MemoryRouter>
);

describe('summary card', () => {
  it('names what the numbers are: N scans over a span, and the latest scan', () => {
    renderSection({ summary: EARLY });
    expect(screen.getByText(/Average of 8 scans · Sep 15–22 · latest scan Sep 22/)).toBeInTheDocument();
    expect(screen.getByText('44.2')).toBeInTheDocument();
    for (const label of ['Fat mass', 'Lean mass', 'Skeletal muscle', 'Body water', 'Visceral fat index', 'BMR (scale)']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('does not show the stored-but-hidden fields (D7)', () => {
    renderSection({ summary: EARLY });
    expect(screen.queryByText(/bone|protein|subcutaneous|segment|arm|leg|trunk/i)).toBeNull();
  });

  it('explains why these are averages on request', async () => {
    const user = userEvent.setup();
    renderSection({ summary: EARLY });
    const btn = screen.getByRole('button', { name: /why these are averages/i });
    expect(btn).toHaveAttribute('aria-expanded', 'false');
    await user.click(btn);
    expect(btn).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(/one scan can swing a percent or two/i)).toBeVisible();
  });
});

describe('change card', () => {
  it('before the comparison exists: says when, and shows no number', () => {
    renderSection({ summary: EARLY });
    const card = screen.getByText('Change').closest('div').parentElement;
    expect(within(card).getByText('Your first comparison appears around Oct 4.')).toBeInTheDocument();
    expect(card.textContent).not.toMatch(/\d+\.\d\s*lb|[−+-]\d/);
  });

  it('once it exists: the reading, the three deltas, and both windows named', () => {
    renderSection({ summary: LATER });
    expect(screen.getByText("Of the 8.0 lb you've lost, about 7.0 lb was fat and 1.0 lb lean.")).toBeInTheDocument();
    const card = screen.getByText('Change').closest('div').parentElement;
    expect(card.textContent).toContain('−7.0');
    expect(card.textContent).toContain('−1.0');
    expect(card.textContent).toContain('−8.0');
    expect(card.textContent).toMatch(/Average of Aug 26 – Sep 1 \(7 scans\) against Sep 16–22 \(6 scans\)/);
  });
});

describe('states', () => {
  it('empty: explains where scans come from and links to Import Scan', () => {
    renderSection({ summary: { total_scans: 0, current: null, change: null } });
    expect(screen.getByText('No scans yet')).toBeInTheDocument();
    expect(screen.getByText(/Nextcloud/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /import a scan/i })).toHaveAttribute('href', '/scan-import');
  });

  it('error: says so, offers a retry, and says the weight is unaffected', async () => {
    const onRetry = vi.fn();
    const user = userEvent.setup();
    renderSection({ summary: null, error: 'Body composition could not be loaded.', onRetry });
    expect(screen.getByRole('alert')).toHaveTextContent(/didn.t load/i);
    await user.click(screen.getByRole('button', { name: /try again/i }));
    expect(onRetry).toHaveBeenCalled();
  });

  it('a failed scan history keeps the cards and replaces only the chart', () => {
    renderSection({ summary: EARLY, scansError: 'The scan history could not be loaded.' });
    expect(screen.getByText(/Average of 8 scans/)).toBeInTheDocument();
    expect(screen.queryByTestId('trend')).toBeNull();
    expect(screen.getByText(/couldn.t load its scan history/)).toBeInTheDocument();
  });
});
