/**
 * `/` on the library lands in the library search (priority 20), and focusing
 * the field shows the search-token helper. jsdom's matchMedia never matches,
 * so the desktop layout (search in the top bar's slot) renders.
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, act } from '@testing-library/react';
import { SlashFocusProvider } from '@geeksuite/ui';
import TopBar from '../../components/TopBar';
import { renderWithProviders } from '../testUtils';

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
