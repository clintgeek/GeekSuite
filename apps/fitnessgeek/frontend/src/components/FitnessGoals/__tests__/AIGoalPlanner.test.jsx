/**
 * The calorie plan: a few plain questions, one at a time, then "Your daily
 * target is N calories" and one Save (2026-11-27). The arithmetic is
 * calorieCalc.js, unchanged; these tests pin the way it is asked.
 *
 * Still pinned from the old four-step wizard:
 *   - a height that can't be read produces a VISIBLE error and blocks
 *     progress, instead of silently becoming a calories-at-rest of 0 and a
 *     1,200 floor reported as "Safe"
 *   - an evening plan starts on the LOCAL calendar day
 *
 * New here:
 *   - a failed read of the saved plan is an error with a retry, never "you
 *     have no plan" (a save from that screen would have replaced the plan)
 *   - a failed save says so on the page and keeps every answer
 *   - a person with a plan sees the plan first, with "Change plan"
 *   - the "too high" plan explains why and is one tap from a new target
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BMR_CALC_VERSION, mifflinStJeorBMR, tdeeFromBMR } from '@geeksuite/utils';

vi.mock('../../../services/influxService.js', () => ({ influxService: { getTrends: vi.fn(async () => ({ available: false, days: [], activeKcal30: null })) } }));
// No 7-day average here: the plan starts from the latest weigh-in.
vi.mock('../../../services/weightService.js', () => ({
  weightService: { getWeightLogs: vi.fn(async () => ({ success: true, data: [] })) },
}));
vi.mock('../../../services/userService.js', () => ({
  userService: { getProfile: vi.fn(), getLatestWeight: vi.fn(), updateProfile: vi.fn() },
}));
vi.mock('../../../services/settingsService.js', () => ({
  settingsService: { getSettings: vi.fn(), updateSettings: vi.fn() },
}));
// No scans: these tests are about the estimate path.
vi.mock('../../../services/bodyCompService.js', () => ({
  bodyCompService: { getSummary: vi.fn(() => Promise.resolve({ success: true, data: { total_scans: 0, bmr: { bmr: null, source: 'mifflin', lean_mass_lb: null, scans: 0 } } })) },
}));
const notify = vi.fn();
vi.mock('@geeksuite/ui', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useToast: () => ({ notify }) };
});

const { settingsService } = await import('../../../services/settingsService.js');
const { userService } = await import('../../../services/userService.js');
const { default: CalorieGoalWizard } = await import('../AIGoalPlanner.jsx');

const KNOWN = { age: 30, height: '5\'11"', gender: 'male' };

// A plan saved at the current version: 180 lb, 5'11", 30, male, moderate.
const SAVED_PLAN = {
  enabled: true, mode: 'standard', plan_type: 'weekender', activity_level: 'moderate',
  bmr: 1798, bmr_source: 'mifflin', bmr_calc_version: BMR_CALC_VERSION, tdee: 2787, min_safe_calories: 1438,
  daily_calorie_target: 2037, weekly_schedule: [1915, 1915, 1915, 1915, 2343, 2343, 1915],
  start_weight: 180, target_weight: 165, goal_weight_lbs: 165, weight_change_rate: 1.5, timeline_weeks: 10,
};
// The same person's plan from before the unit fix: no version, no inputs.
const STALE_PLAN = {
  enabled: true, bmr: 2900, tdee: 3480, daily_calorie_target: 2980,
  start_weight: 180, target_weight: 165, weight_change_rate: 1, plan_type: 'standard',
};

function setup({ profile = {}, weight = null, nutrition_goal = null } = {}) {
  settingsService.getSettings.mockResolvedValue({ data: { nutrition_goal } });
  settingsService.updateSettings.mockResolvedValue({});
  userService.getProfile.mockResolvedValue({ profile });
  userService.getLatestWeight.mockResolvedValue(weight);
  userService.updateProfile.mockResolvedValue({ success: true });
  return render(<CalorieGoalWizard />);
}

const next = () => fireEvent.click(screen.getByRole('button', { name: 'Next' }));

/** Step 1 for a person the app knows nothing about. */
async function fillAboutYou({ feet = '5', inches = '11' } = {}) {
  fireEvent.change(await screen.findByLabelText(/Weight now/i), { target: { value: '180' } });
  fireEvent.change(screen.getByTestId('plan-height-feet'), { target: { value: feet } });
  fireEvent.change(screen.getByTestId('plan-height-inches'), { target: { value: inches } });
  fireEvent.change(screen.getByLabelText(/^Age$/i), { target: { value: '30' } });
  fireEvent.mouseDown(screen.getByRole('combobox', { name: /Sex/i }));
  fireEvent.click(await screen.findByRole('option', { name: 'Male' }));
}

