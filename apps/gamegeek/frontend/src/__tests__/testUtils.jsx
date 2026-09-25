import React from 'react';
import { render } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { MemoryRouter } from 'react-router-dom';
import { GeekToastProvider } from '@geeksuite/ui';
import { createGameTheme } from '../theme/theme';

export const theme = createGameTheme('dark');

/** Theme + router + real toast provider — the trio every real render sits under. */
export function renderWithProviders(ui, { initialEntries = ['/'], wrapper: Extra, mode = 'dark', ...options } = {}) {
  const t = mode === 'dark' ? theme : createGameTheme(mode);
  function Providers({ children }) {
    const inner = (
      <ThemeProvider theme={t}>
        <MemoryRouter initialEntries={initialEntries}>
          <GeekToastProvider>{children}</GeekToastProvider>
        </MemoryRouter>
      </ThemeProvider>
    );
    return Extra ? <Extra>{inner}</Extra> : inner;
  }
  return render(ui, { wrapper: Providers, ...options });
}
