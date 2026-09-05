import { describe, it, expect, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SettingsView from '../../views/SettingsView';
import { SHELVES } from '../fixtures';
import { renderWithProviders } from '../testUtils';

const user = { id: 'u1', username: 'chef', email: 'chef@example.com' };

function baseProps(overrides = {}) {
  return {
    aiStatus: null,
    aiStatusError: null,
    aiStatusLoading: false,
    authError: null,
    authLoading: false,
    calibreRescanError: null,
    calibreRescanLoading: false,
    calibreRescanSummary: null,
    customShelves: [],
    defaultShelfPref: 'all',
    deviceWordInput: 'mustang',
    goodreadsDedupeError: null,
    goodreadsDedupeLoading: false,
    goodreadsDedupeSummary: null,
    goodreadsFile: null,
    goodreadsImportError: null,
    goodreadsImportLoading: false,
    goodreadsImportSummary: null,
    handleAddCustomShelf: vi.fn((e) => e.preventDefault()),
    handleCalibreRescan: vi.fn(),
    handleCheckAiStatus: vi.fn(),
    handleDeleteCustomShelf: vi.fn(),
    handleGoodreadsDedupe: vi.fn(),
    handleGoodreadsFileChange: vi.fn(),
    handleGoodreadsImport: vi.fn(),
    handleLogout: vi.fn(),
    handleSaveDefaultShelf: vi.fn(),
    handleSaveProfile: vi.fn((e) => e.preventDefault()),
    kindleEmailInput: 'chef@kindle.com',
    newShelfLabel: '',
    prefSaveError: null,
    prefSaveLoading: false,
    prefSaveMessage: null,
    profileError: null,
    profileLoading: false,
    profileMessage: null,
    setActiveView: vi.fn(),
    setAuthError: vi.fn(),
    setAuthLoading: vi.fn(),
    setDefaultShelfPref: vi.fn(),
    setDeviceWordInput: vi.fn(),
    setKindleEmailInput: vi.fn(),
    setNewShelfLabel: vi.fn(),
    setShelfFilter: vi.fn(),
    shelfEditError: null,
    shelfEditLoading: false,
    shelves: SHELVES,
    user,
    ...overrides,
  };
}

describe('SettingsView', () => {
  it('prompts sign-in with no user', () => {
    renderWithProviders(<SettingsView {...baseProps({ user: null })} />);
    expect(screen.getByText('Sign in to manage your account')).toBeInTheDocument();
  });

  it('the default-shelf select includes "All books"', async () => {
    const user2 = userEvent.setup();
    renderWithProviders(<SettingsView {...baseProps()} />);
    await user2.click(screen.getByLabelText('Default shelf'));
    const listbox = await screen.findByRole('listbox');
    expect(within(listbox).getByText('All books')).toBeInTheDocument();
    // And every other shelf is there too, not just "all".
    expect(within(listbox).getByText('Reading')).toBeInTheDocument();
  });

  it('"Save" under Send to device submits the profile form', async () => {
    const userEv = userEvent.setup();
    const handleSaveProfile = vi.fn((e) => e.preventDefault());
    renderWithProviders(<SettingsView {...baseProps({ handleSaveProfile })} />);
    const form = document.getElementById('settings-send-to-device-form');
    const saveButton = within(form).getByRole('button', { name: 'Save' });
    await userEv.click(saveButton);
    expect(handleSaveProfile).toHaveBeenCalledTimes(1);
  });

  it('"Save" under Default shelf calls handleSaveDefaultShelf', async () => {
    const userEv = userEvent.setup();
    const handleSaveDefaultShelf = vi.fn();
    renderWithProviders(<SettingsView {...baseProps({ handleSaveDefaultShelf })} />);
    // Two "Save" buttons exist (send-to-device form, default shelf) — scope to
    // the default-shelf section by its preceding label text.
    const buttons = screen.getAllByRole('button', { name: 'Save' });
    await userEv.click(buttons[1]);
    expect(handleSaveDefaultShelf).toHaveBeenCalledTimes(1);
  });

  it('"Add" submits the new-shelf form', async () => {
    const userEv = userEvent.setup();
    const handleAddCustomShelf = vi.fn((e) => e.preventDefault());
    renderWithProviders(
      <SettingsView {...baseProps({ handleAddCustomShelf, newShelfLabel: 'Comfort reads' })} />
    );
    const form = document.getElementById('settings-add-shelf-form');
    await userEv.click(within(form).getByRole('button', { name: 'Add' }));
    expect(handleAddCustomShelf).toHaveBeenCalledTimes(1);
  });

  it('"Check" fires the AI status handler', async () => {
    const userEv = userEvent.setup();
    const handleCheckAiStatus = vi.fn();
    renderWithProviders(<SettingsView {...baseProps({ handleCheckAiStatus })} />);
    await userEv.click(screen.getByRole('button', { name: 'Check' }));
    expect(handleCheckAiStatus).toHaveBeenCalledTimes(1);
  });
});
