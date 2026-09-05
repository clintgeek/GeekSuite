import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GeekShellContext } from '@geeksuite/ui';
import TopBar from '../../components/TopBar';
import { renderWithProviders, mockMatchMediaMatches } from '../testUtils';

// GeekTopBar picks `actions` vs `mobileActions` off the *shell* context's
// `isMobile` (default false with no GeekShell around it), independent of
// TopBar's own `useMediaQuery` check (which only gates the search-field
// swap). Exercising the mobile search icon needs both forced to "mobile".
const MOBILE_SHELL = {
  isMobile: true,
  mobileOpen: false,
  hasNav: false,
  bottomInset: 0,
  openNav: () => {},
  closeNav: () => {},
  toggleNav: () => {},
};

function renderMobile(ui) {
  return renderWithProviders(
    <GeekShellContext.Provider value={MOBILE_SHELL}>{ui}</GeekShellContext.Provider>
  );
}

const user = { id: 'u1', username: 'chef', displayName: 'Chef Crocker', email: 'chef@example.com' };

function baseProps(overrides = {}) {
  return {
    user,
    activeView: 'library',
    setActiveView: vi.fn(),
    setAddBookOpen: vi.fn(),
    onSignOut: vi.fn(),
    searchQuery: '',
    setSearchQuery: vi.fn(),
    ...overrides,
  };
}

describe('TopBar', () => {
  let restoreMatchMedia;
  afterEach(() => {
    restoreMatchMedia?.();
    restoreMatchMedia = undefined;
  });

  it('shows the page title and the "Add book" action on desktop', () => {
    restoreMatchMedia = mockMatchMediaMatches(false);
    renderWithProviders(<TopBar {...baseProps()} />);
    expect(screen.getByText('Library')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Add book/i })).toBeInTheDocument();
  });

  it('opens the mobile search field on tap, without disturbing the query', async () => {
    restoreMatchMedia = mockMatchMediaMatches(true); // "mobile"
    const userEv = userEvent.setup();
    const setSearchQuery = vi.fn();
    renderMobile(<TopBar {...baseProps({ searchQuery: 'gravel', setSearchQuery })} />);

    // Title shows, search field not yet open.
    expect(screen.getByText('Library')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Search title / author / tag')).not.toBeInTheDocument();

    await userEv.click(screen.getByRole('button', { name: 'Search books' }));
    expect(screen.getByPlaceholderText('Search title / author / tag')).toHaveValue('gravel');
    expect(setSearchQuery).not.toHaveBeenCalled();

    // Closing (now labeled "Close search") keeps whatever was typed — the
    // toggle never clears the query itself.
    await userEv.click(screen.getByRole('button', { name: 'Close search' }));
    expect(screen.queryByPlaceholderText('Search title / author / tag')).not.toBeInTheDocument();
    expect(setSearchQuery).not.toHaveBeenCalled();
  });

  it('the ✕ inside the mobile field clears the query and keeps the field open', async () => {
    restoreMatchMedia = mockMatchMediaMatches(true);
    const userEv = userEvent.setup();
    const setSearchQuery = vi.fn();
    renderMobile(<TopBar {...baseProps({ searchQuery: 'gravel', setSearchQuery })} />);

    await userEv.click(screen.getByRole('button', { name: 'Search books' }));
    await userEv.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(setSearchQuery).toHaveBeenCalledWith('');
    // Still open — clearing is not the same gesture as closing.
    expect(screen.getByPlaceholderText('Search title / author / tag')).toBeInTheDocument();
  });
});
