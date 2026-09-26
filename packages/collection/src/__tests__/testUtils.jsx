import React from 'react';
import { render } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { MemoryRouter } from 'react-router-dom';
import { GeekToastProvider } from '@geeksuite/ui';
import { CollectionProvider } from '../config';

export const BOOKS = { noun: { one: 'book', many: 'books' } };
const theme = createTheme();

/** A plain MUI theme, a router, the toast provider and a books CollectionProvider. */
export function renderUi(ui, { initialEntries = ['/'], config = BOOKS, wrapper: Extra } = {}) {
  function Providers({ children }) {
    const inner = (
      <ThemeProvider theme={theme}>
        <MemoryRouter initialEntries={initialEntries}>
          <CollectionProvider value={config}>
            <GeekToastProvider>{children}</GeekToastProvider>
          </CollectionProvider>
        </MemoryRouter>
      </ThemeProvider>
    );
    return Extra ? <Extra>{inner}</Extra> : inner;
  }
  return render(ui, { wrapper: Providers });
}
