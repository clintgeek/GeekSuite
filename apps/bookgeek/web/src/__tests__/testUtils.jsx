import React from 'react';
import { render } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { MemoryRouter } from 'react-router-dom';
import { GeekToastProvider } from '@geeksuite/ui';
import { createBookTheme } from '../theme/theme';

export const theme = createBookTheme('dark');

function AllProviders({ children, initialEntries }) {
  return (
    <ThemeProvider theme={theme}>
      <MemoryRouter initialEntries={initialEntries}>
        <GeekToastProvider>{children}</GeekToastProvider>
      </MemoryRouter>
    </ThemeProvider>
  );
}

/** Renders `ui` inside the BookGeek dark theme, a MemoryRouter and a
 * `GeekToastProvider` — the same trio every real render goes through
 * (App.jsx sits under all three; TODO_ORDER #15's `useToast()` call sites
 * need a real provider, not the no-op fallback, to exercise `notify()`). */
export function renderWithProviders(ui, { initialEntries = ['/'], ...options } = {}) {
  return render(ui, {
    wrapper: (props) => <AllProviders {...props} initialEntries={initialEntries} />,
    ...options,
  });
}

/**
 * Forces every `window.matchMedia` query to report `matches: matches` — used
 * to pin MUI's `useMediaQuery` (BookGeek's own mobile check in `TopBar`,
 * `GeekSheet`'s `mode="auto"` breakpoint) to a known "mobile" or "desktop"
 * result instead of jsdom's real (non-)viewport. Returns a restore function.
 */
export function mockMatchMediaMatches(matches) {
  const original = window.matchMedia;
  window.matchMedia = (query) => ({
    matches,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
  return () => {
    window.matchMedia = original;
  };
}
