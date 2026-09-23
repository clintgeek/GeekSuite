/**
 * Settings used to render and persist three "Notifications" switches
 * ("Enable Notifications", "Daily Reminders", "Goal Reminders") that flipped
 * a boolean and did nothing else — no service worker push registration, no
 * scheduled job, nothing in the frontend or backend that could ever fire
 * one. Flipping them told the owner he'd be reminded; he never would be.
 * This test pins that the dead controls are gone rather than presented as
 * functional. It goes red on the pre-fix component (which renders all three
 * switches) and green once they're removed.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../../services/settingsService.js', () => ({
  settingsService: {
    getSettings: vi.fn(() =>
      Promise.resolve({
        data: {
          dashboard: {},
          theme: 'light',
          notifications: { enabled: true, daily_reminder: true, goal_reminders: true },
          units: { weight: 'lbs', height: 'ft' },
          garmin: { enabled: false, username: '' },
        },
      })
    ),
    getDefaultGarminSettings: () => ({ enabled: false, username: '' }),
    getDefaultDashboardSettings: () => ({}),
    updateSettings: vi.fn(() => Promise.resolve({})),
  },
}));

vi.mock('../../components/Settings/HouseholdSettings', () => ({
  default: () => null,
}));

vi.mock('@geeksuite/user', () => ({
  useThemeMode: () => ({ themePreference: 'light', setThemePreference: vi.fn() }),
}));

vi.mock('@geeksuite/ui', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useToast: () => ({ notify: vi.fn() }) };
});

const { settingsService } = await import('../../services/settingsService.js');
const { default: Settings } = await import('../Settings.jsx');

describe('Settings — Notifications section', () => {
  it('does not render notification toggles that nothing can ever fire', async () => {
    render(<Settings />);

    // Wait for the initial settings load to resolve and the page to render.
    await screen.findByText('Appearance');

    expect(screen.queryByText(/Enable Notifications/i)).toBeNull();
    expect(screen.queryByText(/Daily Reminders/i)).toBeNull();
    expect(screen.queryByText(/Goal Reminders/i)).toBeNull();
    // The section heading itself should be gone too, not just the switches.
    expect(screen.queryByText(/^Notifications$/i)).toBeNull();
  });
});

describe('Settings — Health alerts', () => {
  it('the sleep apnea suggestion defaults on, and turning it off is saved', async () => {
    render(<Settings />);
    const toggle = await screen.findByRole('checkbox', { name: /Sleep apnea screening suggestion/i });
    expect(toggle).toBeChecked(); // no stored value -> default on
    fireEvent.click(toggle);
    expect(toggle).not.toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: /Save/i }));
    await waitFor(() => expect(settingsService.updateSettings).toHaveBeenCalled());
    const payload = settingsService.updateSettings.mock.calls.at(-1)[0];
    expect(payload.health_alerts).toEqual({ sleep_apnea_screening: false });
  });
});

