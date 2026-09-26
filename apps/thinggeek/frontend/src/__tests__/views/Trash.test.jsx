import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import TrashView, { purgeText } from '../../views/TrashView';
import { RESTORE_THING } from '../../graphql/mutations';
import { GET_THINGS, GET_THING_VOCABULARY, GET_TRASHED_THINGS } from '../../graphql/queries';
import { renderWithProviders } from '../testUtils';
import { makeThing } from '../fixtures';

const NOW = new Date('2026-09-25T17:00:00.000Z');

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

const vocab = { __typename: 'ThingVocabulary', fieldKinds: ['text'], dateKinds: ['other'], photoRoles: ['overview'], documentRoles: ['other'], relationshipKinds: ['stored-with'], missingKeys: ['photo'], trashDays: 30 };

describe('trash', () => {
  it('purge wording', () => {
    expect(purgeText(20)).toBe('Purged in 20 days');
    expect(purgeText(1)).toBe('Purged tomorrow');
    expect(purgeText(0)).toBe('Purged at the next clean-up');
  });

  it('shows days left and restores', async () => {
    const trashed = makeThing({ deletedAt: new Date(NOW.getTime() - 10 * 86400000).toISOString() });
    const restored = vi.fn(() => ({ data: { restoreThing: { ...trashed, deletedAt: null } } }));
    const mocks = [
      { request: { query: GET_THING_VOCABULARY }, result: { data: { thingVocabulary: vocab } }, maxUsageCount: 5 },
      { request: { query: GET_TRASHED_THINGS }, result: { data: { trashedThings: [trashed] } } },
      { request: { query: GET_TRASHED_THINGS }, result: { data: { trashedThings: [] } }, maxUsageCount: 5 },
      { request: { query: RESTORE_THING, variables: { id: 't-wendy' } }, result: restored },
      { request: { query: GET_THINGS, variables: { page: 1, limit: 48, sort: 'name', sortDir: 'asc' } }, result: { data: { things: { __typename: 'ThingPage', total: 1, page: 1, pages: 1, things: [] } } } },
    ];
    renderWithProviders(<TrashView />, { mocks });
    expect(await screen.findByTestId('purge-text')).toHaveTextContent('Purged in 20 days');
    expect(screen.getByText(/stay here for 30 days/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    await waitFor(() => expect(restored).toHaveBeenCalled());
    expect(await screen.findByText('Wendy is back in the library.')).toBeInTheDocument();
    expect(await screen.findByText('The Trash is empty')).toBeInTheDocument();
  });
});
