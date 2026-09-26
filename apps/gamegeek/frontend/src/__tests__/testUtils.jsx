import React from 'react';
import { render } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { MemoryRouter } from 'react-router-dom';
import { GeekToastProvider } from '@geeksuite/ui';
import { CollectionProvider } from '@geeksuite/collection';
import { createGameTheme } from '../theme/theme';
import { GAME_COLLECTION } from '../utils/collectionConfig';

export const theme = createGameTheme('dark');

/** Theme + router + real toast provider (+ GameGeek's collection wording) — what every real render sits under. */
export function renderWithProviders(ui, { initialEntries = ['/'], wrapper: Extra, mode = 'dark', ...options } = {}) {
  const t = mode === 'dark' ? theme : createGameTheme(mode);
  function Providers({ children }) {
    const inner = (
      <ThemeProvider theme={t}>
        <MemoryRouter initialEntries={initialEntries}>
          <CollectionProvider value={GAME_COLLECTION}>
            <GeekToastProvider>{children}</GeekToastProvider>
          </CollectionProvider>
        </MemoryRouter>
      </ThemeProvider>
    );
    return Extra ? <Extra>{inner}</Extra> : inner;
  }
  return render(ui, { wrapper: Providers, ...options });
}
