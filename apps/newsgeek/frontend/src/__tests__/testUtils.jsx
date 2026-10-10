import React from 'react';
import { render } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { InMemoryCache } from '@apollo/client';
import { MockedProvider } from '@apollo/client/testing';
import { GeekToastProvider } from '@geeksuite/ui';
import { createNewsTheme } from '../theme/theme';
import { NEWS_TYPE_POLICIES } from '../graphql/cachePolicies';

export const makeCache = () => new InMemoryCache({ typePolicies: NEWS_TYPE_POLICIES });

/**
 * Theme + router + toasts + Apollo's MockedProvider over a cache with
 * NewsGeek's policies. `path` mounts the UI on a route pattern (for useParams).
 */
export function renderWithProviders(ui, { initialEntries = ['/'], path, mode = 'light', mocks = [], ...options } = {}) {
  const theme = createNewsTheme(mode);
  const routed = path ? (
    <Routes>
      <Route path={path} element={ui} />
    </Routes>
  ) : (
    ui
  );
  return render(
    <MockedProvider mocks={mocks} cache={makeCache()}>
      <ThemeProvider theme={theme}>
        <MemoryRouter initialEntries={initialEntries} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <GeekToastProvider>{routed}</GeekToastProvider>
        </MemoryRouter>
      </ThemeProvider>
    </MockedProvider>,
    options
  );
}
