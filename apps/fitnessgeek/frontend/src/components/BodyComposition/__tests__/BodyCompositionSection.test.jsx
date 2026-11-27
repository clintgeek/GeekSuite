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

const openMore = async (user) => {
  await user.click(screen.getByRole('button', { name: 'More from your scans' }));
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
  });

  // Round two: the open card was a lab report ("Skeletal muscle", "Belly fat
  // score (visceral fat)", "Calories at rest (BMR)", a fat/lean table).
  it('at rest it is one tidy summary in plain words, with the rest behind a tap', () => {
    renderSection({ summary: LATER });
    const summary = screen.getByTestId('body-comp-summary');
    expect(summary).toHaveTextContent('Body fat');
    expect(summary).toHaveTextContent('Muscle 98.1 lb');
    // Commas at 1,000 and above (review U-3).
    expect(summary).toHaveTextContent('Calories your body burns at rest 2,107');
    expect(document.body.textContent).not.toMatch(/Skeletal|visceral|BMR|Fat mass|Lean|Body water|Belly fat/);
    // The change and the chart are not on the page (nor fetched) until asked for.
    expect(screen.queryByText('Change')).toBeNull();
    expect(screen.queryByTestId('trend')).toBeNull();
    expect(screen.getByRole('button', { name: 'More from your scans' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('"More from your scans" opens the rest, still in plain labels', async () => {
    const user = userEvent.setup();
    renderSection({ summary: EARLY });
    await openMore(user);
    for (const label of ['Fat', 'Lean mass', 'Body water', 'Belly fat score']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.getByText('Everything that isn’t fat')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/Skeletal|visceral|BMR/);
    expect(await screen.findByTestId('trend')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show less' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('opens already expanded when asked to (the link from Import a scan)', async () => {
    renderSection({ summary: EARLY, defaultOpen: true });
    expect(screen.getByText('Belly fat score')).toBeInTheDocument();
    expect(await screen.findByTestId('trend')).toBeInTheDocument();
  });

  it('does not show the stored-but-hidden fields (D7)', () => {
    renderSection({ summary: EARLY });
    expect(screen.queryByText(/bone|protein|subcutaneous|segment|arm|leg|trunk/i)).toBeNull();
  });

  it('explains why these are averages, with the rest', async () => {
    const user = userEvent.setup();
    renderSection({ summary: EARLY });
    expect(screen.queryByText(/one scan can swing a percent or two/i)).toBeNull();
    await openMore(user);
    expect(screen.getByText(/one scan can swing a percent or two/i)).toBeVisible();
  });
});

describe('change card', () => {
  it('before the comparison exists: says when, and shows no number', async () => {
    renderSection({ summary: EARLY });
    await openMore(userEvent.setup());
    const card = screen.getByText('Change').closest('div').parentElement;
    expect(within(card).getByText('Your first comparison appears around Oct 4.')).toBeInTheDocument();
    expect(card.textContent).not.toMatch(/\d+\.\d\s*lb|[−+-]\d/);
  });

  it('once it exists: the reading, the three deltas, and both windows named', async () => {
    renderSection({ summary: LATER });
    await openMore(userEvent.setup());
    expect(screen.getByText("Of the 8.0 lb you’ve lost, about 7.0 lb was fat and 1.0 lb lean.")).toBeInTheDocument();
    const card = screen.getByText('Change').closest('div').parentElement;
    expect(card.textContent).toContain('−7.0');
    expect(card.textContent).toContain('−1.0');
    expect(card.textContent).toContain('−8.0');
    expect(card.textContent).toMatch(/Average of Aug 26 – Sep 1 \(7 scans\) against Sep 16–22 \(6 scans\)/);
  });
});

describe('states', () => {
  // Most people have no body-composition scale. They used to get a card
  // headed "No scans yet" that talked about a Nextcloud folder.
  it('empty: one quiet line with a link to Import a scan, and no card, heading or jargon', () => {
    renderSection({ summary: { total_scans: 0, current: null, change: null } });
    const line = screen.getByTestId('body-comp-invite');
    expect(line).toHaveTextContent('Have a scale that measures body fat?');
    expect(screen.getByRole('link', { name: /import a scan/i })).toHaveAttribute('href', '/scan-import');
    expect(screen.queryByRole('heading')).toBeNull();
    expect(document.querySelector('[data-fg-panel]')).toBeNull();
    expect(document.body.textContent).not.toMatch(/Nextcloud|No scans yet|export/i);
  });

  it('loading with nothing yet: draws nothing (no skeleton card that then vanishes)', () => {
    const { container } = renderSection({ summary: null, loading: true });
    expect(container).toBeEmptyDOMElement();
  });

  it('a retry in flight keeps the failure on screen', () => {
    renderSection({ summary: null, loading: true, error: 'x', onRetry: () => {} });
    expect(screen.getByTestId('body-comp-unknown')).toHaveTextContent(/couldn.t check for body scans/i);
    expect(screen.getByRole('button', { name: /trying/i })).toBeDisabled();
  });

  // For someone who may have no scans at all, a failed read is one quiet
  // line: not an alert, no card, no heading. It is still never "no scans".
  it('error: says so in one quiet line and offers a retry', async () => {
    const onRetry = vi.fn();
    const user = userEvent.setup();
    renderSection({ summary: null, error: 'Body composition could not be loaded.', onRetry });
    expect(screen.getByTestId('body-comp-unknown')).toHaveTextContent('Couldn’t check for body scans just now.');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('heading')).toBeNull();
    expect(document.querySelector('[data-fg-panel]')).toBeNull();
    expect(screen.queryByTestId('body-comp-invite')).toBeNull();
    await user.click(screen.getByRole('button', { name: /try again/i }));
    expect(onRetry).toHaveBeenCalled();
  });

  it('a failed scan history keeps the cards and replaces only the chart', async () => {
    renderSection({ summary: EARLY, scansError: 'The scan history could not be loaded.' });
    expect(screen.getByText(/Average of 8 scans/)).toBeInTheDocument();
    await openMore(userEvent.setup());
    expect(screen.queryByTestId('trend')).toBeNull();
    expect(screen.getByText(/couldn.t load its scan history/)).toBeInTheDocument();
  });

  it('a failed scan history can be retried where it failed', async () => {
    const onRetry = vi.fn();
    const user = userEvent.setup();
    renderSection({ summary: EARLY, scansError: 'x', onRetry });
    await openMore(user);
    await user.click(screen.getByRole('button', { name: /try again/i }));
    expect(onRetry).toHaveBeenCalled();
  });
});

describe('Add a scan, where the scans are (review IA-5)', () => {
  it('the header links to the scan import once there are scans', () => {
    renderSection({ summary: EARLY });
    expect(screen.getByRole('link', { name: 'Add a scan' })).toHaveAttribute('href', '/scan-import');
  });

  it('not on the empty state, which has its own Import button', () => {
    renderSection({ summary: { total_scans: 0 } });
    expect(screen.queryByRole('link', { name: 'Add a scan' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Import a scan' })).toBeInTheDocument();
  });
});