/** Goal weight → How fast? → How active? → the answer. */
async function answerTheRest({ targetWeight = '170' } = {}) {
  await screen.findByRole('heading', { name: 'What are you aiming for?' });
  fireEvent.change(screen.getByLabelText(/Goal weight/i), { target: { value: targetWeight } });
  next();
  await screen.findByRole('heading', { name: 'How fast?' });
  next();
  await screen.findByRole('heading', { name: 'How active are you?' });
  fireEvent.click(screen.getByRole('button', { name: 'See my target' }));
  await screen.findByTestId('plan-result');
}

describe('Calorie plan — plain questions, one at a time', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('asks one thing per step and ends on one number, one line and Save', async () => {
    setup();
    expect(await screen.findByRole('heading', { name: 'What do you weigh now?' })).toBeInTheDocument();
    expect(screen.getByText('Step 1 of 4')).toBeInTheDocument();
    // One question on screen: not the goal, the speed or the activity.
    expect(screen.queryByText('How fast?')).toBeNull();
    expect(screen.queryByLabelText(/Goal weight/i)).toBeNull();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();

    await fillAboutYou();
    next();
    await answerTheRest();

    const bmr = mifflinStJeorBMR({ weightLb: 180, heightIn: 71, age: 30, gender: 'male' });
    const target = Math.round(tdeeFromBMR(bmr, 'sedentary') - 500);
    expect(screen.getByTestId('plan-headline').textContent).toBe(`Your daily target: ${target.toLocaleString('en-US')} calories`);
    expect(screen.getByTestId('plan-outcome')).toHaveTextContent(/That should lose about 1 lb a week\. You’d reach 170 lb around /);
    // Round three: no "accountant's sheet" after the plain questions. The
    // grams, the week and old-vs-new wait behind the two closed rows.
    expect(screen.getByTestId('plan-details-toggle')).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByTestId('plan-working-toggle')).toHaveAttribute('aria-expanded', 'false');
    for (const hidden of ['macro-preview', 'plan-week', 'plan-comparison', 'plan-floor-note', 'plan-previous']) {
      expect(screen.queryByTestId(hidden)).toBeNull();
    }
    expect(screen.getByTestId('plan-result').textContent).not.toMatch(/Protein|at rest|→/);
    // No jargon on the answer; the working is behind a tap.
    expect(document.body.textContent).not.toMatch(/BMR|TDEE|kcal|Mifflin|Katch/);
    expect(screen.queryByTestId('metabolism-card')).toBeNull();
    expect(screen.getByRole('button', { name: 'Save plan' })).toBeInTheDocument();
  });

  it('a height that can’t be read shows an error and blocks Next', async () => {
    setup();
    await fillAboutYou({ feet: '9', inches: '2' });
    expect(await screen.findByText('Feet from 3 to 7, inches from 0 to 11.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    // The bug this replaces: "Safe" over a calculation that never happened.
    expect(screen.queryByText(/^Safe$/)).toBeNull();
  });

  it('a real plan’s safety check reflects an actual calculation', async () => {
    setup();
    await fillAboutYou();
    next();
    await answerTheRest();
    fireEvent.click(screen.getByTestId('plan-working-toggle'));
    expect(await screen.findByText('Safe')).toBeInTheDocument();
    expect(screen.queryByText('Calculation error')).toBeNull();
  });

  it('Back keeps what was answered', async () => {
    setup();
    await fillAboutYou();
    next();
    await screen.findByRole('heading', { name: 'What are you aiming for?' });
    fireEvent.change(screen.getByLabelText(/Goal weight/i), { target: { value: '170' } });
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByLabelText(/Weight now/i)).toHaveValue(180);
    next();
    expect(await screen.findByLabelText(/Goal weight/i)).toHaveValue(170);
  });

  it('shows what it already knows instead of asking, with a way to change it', async () => {
    setup({ profile: KNOWN, weight: 180 });
    expect(await screen.findByLabelText(/Weight now/i)).toHaveValue(180);
    expect(screen.getByText('From your last weigh-in')).toBeInTheDocument();
    expect(screen.getByTestId('plan-known')).toHaveTextContent('Also using your height (5\'11") and age (30).');
    expect(screen.queryByLabelText(/^Age$/i)).toBeNull();
    expect(screen.getByRole('button', { name: 'Next' })).not.toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Change these' }));
    expect(screen.getByLabelText(/^Age$/i)).toHaveValue(30);
  });

  it('will not take a goal weight above the weight now', async () => {
    setup({ profile: KNOWN, weight: 180 });
    await screen.findByLabelText(/Weight now/i);
    next();
    fireEvent.change(await screen.findByLabelText(/Goal weight/i), { target: { value: '190' } });
    expect(screen.getByText('Pick a weight below your weight now (180 lb).')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  });

  it('"Stay at this weight" asks no speed and saves a target that holds weight', async () => {
    setup({ profile: KNOWN, weight: 180 });
    await screen.findByLabelText(/Weight now/i);
    next();
    fireEvent.click(await screen.findByTestId('plan-goal-maintain'));
    expect(screen.queryByLabelText(/Goal weight/i)).toBeNull();
    expect(screen.getByText('Step 2 of 3')).toBeInTheDocument();
    next();
    await screen.findByRole('heading', { name: 'How active are you?' });
    fireEvent.click(screen.getByRole('button', { name: 'See my target' }));
    const bmr = mifflinStJeorBMR({ weightLb: 180, heightIn: 71, age: 30, gender: 'male' });
    expect(await screen.findByTestId('plan-headline')).toHaveTextContent(`${tdeeFromBMR(bmr, 'sedentary').toLocaleString('en-US')} calories`);
    expect(screen.getByTestId('plan-outcome')).toHaveTextContent('keep your weight about where it is');
    fireEvent.click(screen.getByRole('button', { name: 'Save plan' }));
    await waitFor(() => expect(settingsService.updateSettings).toHaveBeenCalledTimes(1));
    const ng = settingsService.updateSettings.mock.calls[0][0].nutrition_goal;
    expect(ng).toMatchObject({ weight_change_rate: 0, daily_calorie_target: tdeeFromBMR(bmr, 'sedentary') });
    expect(ng).not.toHaveProperty('target_weight');
  });

  it('"Adjust the details" holds the week and keto; the answers are saved as before', async () => {
    setup({ profile: KNOWN, weight: 180 });
    await screen.findByLabelText(/Weight now/i);
    next();
    await answerTheRest({ targetWeight: '165' });
    expect(screen.queryByTestId('plan-type-weekender')).toBeNull();
    fireEvent.click(screen.getByTestId('plan-details-toggle'));
    fireEvent.click(await screen.findByTestId('plan-type-weekender'));
    // The week appears once its days differ.
    expect(await screen.findByTestId('plan-week')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('plan-mode-keto'));
    expect(await screen.findByText('Net carbs a day, at most')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Save plan' }));
    await waitFor(() => expect(settingsService.updateSettings).toHaveBeenCalledTimes(1));
    const ng = settingsService.updateSettings.mock.calls[0][0].nutrition_goal;
    expect(ng).toMatchObject({
      enabled: true, plan_type: 'weekender', mode: 'keto', activity_level: 'sedentary',
      weight_change_rate: 1, target_weight: 165, goal_weight_lbs: 165, start_weight: 180,
      keto: { net_carb_limit_g: 20, track_net_carbs: true },
    });
    expect(new Set(ng.weekly_schedule).size).toBe(2);
    expect(ng.calc_inputs).toMatchObject({ weight_lb: 180, height_in: 71, age: 30, gender: 'male' });
    // Nothing she was not asked for is written to her profile.
    expect(userService.updateProfile).not.toHaveBeenCalled();
  });

  it('keeps what she had to type on her profile, only what was missing', async () => {
    setup({ profile: { height: '5\'11"', gender: 'male' }, weight: 180 });
    fireEvent.change(await screen.findByLabelText(/^Age$/i), { target: { value: '30' } });
    next();
    await answerTheRest();
    fireEvent.click(screen.getByRole('button', { name: 'Save plan' }));
    await waitFor(() => expect(userService.updateProfile).toHaveBeenCalledWith({ age: 30 }));
  });
});

describe('Calorie plan — reliability', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('a failed read of the saved plan is an error with a retry, not "no plan"', async () => {
    settingsService.getSettings.mockReset();
    settingsService.getSettings.mockRejectedValueOnce(new Error('boom')).mockResolvedValue({ data: { nutrition_goal: SAVED_PLAN } });
    userService.getProfile.mockResolvedValue({ profile: KNOWN });
    userService.getLatestWeight.mockResolvedValue(180);
    render(<CalorieGoalWizard />);
    expect(await screen.findByText('Couldn’t load your plan')).toBeInTheDocument();
    expect(screen.queryByText('What do you weigh now?')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /try again|retry/i }));
    expect(await screen.findByTestId('plan-summary')).toBeInTheDocument();
  });

  it('a failed save says so on the page, keeps every answer, and can be tried again', async () => {
    setup({ profile: KNOWN, weight: 180 });
    await screen.findByLabelText(/Weight now/i);
    next();
    await answerTheRest({ targetWeight: '165' });
    const headline = screen.getByTestId('plan-headline').textContent;
    settingsService.updateSettings.mockRejectedValueOnce(new Error('boom'));
    fireEvent.click(screen.getByRole('button', { name: 'Save plan' }));
    expect(await screen.findByTestId('plan-save-error')).toHaveTextContent('Couldn’t save your plan. Try again.');
    expect(screen.getByTestId('plan-headline')).toHaveTextContent(headline);
    expect(screen.queryByTestId('plan-summary')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Save plan' }));
    expect(await screen.findByTestId('plan-summary')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Saved');
    expect(settingsService.updateSettings).toHaveBeenCalledTimes(2);
    expect(settingsService.updateSettings.mock.calls[1][0].nutrition_goal.target_weight).toBe(165);
  });

  it('a second tap while saving does not save twice', async () => {
    setup({ profile: KNOWN, weight: 180 });
    await screen.findByLabelText(/Weight now/i);
    next();
    await answerTheRest();
    let finish;
    settingsService.updateSettings.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const save = screen.getByRole('button', { name: 'Save plan' });
    fireEvent.click(save);
    expect(await screen.findByRole('button', { name: 'Saving…' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Saving…' }));
    finish({});
    await screen.findByTestId('plan-summary');
    expect(settingsService.updateSettings).toHaveBeenCalledTimes(1);
  });
});

describe('Calorie plan — a person who already has one', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('sees the plan first, and "Change plan" starts from what she chose before', async () => {
    setup({ profile: KNOWN, weight: 178, nutrition_goal: SAVED_PLAN });
    const summary = await screen.findByTestId('plan-summary');
    expect(summary).toHaveTextContent('Your daily target: 2,037 calories');
    expect(summary).toHaveTextContent('That should lose about 1½ lb a week.');
    // The week is behind "How this was worked out" (round three).
    expect(screen.queryByTestId('plan-week')).toBeNull();
    expect(screen.queryByTestId('macro-preview')).toBeNull();
    fireEvent.click(screen.getByTestId('plan-working-toggle'));
    expect(await screen.findByTestId('plan-week')).toHaveTextContent('2,343');
    expect(screen.getByTestId('macro-preview')).toBeInTheDocument();
    expect(screen.queryByText('What do you weigh now?')).toBeNull();
    expect(screen.queryByTestId('plan-stale-notice')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Change plan' }));
    expect(await screen.findByLabelText(/Weight now/i)).toHaveValue(178);
    expect(screen.getByTestId('plan-current-target')).toHaveTextContent('Your target now is 2,037 calories. Nothing changes until you save.');
    next();
    expect(await screen.findByLabelText(/Goal weight/i)).toHaveValue(165);
    next();
    expect(await screen.findByTestId('plan-speed-1.5')).toHaveAttribute('aria-checked', 'true');
    next();
    expect(await screen.findByTestId('plan-activity-moderate')).toHaveAttribute('aria-checked', 'true');
    expect(settingsService.updateSettings).not.toHaveBeenCalled();
  });

  it('a plan that can be more accurate says so calmly, and is one tap from a new target beside the old', async () => {
    setup({ profile: KNOWN, weight: 180, nutrition_goal: STALE_PLAN });
    const notice = await screen.findByTestId('plan-stale-notice');
    expect(notice).toHaveTextContent('Your target can be more accurate now');
    expect(notice).toHaveTextContent('Your details have changed since this was worked out.');
    // Never a word about what went wrong before (round two, item 1).
    expect(document.body.textContent).not.toMatch(/mistake|maths|too high|bug/i);
    // The facts stay available, under "How this was worked out".
    fireEvent.click(screen.getByTestId('plan-working-toggle'));
    expect(await screen.findByTestId('plan-working-note')).toHaveTextContent(/weren’t kept/);
    expect(document.body.textContent).not.toMatch(/mistake|maths|too high|bug/i);

    fireEvent.click(screen.getByRole('button', { name: 'Update my target' }));
    const bmr = mifflinStJeorBMR({ weightLb: 180, heightIn: 71, age: 30, gender: 'male' });
    const target = Math.round(tdeeFromBMR(bmr, 'sedentary') - 500);
    expect(await screen.findByTestId('plan-headline')).toHaveTextContent(`Your daily target: ${target.toLocaleString('en-US')} calories`);
    // One line for the old target; the row-by-row comparison is behind a tap.
    expect(screen.getByTestId('plan-previous').textContent).toBe('It was 2,980. Nothing changes until you save.');
    expect(screen.queryByTestId('plan-comparison')).toBeNull();
    fireEvent.click(screen.getByTestId('plan-working-toggle'));
    expect(await screen.findByTestId('plan-comparison')).toHaveTextContent(`2,980 → ${target.toLocaleString('en-US')} cal`);
    // Nothing was written by looking.
    expect(settingsService.updateSettings).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Save plan' }));
    await waitFor(() => expect(settingsService.updateSettings).toHaveBeenCalledTimes(1));
    const ng = settingsService.updateSettings.mock.calls[0][0].nutrition_goal;
    expect(ng).toMatchObject({ daily_calorie_target: target, bmr_calc_version: BMR_CALC_VERSION, target_weight: 165, weight_change_rate: 1 });
    // Saved at the current version, so the notice is gone.
    await screen.findByTestId('plan-summary');
    expect(screen.queryByTestId('plan-stale-notice')).toBeNull();
  });

  // Home's "Update" link: /calorie-wizard?update=1.
  describe('arriving with ?update=1', () => {
    const at = (search) => window.history.replaceState(null, '', `/calorie-wizard${search}`);
    afterEach(() => at(''));

    it('opens straight on the new target beside the old, and writes nothing until Save', async () => {
      at('?update=1');
      setup({ profile: KNOWN, weight: 180, nutrition_goal: STALE_PLAN });
      await screen.findByTestId('plan-result');
      expect(screen.getByTestId('plan-previous')).toHaveTextContent('It was 2,980.');
      fireEvent.click(screen.getByTestId('plan-working-toggle'));
      expect(await screen.findByTestId('plan-comparison')).toHaveTextContent(/2,980 → /);
      expect(screen.getByRole('button', { name: 'Save plan' })).toBeEnabled();
      expect(settingsService.updateSettings).not.toHaveBeenCalled();
    });

    it('a plan with nothing to improve just shows the plan', async () => {
      at('?update=1');
      setup({ profile: KNOWN, weight: 180, nutrition_goal: SAVED_PLAN });
      await screen.findByTestId('plan-summary');
      expect(screen.queryByTestId('plan-result')).toBeNull();
    });

    it('when a detail is missing it stays on the plan, with the offer and its button', async () => {
      at('?update=1');
      setup({ profile: {}, weight: 180, nutrition_goal: STALE_PLAN });
      await screen.findByTestId('plan-summary');
      expect(screen.getByRole('button', { name: 'Update my target' })).toBeInTheDocument();
      expect(screen.queryByTestId('plan-result')).toBeNull();
    });
  });

  it('"Remove plan" asks first, and a failed removal keeps the plan on screen', async () => {
    setup({ profile: KNOWN, weight: 180, nutrition_goal: SAVED_PLAN });
    fireEvent.click(await screen.findByRole('button', { name: 'Remove plan' }));
    expect(settingsService.updateSettings).not.toHaveBeenCalled();
    expect(screen.getByText('Remove this plan?')).toBeInTheDocument();

    settingsService.updateSettings.mockRejectedValueOnce(new Error('boom'));
    fireEvent.click(screen.getByRole('button', { name: 'Yes, remove it' }));
    expect(await screen.findByText('Couldn’t remove your plan. Try again.')).toBeInTheDocument();
    expect(screen.getByTestId('plan-summary')).toHaveTextContent('2,037 calories');

    fireEvent.click(screen.getByRole('button', { name: 'Yes, remove it' }));
    expect(await screen.findByRole('heading', { name: 'What do you weigh now?' })).toBeInTheDocument();
    expect(settingsService.updateSettings).toHaveBeenLastCalledWith({ nutrition_goal: { enabled: false } });
  });
});

describe('Calorie plan — an evening plan starts today (review P2)', () => {
  const realTZ = process.env.TZ;
  afterEach(() => {
    vi.useRealTimers();
    process.env.TZ = realTZ;
  });

  it('start_date is the LOCAL calendar day, not tomorrow in UTC', async () => {
    vi.clearAllMocks();
    process.env.TZ = 'America/Chicago';
    vi.useFakeTimers({ toFake: ['Date'] });
    // 22:30 Central on Oct 15 is already Oct 16 in UTC.
    vi.setSystemTime(new Date('2026-10-16T03:30:00.000Z'));
    setup({ profile: KNOWN, weight: 180 });
    await screen.findByLabelText(/Weight now/i);
    next();
    await answerTheRest();
    fireEvent.click(screen.getByRole('button', { name: 'Save plan' }));
    await waitFor(() => expect(settingsService.updateSettings).toHaveBeenCalled());
    const goal = settingsService.updateSettings.mock.calls.at(-1)[0].nutrition_goal;
    expect(goal.start_date).toBe('2026-10-15');
    expect(goal.estimated_end_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
