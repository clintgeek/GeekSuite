/**
 * Plan D1/D2/D3 at the component level: which BMR the planner uses, that it
 * says which, that the save records it, and that re-running over a saved plan
 * shows old vs new before anything is overwritten.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import {
  BMR_CALC_VERSION, katchMcArdleBMR, mifflinStJeorBMR, tdeeFromBMR,
} from '@geeksuite/utils';

vi.mock('../../../services/settingsService.js', () => ({
  settingsService: { getSettings: vi.fn(), updateSettings: vi.fn(() => Promise.resolve({})) },
}));
vi.mock('../../../services/userService.js', () => ({
  userService: { getProfile: vi.fn(), getLatestWeight: vi.fn(), updateProfile: vi.fn() },
}));
vi.mock('../../../services/bodyCompService.js', () => ({
  bodyCompService: { getSummary: vi.fn() },
}));
vi.mock('@geeksuite/auth', () => ({ useAuth: () => ({ user: { id: 'u1', profile: {} } }) }));
vi.mock('@geeksuite/ui', async (importOriginal) => ({
  ...(await importOriginal()),
  useToast: () => ({ notify: vi.fn() }),
}));

const { settingsService } = await import('../../../services/settingsService.js');
const { userService } = await import('../../../services/userService.js');
const { bodyCompService } = await import('../../../services/bodyCompService.js');
const { default: CalorieGoalWizard } = await import('../AIGoalPlanner.jsx');

// Chef's saved plan as found 2026-09-22 (FITNESSGEEK_BODY_DATA_PLAN F1).
const CHEF_STALE_PLAN = {
  enabled: true,
  mode: 'standard',
  bmr: 3314,
  tdee: 3977,
  daily_calorie_target: 2977,
  weekly_schedule: [2798, 2798, 2798, 2798, 3424, 3424, 2798],
  start_weight: 320,
  target_weight: 250,
  weight_change_rate: 1,
  plan_type: 'weekender',
};

const SCAN_SUMMARY = {
  success: true,
  data: { total_scans: 8, bmr: { bmr: 2104, source: 'scan', lean_mass_lb: 177, scans: 8, scan_age_days: 1 } },
};
const STALE_SCAN_SUMMARY = {
  success: true,
  data: { total_scans: 3, bmr: { bmr: null, source: 'mifflin', lean_mass_lb: null, scans: 0, scan_age_days: 45 } },
};

const PROFILE = { weightLb: 318, heightIn: 71, age: 45, gender: 'male' };

function setup({ nutrition_goal = null, summary = SCAN_SUMMARY } = {}) {
  settingsService.getSettings.mockResolvedValue({ data: { nutrition_goal } });
  userService.getProfile.mockResolvedValue({ profile: { age: 45, height: '5\'11"', gender: 'male' } });
  userService.getLatestWeight.mockResolvedValue(318);
  if (summary instanceof Error) bodyCompService.getSummary.mockRejectedValue(summary);
  else bodyCompService.getSummary.mockResolvedValue(summary);
  render(<CalorieGoalWizard />);
}

/** Step 0 → 1 → 2 → Calculate. Profile fields arrive prefilled from the mocks. */
async function runToPlan({ targetWeight = '250' } = {}) {
  fireEvent.click(await screen.findByRole('button', { name: /Continue/i }));
  await screen.findByLabelText(/^Age$/i);
  const next = screen.getByRole('button', { name: /Next: Set Goal/i });
  await waitFor(() => expect(next).not.toBeDisabled());
  fireEvent.click(next);
  await screen.findByText('Set Your Weight Goal');
  fireEvent.change(screen.getByLabelText(/Target Weight/i), { target: { value: targetWeight } });
  fireEvent.click(screen.getByRole('button', { name: /Calculate My Plan/i }));
  await screen.findByText('Your Personalized Calorie Plan');
}

