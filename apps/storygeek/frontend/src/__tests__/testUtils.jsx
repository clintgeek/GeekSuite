/* eslint-disable react-refresh/only-export-components -- test harness, not a component module */
/**
 * Shared test harness (mirrors apps/notegeek/frontend/src/__tests__/testUtils.jsx).
 *
 * Tests render under the *real* StoryGeek theme (`createStoryTheme`), not a
 * bare `createTheme()` — the codex palette (`theme.palette.codex.gold`), the
 * `glow` tokens and the Cinzel/Crimson Pro font stacks are read directly by
 * Narration, CodexDialog and every panel, so a plain theme would hide bugs in
 * those custom tokens the moment a component reads one.
 *
 * storygeek's data layer is a plain axios instance (`src/api.js`), not
 * Apollo/GraphQL, so no MockedProvider is needed here — tests mock `../api`
 * (or `../../api`, depending on depth) directly with `vi.mock`.
 */
import React from 'react';
import { render } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { MemoryRouter } from 'react-router-dom';
import { createStoryTheme } from '../theme/theme';

export const lightTheme = createStoryTheme('light');
export const darkTheme = createStoryTheme('dark');

/** Wrap children in the app theme (+ a router by default, since most pages/components use Link/useNavigate/useParams). */
export function AppProviders({ children, mode = 'light', route = '/', router = true }) {
  const theme = mode === 'dark' ? darkTheme : lightTheme;
  const content = router ? (
    <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
  ) : (
    children
  );
  return <ThemeProvider theme={theme}>{content}</ThemeProvider>;
}

/** render() with the app theme + router already applied. */
export function renderWithProviders(ui, { mode, route, router, ...options } = {}) {
  return render(ui, {
    wrapper: ({ children }) => (
      <AppProviders mode={mode} route={route} router={router}>
        {children}
      </AppProviders>
    ),
    ...options,
  });
}
