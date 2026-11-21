/**
 * Phone search (review 2026-11-18 #7): Back is at the far left, before the
 * field — not between the field's ✕ and the app grid — and the app grid and
 * avatar step aside while the field is open.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { GeekShellContext } from '@geeksuite/ui';
import TopBar from '../../components/TopBar';
import { renderWithProviders } from '../testUtils';

vi.mock('@geeksuite/user', () => ({
  useThemeMode: () => ({ theme: 'dark', toggleTheme: () => {} }),
}));

let original;
beforeEach(() => {
  original = window.matchMedia;
  // A phone: every `down('md')` query matches.
  window.matchMedia = (query) => ({
    matches: true, media: query, onchange: null,
    addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
  });
});
afterEach(() => {
  window.matchMedia = original;
});

describe('phone search', { timeout: 30000 }, () => {
  it('puts Back on the left of the field', () => {
    const shell = { isMobile: true, mobileOpen: false, hasNav: true, bottomInset: 0, leftInset: 0, openNav: () => {}, closeNav: () => {}, toggleNav: () => {} };
    renderWithProviders(
      <GeekShellContext.Provider value={shell}>
        <TopBar user={{ username: 'chef' }} onSignOut={() => {}} />
      </GeekShellContext.Provider>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Search games' }));
    const back = screen.getByRole('button', { name: 'Close search' });
    const field = screen.getByRole('searchbox', { name: 'Search your games' });
    // Back comes first in the bar.
    expect(back.compareDocumentPosition(field) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(back);
    expect(screen.queryByRole('searchbox', { name: 'Search your games' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Search games' })).toBeInTheDocument();
  });

  it('closing search hands focus back to "Search games" (Back and Escape)', () => {
    const shell = { isMobile: true, mobileOpen: false, hasNav: true, bottomInset: 0, leftInset: 0, openNav: () => {}, closeNav: () => {}, toggleNav: () => {} };
    renderWithProviders(
      <GeekShellContext.Provider value={shell}>
        <TopBar user={{ username: 'chef' }} onSignOut={() => {}} />
      </GeekShellContext.Provider>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Search games' }));
    const back = screen.getByRole('button', { name: 'Close search' });
    back.focus();
    fireEvent.click(back);
    expect(screen.getByRole('button', { name: 'Search games' })).toHaveFocus();

    fireEvent.click(screen.getByRole('button', { name: 'Search games' }));
    fireEvent.keyDown(screen.getByRole('searchbox', { name: 'Search your games' }), { key: 'Escape' });
    expect(screen.getByRole('button', { name: 'Search games' })).toHaveFocus();
  });
});
