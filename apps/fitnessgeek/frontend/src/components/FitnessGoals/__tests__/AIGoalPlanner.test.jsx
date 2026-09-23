/**
 * The Calorie Wizard's own Height placeholder ("5'11", missing the closing
 * inch mark) didn't match parseHeightToInches' `/(\d+)'(\d+)"/`. Typing
 * exactly what the placeholder suggested made calculateBMR return 0 → a
 * dailyCalories floor of 1200 → and the Safety Check card reported "Safe"
 * over a calculation that never happened, with no error shown anywhere.
 *
 * These tests pin all three parts of the fix:
 *   1. the placeholder itself is now a parseable height
 *   2. a height the parser can't read produces a VISIBLE error and blocks
 *      progress, instead of silently becoming a BMR of 0
 *   3. even if a broken calculation were reached, the Safety Check could
 *      never call it "Safe" (checked indirectly here: the "Safe"/"Below
 *      minimum" verdict is provably unreachable for unparseable input,
 *      because the wizard can't advance past Step 1 with one)
 *
 * Every one of these goes red on the pre-fix component: the placeholder
 * itself is exactly the string that broke parsing, "Next" was never gated
 * on height validity, and there was no error text to find.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../../../services/influxService.js', () => ({ influxService: { getTrends: vi.fn(async () => ({ available: false, days: [], activeKcal30: null })) } }));
vi.mock('../../../services/userService.js', () => ({
  userService: {
    getProfile: vi.fn(() => Promise.resolve({ profile: {} })),
    getLatestWeight: vi.fn(() => Promise.resolve(null)),
    updateProfile: vi.fn(() => Promise.resolve({ success: true })),
  },
}));

vi.mock('../../../services/settingsService.js', () => ({
  settingsService: {
    getSettings: vi.fn(() => Promise.resolve({ data: {} })),
    updateSettings: vi.fn(() => Promise.resolve({})),
  },
}));

vi.mock('@geeksuite/auth', () => ({
  useAuth: () => ({ user: { profile: {} } }),
}));
// No scans: these tests are about the Mifflin path.
vi.mock('../../../services/bodyCompService.js', () => ({
  bodyCompService: { getSummary: vi.fn(() => Promise.resolve({ success: true, data: { total_scans: 0, bmr: { bmr: null, source: 'mifflin', lean_mass_lb: null, scans: 0 } } })) },
}));

vi.mock('@geeksuite/ui', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useToast: () => ({ notify: vi.fn() }) };
});

const { default: CalorieGoalWizard } = await import('../AIGoalPlanner.jsx');

/** Advances from Step 0 (mode selector) to Step 1 (profile), the wizard's default. */
async function goToProfileStep() {
  render(<CalorieGoalWizard />);
  fireEvent.click(await screen.findByRole('button', { name: /Continue/i }));
  // Profile step shows a spinner while loadUserProfile resolves; wait for a
  // field that only exists once the spinner is gone. ("Your Profile" itself
  // matches twice — the Stepper label and the panel heading — so it can't be
  // used as the settle signal.)
  await screen.findByLabelText(/^Age$/i);
}

async function fillRequiredFieldsExceptHeight() {
  fireEvent.change(screen.getByLabelText(/^Age$/i), { target: { value: '30' } });
  fireEvent.change(screen.getByLabelText(/Current Weight/i), { target: { value: '180' } });

  // MUI's Select isn't a native <select>: it's a div acting as a listbox
  // trigger, so it has to be opened and an option clicked rather than
  // fired at with a plain `change` event. Its trigger doesn't get an
  // aria-labelledby back to the InputLabel in this build (no `labelId`/`id`
  // pairing is wired up), so it has no accessible name to query by — the
  // Profile step's field order (Age, Weight, Height, Gender, Activity Level)
  // is the only reliable handle: Gender is the first of the two selects.
  const [genderCombo] = screen.getAllByRole('combobox');
  fireEvent.mouseDown(genderCombo);
  fireEvent.click(await screen.findByRole('option', { name: 'Male' }));
}

describe('Calorie Wizard — height parsing and the Safety Check', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('the placeholder itself is a height the parser can read', async () => {
    await goToProfileStep();
    const heightField = screen.getByPlaceholderText('5\'11"');
    expect(heightField).toBeInTheDocument();
  });

  it('typing the placeholder text (no closing quote) shows a visible error and blocks Next', async () => {
    await goToProfileStep();
    await fillRequiredFieldsExceptHeight();

    // This is the exact string the OLD placeholder told the user to type.
    fireEvent.change(screen.getByLabelText(/^Height$/i), { target: { value: "5'11" } });

    expect(await screen.findByText(/Can't read that height/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Next: Set Goal/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Save Profile/i })).toBeDisabled();

    // The bug this replaces: a "Safe" verdict rendered over a calculation
    // that never happened. With Next disabled, that verdict is unreachable —
    // confirm it never appears anywhere in the document for this input.
    expect(screen.queryByText(/^Safe$/)).toBeNull();
  });

  it.each([
    ["5'11\"", 'feet/inches with the closing quote'],
    ['5 ft 11', 'feet/inches spelled out'],
    ['71', 'bare inches'],
  ])('accepts %s (%s) and enables Next', async (value) => {
    await goToProfileStep();
    await fillRequiredFieldsExceptHeight();
    fireEvent.change(screen.getByLabelText(/^Height$/i), { target: { value } });

    await waitFor(() => {
      expect(screen.queryByText(/Can't read that height/i)).toBeNull();
    });
    expect(screen.getByRole('button', { name: /Next: Set Goal/i })).not.toBeDisabled();
  });

  it('a valid height reaches a real plan whose Safety Check reflects an actual calculation', async () => {
    await goToProfileStep();
    await fillRequiredFieldsExceptHeight();
    fireEvent.change(screen.getByLabelText(/^Height$/i), { target: { value: '5\'11"' } });

    fireEvent.click(await screen.findByRole('button', { name: /Next: Set Goal/i }));
    await screen.findByText('Set Your Weight Goal');

    fireEvent.change(screen.getByLabelText(/Target Weight/i), { target: { value: '170' } });
    fireEvent.click(screen.getByRole('button', { name: /Calculate My Plan/i }));

    await screen.findByText('Your Personalized Calorie Plan');
    // A real BMR was computed (5'11" @ 30/male/180lbs is well above the 1200
    // floor), so the Safety Check should report the honest verdict — not the
    // "Calculation error" state reserved for a height that never parsed.
    expect(screen.getByText('Safe')).toBeInTheDocument();
    expect(screen.queryByText('Calculation error')).toBeNull();
  });
});

describe('Calorie Wizard — Stepper navigation', () => {
  it('Step 1 has a way back to Step 0 (Back button)', async () => {
    await goToProfileStep();
    fireEvent.click(screen.getByRole('button', { name: /^Back$/i }));
    await screen.findByText('Choose your approach');
  });

  it('the Stepper header is clickable for a step already completed', async () => {
    await goToProfileStep();
    fireEvent.click(screen.getByRole('button', { name: 'Your Approach' }));
    await screen.findByText('Choose your approach');
  });
});
