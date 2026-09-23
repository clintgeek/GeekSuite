/**
 * Plan D2's dashboard banner: one banner at most, the stale-formula one wins
 * and can't be dismissed; the "measured BMR available" offer can, per plan,
 * and survives localStorage throwing.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { BMR_CALC_VERSION } from '@geeksuite/utils';
import PlanAccuracyBanner, { planBannerKind } from '../PlanAccuracyBanner.jsx';

// Chef's plan as found 2026-09-22: no bmr_calc_version.
const STALE = { enabled: true, bmr: 3314, tdee: 3977, daily_calorie_target: 2977, start_date: '2026-09-14T00:00:00.000Z' };
const CURRENT_MIFFLIN = { enabled: true, bmr: 2330, daily_calorie_target: 1800, bmr_calc_version: BMR_CALC_VERSION, bmr_source: 'mifflin', start_date: '2026-09-22T00:00:00.000Z' };
const CURRENT_SCAN = { ...CURRENT_MIFFLIN, bmr: 2104, bmr_source: 'scan' };
const SCAN = { bmr: 2104, source: 'scan', lean_mass_lb: 177, scans: 8 };
const NO_SCAN = { bmr: null, source: 'mifflin', lean_mass_lb: null };

const renderBanner = (ng, scan) =>
  render(<MemoryRouter><PlanAccuracyBanner nutritionGoal={ng} scanBmr={scan} /></MemoryRouter>);

describe('planBannerKind', () => {
  it('stale beats scan', () => expect(planBannerKind(STALE, SCAN)).toBe('stale'));
  it('scan when the plan is current but not scan-based', () => expect(planBannerKind(CURRENT_MIFFLIN, SCAN)).toBe('scan'));
  it('nothing when the plan already uses the scan', () => expect(planBannerKind(CURRENT_SCAN, SCAN)).toBeNull());
  it('nothing without a usable scan', () => expect(planBannerKind(CURRENT_MIFFLIN, NO_SCAN)).toBeNull());
  it('nothing without a plan', () => {
    expect(planBannerKind(null, SCAN)).toBeNull();
    expect(planBannerKind({}, SCAN)).toBeNull();
    // "Remove Goal" writes enabled:false and the merge keeps the old numbers.
    expect(planBannerKind({ ...STALE, enabled: false }, SCAN)).toBeNull();
  });
});

describe('PlanAccuracyBanner', () => {
  beforeEach(() => {
    try { window.localStorage.clear(); } catch { /* jsdom */ }
  });
  afterEach(() => vi.restoreAllMocks());

  it('shows the stale-formula banner with Recalculate → the wizard, and no dismiss', () => {
    renderBanner(STALE, SCAN);
    const banner = screen.getByTestId('plan-accuracy-banner');
    expect(banner).toHaveAttribute('data-kind', 'stale');
    expect(banner.textContent).toMatch(/formula error fixed on 20 Sep and is likely too high/);
    expect(screen.getByRole('link', { name: 'Recalculate' })).toHaveAttribute('href', '/calorie-wizard');
    expect(screen.queryByRole('button', { name: 'Dismiss' })).toBeNull();
    // Only one banner, even though a scan BMR is also available.
    expect(screen.getAllByTestId('plan-accuracy-banner')).toHaveLength(1);
    expect(screen.queryByText(/measured BMR from your body scans/)).toBeNull();
  });

  it('renders nothing with no plan', () => {
    const { container } = renderBanner(null, SCAN);
    expect(container).toBeEmptyDOMElement();
  });

  it('offers the scan BMR with both numbers, and Update plan → the wizard', () => {
    renderBanner(CURRENT_MIFFLIN, SCAN);
    expect(screen.getByText(/A measured BMR from your body scans is available \(≈2,104 kcal vs 2,330 in your plan\)/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Update plan' })).toHaveAttribute('href', '/calorie-wizard');
  });

  it('remembers a dismissal per plan', () => {
    const { unmount } = renderBanner(CURRENT_MIFFLIN, SCAN);
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByTestId('plan-accuracy-banner')).toBeNull();
    unmount();

    // Same plan, fresh mount: still dismissed.
    const again = renderBanner(CURRENT_MIFFLIN, SCAN);
    expect(screen.queryByTestId('plan-accuracy-banner')).toBeNull();
    again.unmount();

    // A different plan gets the offer again.
    renderBanner({ ...CURRENT_MIFFLIN, start_date: '2026-10-01T00:00:00.000Z', bmr: 2300 }, SCAN);
    expect(screen.getByTestId('plan-accuracy-banner')).toHaveAttribute('data-kind', 'scan');
  });

  it('tolerates localStorage throwing: shows the offer, and dismiss still works for the view', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('SecurityError'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceeded'); });
    renderBanner(CURRENT_MIFFLIN, SCAN);
    expect(screen.getByTestId('plan-accuracy-banner')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByTestId('plan-accuracy-banner')).toBeNull();
  });
});