describe('CalorieGoalWizard — BMR source (plan D1)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uses Katch-McArdle from scan lean mass when a usable scan exists, and says so', async () => {
    setup();
    await runToPlan();
    const expected = katchMcArdleBMR({ leanMassLb: 177 });
    expect(screen.getByText(`${expected} calories/day`)).toBeInTheDocument();
    const note = screen.getByTestId('bmr-source');
    expect(note).toHaveAttribute('data-source', 'scan');
    expect(note.textContent).toMatch(/Measured — from your body scans: 177 lb lean mass, averaged over 8 scans/);
    expect(screen.getByText(`${tdeeFromBMR(expected, 'sedentary')} calories/day`)).toBeInTheDocument();
  });

  it('falls back to Mifflin-St Jeor when the scans are too old, and says so', async () => {
    setup({ summary: STALE_SCAN_SUMMARY });
    await runToPlan();
    expect(screen.getByText(`${mifflinStJeorBMR(PROFILE)} calories/day`)).toBeInTheDocument();
    const note = screen.getByTestId('bmr-source');
    expect(note).toHaveAttribute('data-source', 'mifflin');
    expect(note.textContent).toMatch(/Estimated from weight, height, age and sex \(Mifflin-St Jeor\)/);
    expect(note.textContent).not.toMatch(/couldn't be loaded/);
  });

  it('falls back to Mifflin visibly when the scan fetch fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    setup({ summary: new Error('network') });
    await runToPlan();
    expect(screen.getByText(`${mifflinStJeorBMR(PROFILE)} calories/day`)).toBeInTheDocument();
    const note = screen.getByTestId('bmr-source');
    expect(note).toHaveAttribute('data-source', 'mifflin');
    expect(note.textContent).toMatch(/couldn't be loaded/);
  });

  it('saves bmr_source and lean_mass_lb with the plan, alongside calc_inputs and the version', async () => {
    setup();
    await runToPlan();
    fireEvent.click(screen.getByRole('button', { name: /Start Tracking/i }));
    await waitFor(() => expect(settingsService.updateSettings).toHaveBeenCalled());
    const ng = settingsService.updateSettings.mock.calls[0][0].nutrition_goal;
    expect(ng.bmr).toBe(katchMcArdleBMR({ leanMassLb: 177 }));
    expect(ng.bmr_source).toBe('scan');
    expect(ng.lean_mass_lb).toBe(177);
    expect(ng.bmr_calc_version).toBe(BMR_CALC_VERSION);
    expect(ng.calc_inputs).toMatchObject({ weight_lb: 318, height_in: 71, age: 45, gender: 'male' });
    // The macro rules prefer goal_weight_lbs over target_weight, and settings
    // writes merge — so both must carry the new target, or an old
    // goal_weight_lbs would silently keep setting protein and fat.
    expect(ng.target_weight).toBeGreaterThan(0);
    expect(ng.goal_weight_lbs).toBe(ng.target_weight);
  });

  it('saves bmr_source "mifflin" and an explicit null lean mass without a usable scan', async () => {
    setup({ summary: STALE_SCAN_SUMMARY });
    await runToPlan();
    fireEvent.click(screen.getByRole('button', { name: /Start Tracking/i }));
    await waitFor(() => expect(settingsService.updateSettings).toHaveBeenCalled());
    const ng = settingsService.updateSettings.mock.calls[0][0].nutrition_goal;
    expect(ng.bmr_source).toBe('mifflin');
    // null, not undefined: the mutation merges, so an omitted field would
    // leave a previous scan plan's lean mass in place.
    expect(ng.lean_mass_lb).toBeNull();
  });
});

describe('CalorieGoalWizard — protein preview (plan D3)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('previews protein from lean mass and says so in one line', async () => {
    setup();
    await runToPlan();
    const preview = screen.getByTestId('macro-preview');
    expect(preview.textContent).toMatch(/Protein 177g/);
    expect(within(preview).getByTestId('protein-basis').textContent).toMatch(/from your lean mass: 1 g per lb × 177 lb/);
  });

  it('previews protein from goal weight, with no lean-mass line, without a scan', async () => {
    setup({ summary: STALE_SCAN_SUMMARY });
    await runToPlan({ targetWeight: '250' });
    const preview = screen.getByTestId('macro-preview');
    expect(preview.textContent).toMatch(/Protein 200g/); // 0.8 × 250
    expect(screen.queryByTestId('protein-basis')).toBeNull();
  });
});

describe('CalorieGoalWizard — old vs new (plan D2)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows the saved target and BMR next to the new ones before saving', async () => {
    setup({ nutrition_goal: CHEF_STALE_PLAN });
    // Existing-plan summary first; no comparison yet.
    fireEvent.click(await screen.findByRole('button', { name: /^Update$/ }));
    await runToPlan();

    const cmp = screen.getByTestId('plan-comparison');
    const newBmr = katchMcArdleBMR({ leanMassLb: 177 });
    expect(cmp.textContent).toContain(`3,314 → ${newBmr.toLocaleString('en-US')} kcal`);
    expect(cmp.textContent).toMatch(/Daily target2,977 → /);
    expect(cmp.textContent).toMatch(/formula error fixed on 20 Sep/);
    expect(cmp.textContent).toMatch(/Nothing changes until you save/);
    // Nothing was written by re-running.
    expect(settingsService.updateSettings).not.toHaveBeenCalled();
  });

  it('shows no comparison on a first plan', async () => {
    setup();
    await runToPlan();
    expect(screen.queryByTestId('plan-comparison')).toBeNull();
  });
});
