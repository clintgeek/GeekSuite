/**
 * Shared test harness.
 *
 * Tests must render under the *real* NoteGeek theme. Wrapping components in a
 * bare `createTheme()` hides bugs in the custom tokens (noteTypes, glow,
 * surfaces, border) and previously caused mass failures the moment a
 * component read one of them.
 *
 * `createNoteTheme` is used directly rather than ThemeModeProvider so the
 * harness stays synchronous and free of the @geeksuite/user cookie/preference
 * plumbing that most component tests don't care about.
 */
import React from 'react';
import { render } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { MemoryRouter } from 'react-router-dom';
import { MockedProvider } from '@apollo/client/testing';
import { createNoteTheme } from '../theme/createAppTheme';

export const lightTheme = createNoteTheme('light');
export const darkTheme = createNoteTheme('dark');

/**
 * Wrap children in the app theme (+ a router by default, since most
 * components use Link/useNavigate).  An Apollo MockedProvider is included
 * so any component using `useQuery` / `useMutation` doesn't throw
 * "No Apollo client found" — pass `mocks` to supply responses.
 */
export function AppProviders({ children, mode = 'light', route = '/', router = true, mocks = [] }) {
  const theme = mode === 'dark' ? darkTheme : lightTheme;
  const content = router ? (
    <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
  ) : (
    children
  );
  return (
    <ThemeProvider theme={theme}>
      <MockedProvider mocks={mocks} addTypename={false}>
        {content}
      </MockedProvider>
    </ThemeProvider>
  );
}

/** render() with the app theme + router + Apollo already applied. */
export function renderWithProviders(ui, { mode, route, router, mocks, ...options } = {}) {
  return render(ui, {
    wrapper: ({ children }) => (
      <AppProviders mode={mode} route={route} router={router} mocks={mocks}>
        {children}
      </AppProviders>
    ),
    ...options,
  });
}
