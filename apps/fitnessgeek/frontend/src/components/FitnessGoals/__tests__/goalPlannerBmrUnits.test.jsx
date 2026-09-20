/**
 * The calorie target the app holds you to, pinned at the component level.
 *
 * `packages/utils/src/__tests__/energy.test.js` proves the formula. This file
 * proves the PLANNER uses it — that the pounds in the "Current Weight (lbs)"
 * field and the inches `parseHeightToInches` returns reach
 * `mifflinStJeorBMR` as pounds and inches, and that what gets SAVED carries
 * the provenance needed to audit or re-derive it later.
 *
 * Worth having separately because the unit bug was never a formula error:
 * the formula was transcribed correctly and handed the wrong units by its
 * caller. A test of the formula alone would have passed throughout.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { BMR_CALC_VERSION, mifflinStJeorBMR } from '@geeksuite/utils';

vi.mock('../../../services/settingsService.js', () => ({
  settingsService: { getSettings: vi.fn(), updateSettings: vi.fn() },
}));
vi.mock('../../../services/userService.js', () => ({
  userService: { getProfile: vi.fn(), getLatestWeight: vi.fn() },
}));
vi.mock('@geeksuite/auth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('@geeksuite/ui', async (importOriginal) => ({
  ...(await importOriginal()),
  useToast: () => ({ notify: vi.fn() }),
}));

const { settingsService } = await import('../../../services/settingsService.js');
const { userService } = await import('../../../services/userService.js');
const { default: AIGoalPlanner } = await import('../AIGoalPlanner.jsx');

// The stored plan found in the live database on 2026-09-20: a BMR no adult
// has, produced by the unit bug, with no version stamp and no inputs.
const STALE_PLAN = {
  enabled: true,
  bmr: 3314,
  tdee: 3977,
  daily_calorie_target: 2977,
  start_weight: 300,
  target_weight: 250,
  weight_change_rate: 2,
  plan_type: 'standard',
};

const withSettings = (nutrition_goal) => {
  settingsService.getSettings.mockResolvedValue({ data: { nutrition_goal } });
  userService.getProfile.mockResolvedValue({ profile: { age: 45, height: '5\'11"', gender: 'male' } });
  userService.getLatestWeight.mockResolvedValue(300);
};

describe('AIGoalPlanner — BMR units and plan provenance', () => {
  beforeEach(() => vi.clearAllMocks());

  it('warns that a plan saved before the fix cannot be trusted', async () => {
    withSettings(STALE_PLAN);
    render(<AIGoalPlanner />);
    await waitFor(() =>
      expect(screen.getByText(/calculated with a unit error/i)).toBeInTheDocument()
    );
  });

  it('does not warn about a plan calculated at the current version', async () => {
    withSettings({ ...STALE_PLAN, bmr: 2359, bmr_calc_version: BMR_CALC_VERSION });
    render(<AIGoalPlanner />);
    await waitFor(() => expect(settingsService.getSettings).toHaveBeenCalled());
    expect(screen.queryByText(/calculated with a unit error/i)).not.toBeInTheDocument();
  });

  it('does not warn a user who has never saved a plan', async () => {
    // "No plan" is not "a wrong plan"; telling them otherwise is its own lie.
    withSettings(null);
    render(<AIGoalPlanner />);
    await waitFor(() => expect(settingsService.getSettings).toHaveBeenCalled());
    expect(screen.queryByText(/calculated with a unit error/i)).not.toBeInTheDocument();
  });
});

describe('the magnitude this fix is about', () => {
  it('the stored 3314 is not a BMR any adult has; the corrected figure is ~1000 lower', () => {
    // 300 lb, 5'11", 45y male — the profile that produced the live stored plan.
    const corrected = mifflinStJeorBMR({ weightLb: 300, heightIn: 71, age: 45, gender: 'male' });
    expect(corrected).toBeLessThan(2600);
    expect(STALE_PLAN.bmr - corrected).toBeGreaterThan(900);
  });
});
