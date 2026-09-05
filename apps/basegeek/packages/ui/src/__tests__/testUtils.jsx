/* eslint-disable react-refresh/only-export-components -- test harness, not a component module */
import React from 'react';
import { render } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { MemoryRouter } from 'react-router-dom';
import { GeekToastProvider } from '@geeksuite/ui';
import { createBaseGeekTheme } from '../theme';

export const theme = createBaseGeekTheme('dark');

function AllProviders({ children, initialEntries }) {
  return (
    <ThemeProvider theme={theme}>
      <MemoryRouter initialEntries={initialEntries}>
        <GeekToastProvider>{children}</GeekToastProvider>
      </MemoryRouter>
    </ThemeProvider>
  );
}

/** Renders `ui` inside the baseGeek "Mission Control" theme, a MemoryRouter
 * and a `GeekToastProvider` — the same trio every real console page sits
 * under (Layout.jsx mounts `GeekToastProvider` inside `GeekShell`). */
export function renderWithProviders(ui, { initialEntries = ['/'], ...options } = {}) {
  return render(ui, {
    wrapper: (props) => <AllProviders {...props} initialEntries={initialEntries} />,
    ...options,
  });
}

/**
 * Forces every `window.matchMedia` query to report `matches: matches` — used
 * to pin MUI's `useMediaQuery` (ResponsiveTable's mobile check, the AIGeek
 * tabs' `isCompact`) to a known "mobile" or "desktop" result instead of
 * jsdom's real (non-)viewport. Returns a restore function.
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
