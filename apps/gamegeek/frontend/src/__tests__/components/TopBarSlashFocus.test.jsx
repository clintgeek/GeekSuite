/**
 * `/` on the library lands in the library search (suite slash focus,
 * @geeksuite/ui, priority 20 from TopBar). Desktop layout: jsdom's matchMedia
 * never matches, so `isMobile` is false and the field sits in the search slot.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { SlashFocusProvider } from '@geeksuite/ui';
import TopBar from '../../components/TopBar';
import { renderWithProviders } from '../testUtils';

vi.mock('@geeksuite/user', () => ({
  useThemeMode: () => ({ theme: 'dark', toggleTheme: () => {} }),
}));

describe('library search slash focus', () => {
  it('"/" focuses "Search your games"', () => {
    renderWithProviders(
      <SlashFocusProvider>
        <TopBar user={{ username: 'chef' }} onSignOut={() => {}} />
      </SlashFocusProvider>
    );
    fireEvent.keyDown(document.body, { key: '/' });
    expect(screen.getByRole('searchbox', { name: 'Search your games' })).toHaveFocus();
  });
});
