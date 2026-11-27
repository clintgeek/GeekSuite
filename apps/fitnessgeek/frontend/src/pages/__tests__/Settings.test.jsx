/**
 * Settings, 2026-10-17 (UX review IA-2, IA-3, L17):
 *   - Profile is folded in: "About you" edits the name the greeting uses,
 *     the goal, age, height and sex; Account shows the email and Sign out.
 *   - Every switch and select saves as it changes ("Saved"); only the Garmin
 *     login has a button. No "Unsaved changes" bar, no Units.
 *   - Writes stay PARTIAL, and nothing is written over a failed load.
 *   - One app (DOCS/ONE_APP_PLAN.md): no Simple / Full chooser and no "More
 *     settings" fold. Calorie plan and Import a scan, which have no row in
 *     the navigation, are linked here.
 *   - 2026-11-27: what people change comes first, "Connected devices" last.
 *     The watch shows only its switch until it is on, folds its login away
 *     once connected, and its sleep suggestion is not shown without it. A
 *     failed save keeps what was typed and says so beside the field.
 *
 * Earlier pins kept: the dead Notifications switches stay gone.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const SETTINGS = {
  dashboard: {},
  theme: 'light',
  notifications: { enabled: true, daily_reminder: true, goal_reminders: true },
  units: { weight: 'lbs', height: 'ft' },
  garmin: { enabled: false, username: '' },
};

vi.mock('../../services/settingsService.js', () => ({
  settingsService: {
    getSettings: vi.fn(),
    getDefaultGarminSettings: () => ({ enabled: false, username: '' }),
    getDefaultDashboardSettings: () => ({}),
    updateSettings: vi.fn(() => Promise.resolve({})),
  },
}));

vi.mock('../../services/userService.js', () => ({
  userService: {
    getProfile: vi.fn(),
    updateProfile: vi.fn(() => Promise.resolve({ success: true })),
  },
}));

vi.mock('../../components/Settings/HouseholdSettings', () => ({
  default: () => <div data-testid="household">Household</div>,
}));

const setThemePreference = vi.fn();
vi.mock('@geeksuite/user', () => ({
  useThemeMode: () => ({ themePreference: 'light', setThemePreference }),
}));

const logout = vi.fn();
vi.mock('@geeksuite/auth', () => ({
  useAuth: () => ({ user: { email: 'heather@example.com' }, logout }),
}));

const notify = vi.fn();
vi.mock('@geeksuite/ui', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useToast: () => ({ notify, dismiss: vi.fn() }) };
});

const { settingsService } = await import('../../services/settingsService.js');
const { userService } = await import('../../services/userService.js');
const { ExperienceContext } = await import('../../contexts/ExperienceContext.jsx');
const { default: Settings } = await import('../Settings.jsx');

const WATCH_ON = { ...SETTINGS, garmin: { enabled: true, username: 'h@example.com' } };
const withWatch = () => settingsService.getSettings.mockResolvedValue({ data: JSON.parse(JSON.stringify(WATCH_ON)) });

const experience = (over = {}) => ({
  largerText: false,
  preferredName: 'Heather',
  goal: 'lose',
  setLargerText: vi.fn(() => Promise.resolve({ ok: true })),
  update: vi.fn(() => Promise.resolve({ ok: true })),
  ...over,
});

function mount(over = {}) {
  const value = experience(over);
  return Object.assign(value, { view: render(
    <MemoryRouter>
      <ExperienceContext.Provider value={value}>
        <Settings />
      </ExperienceContext.Provider>
    </MemoryRouter>
  ) });
}

beforeEach(() => {
  vi.clearAllMocks();
  settingsService.getSettings.mockResolvedValue({ data: JSON.parse(JSON.stringify(SETTINGS)) });
  userService.getProfile.mockResolvedValue({ email: 'heather@example.com', profile: { age: 52, height: '5\'4"', gender: 'female' } });
});

describe('Settings — what the page holds', () => {
  it('no notification toggles, no Units, no unsaved-changes bar', async () => {
    mount();
    await screen.findByRole('checkbox', { name: /Use my Garmin watch/i });
    expect(screen.queryByText(/Enable Notifications/i)).toBeNull();
    expect(screen.queryByText(/^Notifications$/i)).toBeNull();
    expect(screen.queryByText(/^Units$/)).toBeNull();
    expect(screen.queryByLabelText(/Weight Units/i)).toBeNull();
    expect(screen.queryByText(/Unsaved changes/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /Save Changes/i })).toBeNull();
  });

  it('Profile is folded in: About you, Household once, Account with email and Sign out', async () => {
    mount();
    expect(await screen.findByRole('heading', { name: 'About you' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'How it looks' })).toBeInTheDocument();
    expect(screen.getAllByTestId('household')).toHaveLength(1);
    expect(await screen.findByTestId('account-email')).toHaveTextContent('heather@example.com');
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(logout).toHaveBeenCalled();
    expect(document.getElementById('you')).not.toBeNull();
  });
});

describe('Settings — saves as it changes (IA-3)', () => {
  it('the sleep apnea switch saves health_alerts alone, at once, and says Saved', async () => {
    withWatch();
    mount();
    const toggle = await screen.findByRole('checkbox', { name: /Sleep apnea screening suggestion/i });
    expect(toggle).toBeChecked(); // no stored value -> default on
    fireEvent.click(toggle);
    await waitFor(() => expect(settingsService.updateSettings).toHaveBeenCalledTimes(1));
    expect(settingsService.updateSettings.mock.calls[0][0]).toEqual({ health_alerts: { sleep_apnea_screening: false } });
    await waitFor(() => expect(notify).toHaveBeenCalledWith('Saved', expect.anything()));
  });

  it('a failed save puts the switch back and says so', async () => {
    settingsService.updateSettings.mockRejectedValueOnce(new Error('Network Error'));
    withWatch();
    mount();
    const toggle = await screen.findByRole('checkbox', { name: /Sleep apnea screening suggestion/i });
    fireEvent.click(toggle);
    await waitFor(() => expect(toggle).toBeChecked());
    expect(notify).toHaveBeenCalledWith(expect.not.stringMatching(/Network Error/), expect.objectContaining({ tone: 'error' }));
  });

  it('the Garmin switch saves garmin.enabled alone — never the login', async () => {
    mount();
    fireEvent.click(await screen.findByRole('checkbox', { name: /Use my Garmin watch/i }));
    await waitFor(() => expect(settingsService.updateSettings).toHaveBeenCalledTimes(1));
    expect(settingsService.updateSettings.mock.calls[0][0]).toEqual({ garmin: { enabled: true } });
  });

  it('the Garmin login keeps its own button: Connect Garmin', async () => {
    settingsService.getSettings.mockResolvedValue({ data: { ...SETTINGS, garmin: { enabled: true, username: '' } } });
    mount();
    const connect = await screen.findByRole('button', { name: 'Connect Garmin' });
    expect(connect).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Garmin email/i), { target: { value: 'h@example.com' } });
    fireEvent.change(screen.getByLabelText(/Garmin password/i), { target: { value: 'pw' } });
    expect(settingsService.updateSettings).not.toHaveBeenCalled();
    fireEvent.click(connect);
    await waitFor(() => expect(settingsService.updateSettings).toHaveBeenCalledTimes(1));
    expect(settingsService.updateSettings.mock.calls[0][0]).toEqual({ garmin: { enabled: true, username: 'h@example.com', password: 'pw' } });
    // Connected now: it says so and folds the login away; opened again, the
    // same button updates the login (d-fixes; it said "Save").
    expect(await screen.findByTestId('garmin-connected')).toHaveTextContent('Connected as h@example.com');
    fireEvent.click(screen.getByRole('button', { name: 'Change Garmin login' }));
    expect(await screen.findByRole('button', { name: 'Update Garmin login' })).toBeInTheDocument();
  });

  it('a connected Garmin account offers "Update Garmin login"', async () => {
    settingsService.getSettings.mockResolvedValue({ data: { ...SETTINGS, garmin: { enabled: true, username: 'h@example.com' } } });
    mount();
    // Connected: one line says so, and the login is folded away.
    expect(await screen.findByTestId('garmin-connected')).toHaveTextContent('Connected as h@example.com');
    expect(screen.queryByLabelText(/Garmin email/i)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Change Garmin login' }));
    expect(await screen.findByRole('button', { name: 'Update Garmin login' })).toBeInTheDocument();
    expect(screen.getByLabelText(/Garmin email/i)).toHaveValue('h@example.com');
    expect(screen.queryByRole('button', { name: 'Save Garmin login' })).toBeNull();
  });

  it('a failed Garmin login save says so under the button and keeps what was typed', async () => {
    settingsService.getSettings.mockResolvedValue({ data: { ...SETTINGS, garmin: { enabled: true, username: '' } } });
    mount();
    const connect = await screen.findByRole('button', { name: 'Connect Garmin' });
    fireEvent.change(screen.getByLabelText(/Garmin email/i), { target: { value: 'h@example.com' } });
    fireEvent.change(screen.getByLabelText(/Garmin password/i), { target: { value: 'pw' } });
    settingsService.updateSettings.mockRejectedValueOnce(new Error('boom'));
    fireEvent.click(connect);
    expect(await screen.findByTestId('garmin-error')).toHaveTextContent('Couldn’t save your Garmin login. Try again.');
    expect(screen.getByLabelText(/Garmin email/i)).toHaveValue('h@example.com');
    expect(screen.getByLabelText(/Garmin password/i)).toHaveValue('pw');
    expect(screen.getByRole('button', { name: 'Connect Garmin' })).not.toBeDisabled();
  });

  it('the theme saves on change, through the account, with no settings write', async () => {
    mount();
    await screen.findByRole('checkbox', { name: /Use my Garmin watch/i });
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Theme' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Dark' }));
    expect(setThemePreference).toHaveBeenCalledWith('dark');
    expect(notify).toHaveBeenCalledWith('Saved', expect.anything());
    expect(settingsService.updateSettings).not.toHaveBeenCalled();
  });

  it('a failed load shows the error, not defaults, and nothing can be saved', async () => {
    settingsService.getSettings.mockRejectedValueOnce(Object.assign(new Error('Request failed with status code 502'), { response: { status: 502 } }));
    mount();
    expect(await screen.findByText('Couldn’t load settings')).toBeInTheDocument();
    expect(screen.getByText('FitnessGeek is restarting. Try again in a moment.')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /Sleep apnea/i })).toBeNull();
    expect(screen.queryByRole('checkbox', { name: /Garmin/i })).toBeNull();
    expect(document.body.textContent).not.toMatch(/status code/);
    // How it looks and About you have their own reads, and still work.
    expect(screen.getByRole('heading', { name: 'About you' })).toBeInTheDocument();
    expect(settingsService.updateSettings).not.toHaveBeenCalled();
  });
});

describe('Settings — About you (IA-2)', () => {
  it('"What should I call you?" edits the name the greeting uses', async () => {
    const v = mount();
    const field = await screen.findByLabelText('What should I call you?');
    expect(field).toHaveValue('Heather');
    fireEvent.change(field, { target: { value: 'Heth' } });
    fireEvent.blur(field);
    await waitFor(() => expect(v.update).toHaveBeenCalledWith({ preferred_name: 'Heth' }));
  });

  it('a name that fails to save stays in the field, with the failure said beside it', async () => {
    const v = mount({ update: vi.fn(() => Promise.resolve({ ok: false })) });
    const field = await screen.findByLabelText('What should I call you?');
    fireEvent.change(field, { target: { value: 'Heth' } });
    fireEvent.blur(field);
    expect(await screen.findByText('Couldn’t save that. Try again.')).toBeInTheDocument();
    expect(field).toHaveValue('Heth');
    // Leaving the field again tries again.
    fireEvent.blur(field);
    await waitFor(() => expect(v.update).toHaveBeenCalledTimes(2));
  });

  it('an age that fails to save stays in the field, with the failure said beside it', async () => {
    userService.updateProfile.mockRejectedValueOnce(new Error('boom'));
    mount();
    const age = await screen.findByLabelText('Age');
    fireEvent.change(age, { target: { value: '53' } });
    fireEvent.blur(age);
    expect(await screen.findByText('Couldn’t save that. Try again.')).toBeInTheDocument();
    expect(age).toHaveValue(53);
    fireEvent.blur(age);
    await waitFor(() => expect(userService.updateProfile).toHaveBeenCalledTimes(2));
  });

  it('"Your goal" can be changed after the first run', async () => {
    const v = mount();
    const group = await screen.findByRole('radiogroup', { name: 'Your goal' });
    expect(within(group).getByRole('radio', { name: 'Lose a little weight' })).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(within(group).getByRole('radio', { name: 'Just keep track' }));
    await waitFor(() => expect(v.update).toHaveBeenCalledWith({ goal: 'track' }));
  });

  it('age saves to the profile on its own, as it changes', async () => {
    mount();
    const age = await screen.findByLabelText('Age');
    expect(age).toHaveValue(52);
    fireEvent.change(age, { target: { value: '53' } });
    fireEvent.blur(age);
    await waitFor(() => expect(userService.updateProfile).toHaveBeenCalledWith({ age: 53 }));
  });

  it('height shows as feet and inches and saves as one readable height', async () => {
    mount();
    const feet = await screen.findByTestId('settings-height-feet');
    const inches = screen.getByTestId('settings-height-inches');
    expect(feet).toHaveValue(5);
    expect(inches).toHaveValue(4);
    fireEvent.change(inches, { target: { value: '5' } });
    fireEvent.blur(inches);
    await waitFor(() => expect(userService.updateProfile).toHaveBeenCalledWith({ height: '5\'5"' }));
  });

  it('a failed profile read writes nothing and offers a retry', async () => {
    userService.getProfile.mockRejectedValueOnce(new Error('boom'));
    mount();
    expect(await screen.findByText('Couldn’t load your details')).toBeInTheDocument();
    expect(screen.queryByLabelText('Age')).toBeNull();
    expect(userService.updateProfile).not.toHaveBeenCalled();
  });
});

describe('Settings — one app (ONE_APP_PLAN.md §2, §3)', () => {
  it('has no Simple / Full chooser, and keeps Larger text', async () => {
    const v = mount();
    await screen.findByRole('heading', { name: 'About you' });
    expect(screen.queryByRole('radio', { name: /^Simple/ })).toBeNull();
    expect(screen.queryByRole('radio', { name: /^Full/ })).toBeNull();
    expect(screen.queryByTestId('simple-view-line')).toBeNull();
    expect(document.body.textContent).not.toMatch(/\bSimple\b|\bFull\b/);
    const larger = screen.getByRole('checkbox', { name: 'Larger text' });
    fireEvent.click(larger);
    await waitFor(() => expect(v.setLargerText).toHaveBeenCalledWith(true));
  });

  it('nothing waits behind "More settings": the watch, Household and Account are on the page for everybody', async () => {
    mount();
    expect(await screen.findByRole('checkbox', { name: /Use my Garmin watch/i })).toBeInTheDocument();
    expect(screen.getByTestId('household')).toBeInTheDocument();
    expect(screen.getByTestId('account-email')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'More settings' })).toBeNull();
  });

  it('a person without the watch sees one switch: no login fields, no sleep suggestion', async () => {
    mount();
    const watch = await screen.findByRole('checkbox', { name: /Use my Garmin watch/i });
    expect(watch).not.toBeChecked();
    expect(screen.queryByLabelText(/Garmin email/i)).toBeNull();
    expect(screen.queryByLabelText(/Garmin password/i)).toBeNull();
    expect(screen.queryByRole('checkbox', { name: /Sleep apnea/i })).toBeNull();
    // Turning it on asks for the login.
    fireEvent.click(watch);
    expect(await screen.findByLabelText(/Garmin email/i)).toBeInTheDocument();
  });

  it('what people change comes first; Connected devices comes last, before Account', async () => {
    mount();
    await screen.findByRole('checkbox', { name: /Use my Garmin watch/i });
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      'How it looks', 'About you', 'Calorie plan', 'Connected devices', 'Account',
    ]);
  });

  it('links to Calorie plan (with the target, when there is one) and Import a scan', async () => {
    settingsService.getSettings.mockResolvedValue({ data: { ...SETTINGS, nutrition_goal: { enabled: true, daily_calorie_target: 1950 } } });
    mount();
    const plan = within(await screen.findByTestId('settings-plans')).getByRole('link', { name: /Calorie plan/ });
    expect(plan).toHaveAttribute('href', '/calorie-wizard');
    await waitFor(() => expect(plan).toHaveTextContent('1,950 calories a day'));
    expect(within(screen.getByTestId('settings-devices')).getByRole('link', { name: /Import a scan/ })).toHaveAttribute('href', '/scan-import');
  });

  it('with no plan the Calorie plan row offers to set one', async () => {
    mount();
    await screen.findByRole('checkbox', { name: /Use my Garmin watch/i });
    expect(within(screen.getByTestId('settings-plans')).getByRole('link', { name: /Calorie plan/ })).toHaveTextContent('Set a daily calorie target');
  });
});

// SUITE_REVIEW_2026-11 FitnessGeek #7: Android Back or a bottom-nav tap can
// take the page away with a field still focused, and a removed input fires
// no blur — the edit used to be dropped on a page that says it saves.
describe('Settings — an edit survives leaving without a blur', () => {
  it('the name is saved when the page goes away mid-edit', async () => {
    const v = mount();
    const field = await screen.findByLabelText('What should I call you?');
    fireEvent.change(field, { target: { value: 'Heth' } });
    v.view.unmount();
    await waitFor(() => expect(v.update).toHaveBeenCalledWith({ preferred_name: 'Heth' }));
  });

  it('a blur that already saved is not sent again on leaving', async () => {
    const v = mount();
    const field = await screen.findByLabelText('What should I call you?');
    fireEvent.change(field, { target: { value: 'Heth' } });
    fireEvent.blur(field);
    await waitFor(() => expect(v.update).toHaveBeenCalledTimes(1));
    v.view.unmount();
    await new Promise((r) => { setTimeout(r, 0); });
    expect(v.update).toHaveBeenCalledTimes(1);
  });

  it('age and height are saved when the page goes away mid-edit', async () => {
    const v = mount();
    const age = await screen.findByLabelText('Age');
    fireEvent.change(age, { target: { value: '53' } });
    fireEvent.change(screen.getByTestId('settings-height-inches'), { target: { value: '6' } });
    v.view.unmount();
    await waitFor(() => expect(userService.updateProfile).toHaveBeenCalledWith({ age: 53 }));
    expect(userService.updateProfile).toHaveBeenCalledWith({ height: '5\'6"' });
  });

  it('an unchanged page writes nothing on leaving', async () => {
    const v = mount();
    await screen.findByLabelText('Age');
    v.view.unmount();
    await new Promise((r) => { setTimeout(r, 0); });
    expect(v.update).not.toHaveBeenCalled();
    expect(userService.updateProfile).not.toHaveBeenCalled();
  });
});
