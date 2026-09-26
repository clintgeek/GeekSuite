import React from 'react';
import { render } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { MemoryRouter } from 'react-router-dom';
import { InMemoryCache } from '@apollo/client';
import { MockedProvider } from '@apollo/client/testing';
import { GeekToastProvider } from '@geeksuite/ui';
import { CollectionProvider } from '@geeksuite/collection';
import { createThingTheme } from '../theme/theme';
import { THING_COLLECTION } from '../utils/collectionConfig';
import { THING_TYPE_POLICIES } from '../graphql/cachePolicies';

export const makeCache = () => new InMemoryCache({ typePolicies: THING_TYPE_POLICIES });

/**
 * Theme + router + collection wording + real toasts, optionally Apollo
 * (`mocks` given → MockedProvider over a cache with ThingGeek's policies).
 */
export function renderWithProviders(ui, { initialEntries = ['/'], mode = 'light', mocks, wrapper: Extra, ...options } = {}) {
  const theme = createThingTheme(mode);
  function Providers({ children }) {
    let inner = (
      <ThemeProvider theme={theme}>
        <MemoryRouter initialEntries={initialEntries} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <CollectionProvider value={THING_COLLECTION}>
            <GeekToastProvider>{Extra ? <Extra>{children}</Extra> : children}</GeekToastProvider>
          </CollectionProvider>
        </MemoryRouter>
      </ThemeProvider>
    );
    if (mocks) {
      inner = (
        <MockedProvider mocks={mocks} cache={makeCache()}>
          {inner}
        </MockedProvider>
      );
    }
    return inner;
  }
  return render(ui, { wrapper: Providers, ...options });
}
