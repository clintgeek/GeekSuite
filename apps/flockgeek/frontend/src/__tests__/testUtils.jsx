import React from 'react';
import { render } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { MemoryRouter } from 'react-router-dom';
import { createFlockTheme } from '../theme/theme';

export const theme = createFlockTheme('dark');

function AllProviders({ children, initialEntries }) {
  return (
    <ThemeProvider theme={theme}>
      <MemoryRouter initialEntries={initialEntries}>{children}</MemoryRouter>
    </ThemeProvider>
  );
}

/** Renders `ui` inside the FlockGeek "Field Ledger" theme and a MemoryRouter —
 * the same pair every real render goes through (App.jsx sits under both). */
export function renderWithProviders(ui, { initialEntries = ['/'], ...options } = {}) {
  return render(ui, {
    wrapper: (props) => <AllProviders {...props} initialEntries={initialEntries} />,
    ...options,
  });
}

/**
 * Forces every `window.matchMedia` query to report `matches: matches` — used
 * to pin MUI's `useMediaQuery` (ResponsiveTable's and QuickHarvestSheet's own
 * mobile checks, `GeekSheet`'s and `GeekDialog`'s `mode="auto"` breakpoint) to
 * a known "mobile" or "desktop" result instead of jsdom's real (non-)viewport.
 * Returns a restore function.
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
