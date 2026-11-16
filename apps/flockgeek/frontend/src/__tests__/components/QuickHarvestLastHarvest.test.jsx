// SUITE_REVIEW_2026-11, FlockGeek 1: the harvest sheet fetched EVERY egg
// record ever logged (GET_EGG_PRODUCTIONS with no window) to find one row.
// It must ask the gateway's bounded `lastEggProduction` for the selected
// location instead, and never load the whole log.

import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { MockedProvider } from '@apollo/client/testing';
import QuickHarvestEntry from '../../components/QuickHarvestEntry';
import { renderWithProviders } from '../testUtils';
import { GET_LAST_EGG_PRODUCTION } from '../../graphql/queries';

const COOP = { id: 'loc-coop', name: 'Main coop' };

describe('QuickHarvestEntry — last harvest', () => {
  it('reads only the last harvest for the location and prefills from it', async () => {
    const mocks = [
      {
        request: { query: GET_LAST_EGG_PRODUCTION, variables: { locationId: COOP.id } },
        result: {
          data: {
            lastEggProduction: { id: 'e9', date: '2020-01-01T00:00:00.000Z', eggsCount: 7, locationId: COOP.id },
          },
        },
      },
    ];
    renderWithProviders(
      <MockedProvider mocks={mocks}>
        <QuickHarvestEntry locations={[COOP]} />
      </MockedProvider>
    );
    expect(await screen.findByText(/Last harvest: .* 7 eggs/)).toBeInTheDocument();
    // Only GetLastEggProduction is mocked: MockedProvider answers any other
    // operation (the old full-log GetEggProductions) with an error, so the
    // chip appearing means the bounded query is the one the sheet used.
  });
});
