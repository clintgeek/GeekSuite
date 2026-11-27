/**
 * Home's note about the calorie target: ONE calm sentence for either reason,
 * one action that opens the new target beside the old, "Not now" for 30 days
 * on this device, nothing while the day couldn't be loaded, and never a word
 * about what went wrong before. It survives localStorage throwing.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { BMR_CALC_VERSION, tdeeFromBMR } from '@geeksuite/utils';
import PlanAccuracyBanner, { planBannerKind, planNoteWords, scanTargetEstimate, DISMISS_KEY } from '../PlanAccuracyBanner.jsx';

// Chef's plan as found 2026-09-22: no bmr_calc_version.
const STALE = { enabled: true, bmr: 3314, tdee: 3977, daily_calorie_target: 2977, start_date: '2026-09-14T00:00:00.000Z' };
const CURRENT_MIFFLIN = { enabled: true, bmr: 2330, daily_calorie_target: 1800, bmr_calc_version: BMR_CALC_VERSION, bmr_source: 'mifflin', start_date: '2026-09-22T00:00:00.000Z' };
const CURRENT_SCAN = { ...CURRENT_MIFFLIN, bmr: 2104, bmr_source: 'scan' };
const SCAN = { bmr: 2104, source: 'scan', lean_mass_lb: 177, scans: 8 };
const NO_SCAN = { bmr: null, source: 'mifflin', lean_mass_lb: null };

const renderBanner = (ng, scan, props = {}) =>
  render(<MemoryRouter><PlanAccuracyBanner nutritionGoal={ng} scanBmr={scan} {...props} /></MemoryRouter>);
const DAY = 24 * 60 * 60 * 1000;

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

  it('the stale note says the details changed, with Update → the new target and Not now', () => {
    renderBanner(STALE, SCAN);
    const banner = screen.getByTestId('plan-accuracy-banner');
    expect(banner).toHaveAttribute('data-kind', 'stale');
    expect(banner.textContent).toBe('Your details have changed since your target was set.UpdateNot now');
    // Calm: a status, not an alert; no blame, no jargon.
    expect(banner).toHaveAttribute('role', 'status');
    expect(banner.textContent).not.toMatch(/too high|mistake|maths|formula|BMR|burn/i);
    expect(screen.getByRole('link', { name: 'Update' })).toHaveAttribute('href', '/calorie-wizard?update=1');
    expect(screen.getByRole('button', { name: 'Not now' })).toBeInTheDocument();
    expect(screen.getAllByTestId('plan-accuracy-banner')).toHaveLength(1);
  });

  // Round three: "can be more accurate" didn't say why or what would change.
  it('the scan note says the new target beside the one she has', () => {
    const plan = { ...CURRENT_MIFFLIN, tdee: tdeeFromBMR(2330, 'sedentary'), activity_level: 'sedentary', weight_change_rate: 1 };
    const tdee = tdeeFromBMR(2104, 'sedentary');
    const about = Math.round(Math.max(tdee - 500, Math.max(1200, Math.round(2104 * 0.8))) / 10) * 10;
    expect(scanTargetEstimate(plan, SCAN)).toBe(about);
    renderBanner(plan, SCAN);
    const banner = screen.getByTestId('plan-accuracy-banner');
    expect(banner).toHaveAttribute('data-kind', 'scan');
    expect(screen.getByTestId('plan-note-words').textContent)
      .toBe(`Your body scans suggest a target of about ${about.toLocaleString('en-US')} calories.`);
    expect(banner.textContent).not.toMatch(/BMR|at rest|formula/i);
    expect(screen.getByRole('link', { name: 'Update' })).toHaveAttribute('href', '/calorie-wizard?update=1');
  });

  it('measured activity carries over: the scan figure plus the same activity', () => {
    const plan = { ...CURRENT_MIFFLIN, tdee: 2830, activity_level: 'measured', weight_change_rate: 1, daily_calorie_target: 2330, calc_inputs: { active_kcal: 500 } };
    // 2104 + 500 − 500 = 2104 → about 2,100
    expect(scanTargetEstimate(plan, SCAN)).toBe(2100);
  });

  it('a plan that does not hold enough to say gets the plain sentence, never a made-up number', () => {
    expect(scanTargetEstimate(CURRENT_MIFFLIN, SCAN)).toBeNull();
    renderBanner(CURRENT_MIFFLIN, SCAN);
    expect(screen.getByTestId('plan-note-words').textContent).toBe('Your body scans can make your target more accurate.');
    expect(planNoteWords('scan', CURRENT_MIFFLIN, SCAN)).not.toMatch(/\d/);
  });

  it('sets its own padding whatever the caller passes', () => {
    renderBanner(STALE, SCAN, { sx: { px: 3, py: 1, mt: 4 } });
    const style = window.getComputedStyle(screen.getByTestId('plan-accuracy-banner'));
    expect(style.paddingLeft).toBe('32px');
    expect(style.paddingTop).toBe('24px');
  });

  it('renders nothing with no plan', () => {
    const { container } = renderBanner(null, SCAN);
    expect(container).toBeEmptyDOMElement();
  });

  it('never shows while the day could not be loaded', () => {
    const { container } = renderBanner(STALE, SCAN, { suppress: true });
    expect(container).toBeEmptyDOMElement();
  });

  it('"Not now" puts either note away, and it stays away on a fresh mount', () => {
    const { unmount } = renderBanner(STALE, SCAN);
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(screen.queryByTestId('plan-accuracy-banner')).toBeNull();
    unmount();

    const again = renderBanner(STALE, SCAN);
    expect(screen.queryByTestId('plan-accuracy-banner')).toBeNull();
    again.unmount();
    renderBanner(CURRENT_MIFFLIN, SCAN);
    expect(screen.queryByTestId('plan-accuracy-banner')).toBeNull();
  });

  it('stays away for 30 days, then comes back', () => {
    window.localStorage.setItem(DISMISS_KEY, String(Date.now() - 29 * DAY));
    const recent = renderBanner(STALE, SCAN);
    expect(screen.queryByTestId('plan-accuracy-banner')).toBeNull();
    recent.unmount();

    window.localStorage.setItem(DISMISS_KEY, String(Date.now() - 31 * DAY));
    renderBanner(STALE, SCAN);
    expect(screen.getByTestId('plan-accuracy-banner')).toBeInTheDocument();
  });

  it('a stored value that is not a past time is not a dismissal', () => {
    for (const junk of ['1', 'yes', String(Date.now() + 5 * DAY)]) {
      window.localStorage.setItem(DISMISS_KEY, junk);
      const view = renderBanner(STALE, SCAN);
      expect(screen.getByTestId('plan-accuracy-banner')).toBeInTheDocument();
      view.unmount();
    }
  });

  it('tolerates localStorage throwing: shows the note, and Not now still works for the view', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('SecurityError'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceeded'); });
    renderBanner(CURRENT_MIFFLIN, SCAN);
    expect(screen.getByTestId('plan-accuracy-banner')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(screen.queryByTestId('plan-accuracy-banner')).toBeNull();
  });
});
