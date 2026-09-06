import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AccountPage from '../../pages/AccountPage';
import { renderWithProviders } from '../testUtils';
import { useUser, useThemeMode } from '@geeksuite/user';

vi.mock('@geeksuite/user', () => ({
  useUser: vi.fn(),
  useThemeMode: vi.fn(),
}));

// Real GeekEmptyState/GeekErrorState/GeekToastProvider stay real; only
// useToast is swapped for a spy, so a save's notify(...) call can be
// asserted directly instead of scraping the Snackbar DOM.
const notify = vi.fn();
vi.mock('@geeksuite/ui', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useToast: () => ({ notify, dismiss: vi.fn() }) };
});

const IDENTITY = { username: 'chef', email: 'chef@clintgeek.com', createdAt: '2026-01-01T00:00:00Z' };
const PROFILE = { displayName: 'Chef', bio: 'Builds fires.', timezone: 'America/Chicago', locale: 'en-US', country: 'US' };
const PREFERENCES = { theme: 'dark', accentColor: '#e8a849', defaultApp: '', dateFormat: 'US', timeFormat: '12h', startOfWeek: 'sunday' };

function baseUserStore(overrides = {}) {
  return {
    identity: IDENTITY,
    profile: PROFILE,
    preferences: PREFERENCES,
    appPreferences: {},
    loaded: true,
    loading: false,
    error: null,
    bootstrap: vi.fn().mockResolvedValue({}),
    updateProfile: vi.fn().mockResolvedValue({}),
    updatePreferences: vi.fn().mockResolvedValue({}),
    updateAppPreferences: vi.fn().mockResolvedValue({}),
    ...overrides,
  };
}

