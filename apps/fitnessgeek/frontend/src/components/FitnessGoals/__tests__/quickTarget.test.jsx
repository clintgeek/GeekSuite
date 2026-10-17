/**
 * Simple's quick target (IA-1, L8; Chef 2026-10-17). In Simple, or with
 * ?quick=1, "Set your daily target" is one screen — "How fast?" and one
 * sentence — worked out by the wizard's own code and saved as the same
 * nutrition_goal. Full without the flag keeps the four-step wizard. The plan
 * starts from the 7-day average weight, the weight card's basis (D-3).
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { mifflinStJeorBMR, tdeeFromBMR } from '@geeksuite/utils';

vi.mock('../../../services/influxService.js', () => ({ influxService: { getTrends: vi.fn(async () => ({ available: false, days: [], activeKcal30: null })) } }));
vi.mock('../../../services/settingsService.js', () => ({
  settingsService: { getSettings: vi.fn(), updateSettings: vi.fn(() => Promise.resolve({})) },
}));
vi.mock('../../../services/weightService.js', () => ({
  weightService: { getWeightLogs: vi.fn() },
}));
vi.mock('../../../services/userService.js', () => ({
  userService: { getProfile: vi.fn(), getLatestWeight: vi.fn(), updateProfile: vi.fn(() => Promise.resolve({ success: true })) },
}));
vi.mock('../../../services/bodyCompService.js', () => ({
  bodyCompService: { getSummary: vi.fn(async () => ({ data: { total_scans: 0, bmr: { bmr: null, source: 'mifflin', lean_mass_lb: null, scans: 0 } } })) },
}));
vi.mock('@geeksuite/auth', () => ({ useAuth: () => ({ user: { id: 'u1', profile: {} } }) }));
const notify = vi.fn();
vi.mock('@geeksuite/ui', async (importOriginal) => ({
  ...(await importOriginal()),
  useToast: () => ({ notify }),
}));

const { settingsService } = await import('../../../services/settingsService.js');
const { userService } = await import('../../../services/userService.js');
const { weightService } = await import('../../../services/weightService.js');
const { ExperienceContext } = await import('../../../contexts/ExperienceContext.jsx');
const { default: CalorieGoalWizard } = await import('../AIGoalPlanner.jsx');

const HEATHER = { age: 52, height: '5\'4"', gender: 'female' };

function setup({ simple = true, goal = 'lose', profile = HEATHER, mean = 180.4, latest = 178.6, nutrition_goal = null, logs: givenLogs = null } = {}) {
  settingsService.getSettings.mockResolvedValue({ data: { nutrition_goal } });
  userService.getProfile.mockResolvedValue({ profile });
  userService.getLatestWeight.mockResolvedValue(latest);
  // Seven daily weigh-ins at `mean`: the card's helper (currentAverage) reads 7-day average = mean.
  const logs = mean == null ? [] : Array.from({ length: 7 }, (_, i) => ({
    log_date: `2026-10-${String(10 + i).padStart(2, '0')}T00:00:00.000Z`, weight_value: mean,
  }));
  weightService.getWeightLogs.mockResolvedValue({ success: true, data: givenLogs || logs });
  const value = { isSimple: simple, effectiveMode: simple ? 'simple' : 'full', goal };
  render(
    <ExperienceContext.Provider value={value}>
      <CalorieGoalWizard />
    </ExperienceContext.Provider>
  );
}

// The wizard's own arithmetic, written out: Mifflin, sedentary, minus 500 a lb.
const expectedTarget = ({ weightLb = 180.4, heightIn = 64, age = 52, gender = 'female', rate = 1 } = {}) => {
  const bmr = mifflinStJeorBMR({ weightLb, heightIn, age, gender });
  const tdee = tdeeFromBMR(bmr, 'sedentary');
  return Math.round(Math.max(Math.max(1200, Math.round(bmr * 0.8)), tdee - rate * 500));
};

describe('Quick target — Simple', () => {
  beforeEach(() => { vi.clearAllMocks(); });
  afterEach(() => { window.history.replaceState(null, '', '/'); });

  it('opens one screen: How fast?, no approach step, no plan types, nothing it already knows', async () => {
    setup();
    expect(await screen.findByText('How fast?')).toBeInTheDocument();
    expect(screen.queryByText(/Choose your approach/i)).toBeNull();
    expect(screen.queryByText(/Keto/i)).toBeNull();
    expect(screen.queryByText(/Weekender/i)).toBeNull();
    expect(screen.queryByText(/coming soon/i)).toBeNull();
    // Weight, height, age and sex are all known: none is asked.
    expect(screen.queryByLabelText(/Your age/i)).toBeNull();
    expect(screen.queryByLabelText(/Your weight now/i)).toBeNull();
    expect(screen.getByRole('radio', { name: 'Slowly (½ lb a week)' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Steady (1 lb a week)' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Faster (1½ lb a week)' })).toBeInTheDocument();
  });

  it('answers in one sentence, from the 7-day average, and saves the same nutrition_goal', async () => {
    setup();
    const target = expectedTarget();
    const result = await screen.findByTestId('quick-result');
    expect(result.textContent).toContain(`Your daily target: ${target.toLocaleString('en-US')} calories.`);
    expect(result.textContent).toContain('That should lose about 1 lb a week.');
    expect(screen.getByTestId('quick-known').textContent).toContain('180.4 lb (your 7-day average)');

    fireEvent.click(screen.getByRole('radio', { name: 'Slowly (½ lb a week)' }));
    expect(screen.getByTestId('quick-result').textContent).toContain('That should lose about ½ lb a week.');
    expect(screen.getByTestId('quick-result').textContent).toContain(`${expectedTarget({ rate: 0.5 }).toLocaleString('en-US')} calories`);

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(settingsService.updateSettings).toHaveBeenCalledTimes(1));
    const ng = settingsService.updateSettings.mock.calls[0][0].nutrition_goal;
    expect(ng).toMatchObject({
      enabled: true,
      daily_calorie_target: expectedTarget({ rate: 0.5 }),
      weight_change_rate: 0.5,
      plan_type: 'standard',
      mode: 'standard',
      activity_level: 'sedentary',
      start_weight: 180.4,
    });
    expect(ng.calc_inputs).toMatchObject({ weight_lb: 180.4, height_in: 64, age: 52, gender: 'female' });
    expect(ng).not.toHaveProperty('target_weight');
    expect(Number.isNaN(ng.timeline_weeks)).toBe(false);
  });

  it('keeps the BMR/TDEE card behind "How this was worked out"', async () => {
    setup();
    await screen.findByTestId('quick-result');
    expect(screen.queryByTestId('metabolism-card')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /How this was worked out/i }));
    expect(await screen.findByTestId('metabolism-card')).toBeInTheDocument();
  });

  it('asks only for what is missing, and keeps it on her profile', async () => {
    setup({ profile: { height: '5\'4"', gender: 'female' } });
    const age = await screen.findByLabelText(/Your age/i);
    expect(screen.queryByText('Sex')).toBeNull();
    expect(screen.queryByTestId('quick-result')).toBeNull();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    fireEvent.change(age, { target: { value: '52' } });
    await screen.findByTestId('quick-result');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(userService.updateProfile).toHaveBeenCalledWith({ age: 52 }));
  });

  it('a "keep steady" goal asks no speed and holds weight', async () => {
    setup({ goal: 'maintain' });
    const result = await screen.findByTestId('quick-result');
    expect(screen.queryByText('How fast?')).toBeNull();
    expect(result.textContent).toContain(`Your daily target: ${expectedTarget({ rate: 0 }).toLocaleString('en-US')} calories.`);
    expect(result.textContent).toContain('keep your weight about where it is');
  });

  it('starts from the SAME 7-day average the weight card computes (D-3)', async () => {
    const { currentAverage } = await import('../../Weight/weightTrend.js');
    const logs = [
      { log_date: '2026-10-10T00:00:00.000Z', weight_value: 182 },
      { log_date: '2026-10-12T00:00:00.000Z', weight_value: 181 },
      { log_date: '2026-10-14T00:00:00.000Z', weight_value: 179 },
      { log_date: '2026-10-16T00:00:00.000Z', weight_value: 178 },
    ];
    setup({ logs });
    const card = currentAverage(logs);
    expect((await screen.findByTestId('quick-known')).textContent)
      .toContain(`${Math.round(card * 10) / 10} lb (your 7-day average)`);
  });

  it('falls back to the latest weigh-in, and says so, without an average', async () => {
    setup({ mean: null, latest: 178.6 });
    expect((await screen.findByTestId('quick-known')).textContent).toContain('178.6 lb (your last weigh-in)');
  });
});

describe('Quick target — Full', () => {
  beforeEach(() => { vi.clearAllMocks(); });
  afterEach(() => { window.history.replaceState(null, '', '/'); });

  it('?quick=1 opens the quick form in Full too (the Home link)', async () => {
    window.history.replaceState(null, '', '/calorie-wizard?quick=1');
    setup({ simple: false });
    expect(await screen.findByText('How fast?')).toBeInTheDocument();
  });

  it('Full without the flag is the four-step wizard, unchanged', async () => {
    setup({ simple: false });
    expect(await screen.findByText(/Choose your approach/i)).toBeInTheDocument();
    expect(screen.queryByText('How fast?')).toBeNull();
  });
});
