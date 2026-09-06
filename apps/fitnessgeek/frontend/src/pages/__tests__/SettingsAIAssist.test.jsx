/**
 * The AI Assist card on Settings, after R124 moved the natural-language
 * quick-add opt-in off localStorage and onto the settings document.
 *
 * What is pinned here is the product rule, not the markup: the switch reflects
 * and writes `ai.features.natural_language_food_logging` on the server, it is
 * OFF for a user who has never touched it, an R115 per-browser opt-in is
 * carried across exactly once, and a failed write leaves the switch telling
 * the truth rather than claiming a setting that was never saved.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QUICK_ADD_NL_KEY } from '../../utils/quickAddPreference.js';
import Settings from '../Settings.jsx';

const getSettings = vi.fn();
const updateAISettings = vi.fn();
const updateSettings = vi.fn();

vi.mock('../../services/settingsService.js', () => ({
  settingsService: {
    getSettings: (...a) => getSettings(...a),
    updateAISettings: (...a) => updateAISettings(...a),
    updateSettings: (...a) => updateSettings(...a),
    getDefaultDashboardSettings: () => ({}),
    getDefaultGarminSettings: () => ({ enabled: false, username: '', password: '' }),
  },
}));

// The household card owns its own network calls and none of them are the
// subject here.
vi.mock('../../components/Settings/HouseholdSettings', () => ({
  default: () => null,
}));

vi.mock('@geeksuite/user', () => ({
  useThemeMode: () => ({ themePreference: 'light', setThemePreference: vi.fn() }),
}));

const settingsWith = (ai) => ({
  data: {
    theme: 'light',
    notifications: { enabled: true, daily_reminder: true, goal_reminders: true },
    units: { weight: 'lbs', height: 'ft' },
    garmin: { enabled: false, username: '' },
    ...(ai ? { ai } : {}),
  },
});

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  updateAISettings.mockResolvedValue({});
});

const theSwitch = () => screen.getByRole('checkbox', { name: 'Natural-language quick-add' });

const renderSettings = async () => {
  render(<Settings />);
  await waitFor(() => expect(screen.getByText('AI Assist')).toBeInTheDocument());
};

describe('the natural-language quick-add switch', () => {
  it('is OFF for a document that has never carried the flag', async () => {
    getSettings.mockResolvedValue(settingsWith(null));
    await renderSettings();

    expect(theSwitch()).not.toBeChecked();
    expect(updateAISettings).not.toHaveBeenCalled();
  });

  it('reflects a server-side opt-in without writing anything', async () => {
    getSettings.mockResolvedValue(
      settingsWith({ enabled: true, features: { natural_language_food_logging: true } })
    );
    await renderSettings();

    expect(theSwitch()).toBeChecked();
    expect(updateAISettings).not.toHaveBeenCalled();
  });

  it('writes the flag through PUT /settings/ai when flipped on', async () => {
    getSettings.mockResolvedValue(
      settingsWith({ enabled: true, features: { natural_language_food_logging: false } })
    );
    await renderSettings();

    await userEvent.click(theSwitch());

    await waitFor(() =>
      expect(updateAISettings).toHaveBeenCalledWith({
        features: { natural_language_food_logging: true },
      })
    );
    expect(theSwitch()).toBeChecked();
    // The single-field write, not the whole-document Save bar.
    expect(updateSettings).not.toHaveBeenCalled();
  });

  it('writes false when flipped back off', async () => {
    getSettings.mockResolvedValue(
      settingsWith({ enabled: true, features: { natural_language_food_logging: true } })
    );
    await renderSettings();

    await userEvent.click(theSwitch());

    await waitFor(() =>
      expect(updateAISettings).toHaveBeenCalledWith({
        features: { natural_language_food_logging: false },
      })
    );
    expect(theSwitch()).not.toBeChecked();
  });

  it('reverts the switch when the write fails — it must not claim a setting that was not saved', async () => {
    getSettings.mockResolvedValue(
      settingsWith({ enabled: true, features: { natural_language_food_logging: false } })
    );
    updateAISettings.mockRejectedValue(new Error('offline'));
    await renderSettings();

    await userEvent.click(theSwitch());

    await waitFor(() => expect(theSwitch()).not.toBeChecked());
  });
});

describe('the R115 → R124 migration', () => {
  it('carries a per-browser opt-in onto the document once and drops the key', async () => {
    window.localStorage.setItem(QUICK_ADD_NL_KEY, 'true');
    getSettings.mockResolvedValue(
      settingsWith({ enabled: true, features: { natural_language_food_logging: false } })
    );

    await renderSettings();

    await waitFor(() =>
      expect(updateAISettings).toHaveBeenCalledWith({
        features: { natural_language_food_logging: true },
      })
    );
    expect(theSwitch()).toBeChecked();
    expect(window.localStorage.getItem(QUICK_ADD_NL_KEY)).toBeNull();
  });

  it('does not migrate for a user who never opted in', async () => {
    window.localStorage.setItem(QUICK_ADD_NL_KEY, 'false');
    getSettings.mockResolvedValue(settingsWith(null));

    await renderSettings();

    expect(updateAISettings).not.toHaveBeenCalled();
    expect(theSwitch()).not.toBeChecked();
    expect(window.localStorage.getItem(QUICK_ADD_NL_KEY)).toBeNull();
  });
});