describe('AccountPage', () => {
  beforeEach(() => {
    notify.mockReset();
    useThemeMode.mockReturnValue({ themePreference: 'auto', setThemePreference: vi.fn() });
  });

  it('shows a loading spinner and nothing else until the store has loaded', () => {
    useUser.mockReturnValue(baseUserStore({ loaded: false }));
    const { container } = renderWithProviders(<AccountPage />);
    expect(container.querySelector('.MuiCircularProgress-root')).toBeInTheDocument();
    expect(screen.queryByLabelText('Display name')).not.toBeInTheDocument();
  });

  it('renders identity and profile fields from the mocked store once loaded', () => {
    useUser.mockReturnValue(baseUserStore());
    renderWithProviders(<AccountPage />);
    expect(screen.getByDisplayValue('Chef')).toBeInTheDocument();
    expect(screen.getByDisplayValue('chef')).toBeInTheDocument();
    expect(screen.getByDisplayValue('chef@clintgeek.com')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Builds fires.')).toBeInTheDocument();
  });

  // Going-over 2026-09-05 — this row read `prefsForm.locale`, and `locale`
  // lives on the *profile*, not on preferences. `prefsForm` is never given one,
  // so the Locale line on the avatar card has rendered blank for every user
  // since it shipped. (The tests added on 2026-09-05 caught it and left it;
  // this pass fixed it.)
  it('the avatar card fills in the Locale row from the profile', () => {
    useUser.mockReturnValue(baseUserStore());
    const { container } = renderWithProviders(<AccountPage />);

    const rows = [...container.querySelectorAll('p')].map((el) => el.textContent);
    const localeIndex = rows.indexOf('Locale');
    expect(localeIndex).toBeGreaterThan(-1);
    expect(rows[localeIndex + 1]).toBe('en-US');
  });

  it('the avatar card shows the theme actually in effect', () => {
    useUser.mockReturnValue(baseUserStore());
    const { container } = renderWithProviders(<AccountPage />);

    const rows = [...container.querySelectorAll('p')].map((el) => el.textContent);
    const themeIndex = rows.indexOf('Theme');
    expect(themeIndex).toBeGreaterThan(-1);
    expect(rows[themeIndex + 1]).toBe('dark');
  });

  it('shows the "No app-specific preferences yet" empty state when appPreferences is empty', () => {
    useUser.mockReturnValue(baseUserStore());
    renderWithProviders(<AccountPage />);
    expect(screen.getByText('No app-specific preferences yet')).toBeInTheDocument();
  });

  it('renders app-specific preference chips when appPreferences has entries', () => {
    useUser.mockReturnValue(baseUserStore({ appPreferences: { fitnessgeek: { units: 'metric' } } }));
    renderWithProviders(<AccountPage />);
    expect(screen.getByText('fitnessgeek')).toBeInTheDocument();
    expect(screen.getByText('units: metric')).toBeInTheDocument();
  });

  it('calling bootstrap on mount when the store has not loaded', () => {
    const bootstrap = vi.fn().mockResolvedValue({});
    useUser.mockReturnValue(baseUserStore({ loaded: false, bootstrap }));
    renderWithProviders(<AccountPage />);
    expect(bootstrap).toHaveBeenCalledTimes(1);
  });

  it('surfaces the store\'s own bootstrap error through notify', () => {
    useUser.mockReturnValue(baseUserStore({ error: 'Could not reach basegeek' }));
    renderWithProviders(<AccountPage />);
    expect(notify).toHaveBeenCalledWith('Could not reach basegeek', { tone: 'error' });
  });

  it('a successful profile save calls updateProfile and notifies success', async () => {
    const updateProfile = vi.fn().mockResolvedValue({});
    useUser.mockReturnValue(baseUserStore({ updateProfile }));
    renderWithProviders(<AccountPage />);

    const user = userEvent.setup();
    await user.clear(screen.getByLabelText('Bio'));
    await user.type(screen.getByLabelText('Bio'), 'New bio');
    // Two "Save" buttons render (profile + prefs sections) — the first is Identity & Profile's.
    await user.click(screen.getAllByRole('button', { name: /save/i })[0]);

    await waitFor(() => expect(updateProfile).toHaveBeenCalled());
    expect(notify).toHaveBeenCalledWith('Profile saved', { tone: 'success' });
  });

  it('a failed profile save surfaces the server message through notify, tone error', async () => {
    const updateProfile = vi.fn().mockRejectedValue({ response: { data: { message: 'Username taken' } } });
    useUser.mockReturnValue(baseUserStore({ updateProfile }));
    renderWithProviders(<AccountPage />);

    const user = userEvent.setup();
    await user.click(screen.getAllByRole('button', { name: /save/i })[0]);

    await waitFor(() => expect(notify).toHaveBeenCalledWith('Username taken', { tone: 'error' }));
  });

  it('a failed profile save with no server message falls back to a generic message', async () => {
    const updateProfile = vi.fn().mockRejectedValue(new Error('network down'));
    useUser.mockReturnValue(baseUserStore({ updateProfile }));
    renderWithProviders(<AccountPage />);

    const user = userEvent.setup();
    await user.click(screen.getAllByRole('button', { name: /save/i })[0]);

    await waitFor(() => expect(notify).toHaveBeenCalledWith('Failed to save profile', { tone: 'error' }));
  });

  it('a successful preferences save calls updatePreferences and notifies success', async () => {
    const updatePreferences = vi.fn().mockResolvedValue({});
    useUser.mockReturnValue(baseUserStore({ updatePreferences }));
    renderWithProviders(<AccountPage />);

    const user = userEvent.setup();
    // The Global Preferences section's Save button.
    await user.click(screen.getAllByRole('button', { name: /save/i })[1]);

    await waitFor(() => expect(updatePreferences).toHaveBeenCalled());
    expect(notify).toHaveBeenCalledWith('Preferences saved', { tone: 'success' });
  });

  it('a failed preferences save surfaces the server message through notify, tone error', async () => {
    const updatePreferences = vi.fn().mockRejectedValue({ response: { data: { message: 'Bad timezone' } } });
    useUser.mockReturnValue(baseUserStore({ updatePreferences }));
    renderWithProviders(<AccountPage />);

    const user = userEvent.setup();
    await user.click(screen.getAllByRole('button', { name: /save/i })[1]);

    await waitFor(() => expect(notify).toHaveBeenCalledWith('Bad timezone', { tone: 'error' }));
  });

  it('reflects the stored theme preference and accent color in the avatar card', () => {
    useUser.mockReturnValue(baseUserStore());
    renderWithProviders(<AccountPage />);
    expect(screen.getByText('dark')).toBeInTheDocument();
    expect(screen.getByText('#e8a849')).toBeInTheDocument();
  });
});
