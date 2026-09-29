/**
 * `/` on the library lands in the library search (priority 20), and focusing
 * the field shows the search-token helper. jsdom's matchMedia never matches,
 * so the desktop layout (search in the top bar's slot) renders.
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, act, within } from '@testing-library/react';
import { GeekShellContext, SlashFocusProvider } from '@geeksuite/ui';
import TopBar from '../../components/TopBar';
import { mockViewport, renderWithProviders } from '../testUtils';

vi.mock('@geeksuite/user', () => ({
  useThemeMode: () => ({ theme: 'light', toggleTheme: () => {} }),
}));

describe('library search', () => {
  it('"/" focuses "Search your things" and the token hint appears', async () => {
    renderWithProviders(
      <SlashFocusProvider>
        <TopBar user={{ username: 'chef' }} onSignOut={() => {}} />
      </SlashFocusProvider>
    );
    expect(screen.queryByTestId('search-hint')).toBeNull();
    await act(async () => {
      fireEvent.keyDown(document.body, { key: '/' });
    });
    const box = screen.getByRole('searchbox', { name: 'Search your things' });
    expect(box).toHaveFocus();
    const hint = await screen.findByTestId('search-hint');
    expect(hint).toHaveTextContent('type:boat');
    expect(hint).toHaveTextContent('missing:receipt');
    // The same grammar is the field's accessible description.
    expect(box).toHaveAccessibleDescription(/type:boat tag:fishing in:garage missing:receipt/);
  });

  it('is not on other pages', () => {
    renderWithProviders(<TopBar user={{ username: 'chef' }} onSignOut={() => {}} />, { initialEntries: ['/places'] });
    expect(screen.queryByRole('searchbox')).toBeNull();
  });
});

// A shell that owns a nav panel: GeekTopBar's default would draw a hamburger here.
const PhoneShell = ({ children }) => (
  <GeekShellContext.Provider value={{ isMobile: true, mobileOpen: false, hasNav: true, bottomInset: 56, openNav() {}, closeNav() {}, toggleNav() {} }}>{children}</GeekShellContext.Provider>
);

describe('on a phone', () => {
  it('there is no hamburger: the tab bar is the navigation', () => {
    const restore = mockViewport(390);
    try {
      renderWithProviders(<TopBar user={{ username: 'chef' }} onSignOut={() => {}} />, { initialEntries: ['/'], wrapper: PhoneShell });
      expect(screen.queryByRole('button', { name: 'Open navigation' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
      // Add is the middle tab on a phone, not a top-bar button.
      expect(screen.queryByRole('button', { name: 'Add a thing' })).toBeNull();
    } finally {
      restore();
    }
  });

  it('a thing is a sub-page: a back arrow, where the menu used to be', () => {
    const restore = mockViewport(390);
    try {
      renderWithProviders(<TopBar user={{ username: 'chef' }} onSignOut={() => {}} />, { initialEntries: ['/thing/t-wendy'], wrapper: PhoneShell });
      expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Open navigation' })).toBeNull();
    } finally {
      restore();
    }
  });
});

describe('the avatar menu', () => {
  it('holds the account only: Settings lives in the sidebar (desktop) or More (phone)', () => {
    renderWithProviders(<TopBar user={{ username: 'chef' }} onSignOut={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Account' }));
    const menu = screen.getByRole('menu');
    expect(within(menu).queryByRole('menuitem', { name: 'Settings' })).toBeNull();
    expect(within(menu).getByRole('menuitem', { name: 'Sign out' })).toBeInTheDocument();
  });
});
