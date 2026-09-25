import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { MockedProvider } from '@apollo/client/testing';
import { ApolloClient } from '@apollo/client';
import MetadataCard from '../../views/settings/MetadataCard';
import { getEnrichStatus, runEnrich } from '../../api/rest';
import { renderWithProviders } from '../testUtils';

vi.mock('../../api/rest', () => ({
  getEnrichStatus: vi.fn(),
  runEnrich: vi.fn(),
}));

const ApolloWrapper = ({ children }) => <MockedProvider mocks={[]}>{children}</MockedProvider>;

const statusFixture = (over = {}) => ({
  running: false,
  queued: 0,
  counts: { matched: 12, pending: 3, noMatch: 2, ambiguous: 1, error: 0, unlinked: 0 },
  providers: { steam: true, igdb: false, rawg: false },
  lastRunAt: '2026-09-24T12:00:00.000Z',
  ...over,
});

function renderCard() {
  return renderWithProviders(<MetadataCard />, { wrapper: ApolloWrapper });
}

describe('MetadataCard', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('renders counts and provider on/off states, with the no-blame key line', async () => {
    getEnrichStatus.mockResolvedValueOnce(statusFixture());
    renderCard();

    await waitFor(() => expect(screen.getByTestId('metadata-counts')).toHaveTextContent('12Matched'));
    const counts = screen.getByTestId('metadata-counts');
    expect(counts).toHaveTextContent('3Waiting');
    expect(counts).toHaveTextContent('2No match');
    expect(counts).toHaveTextContent('1Needs a choice');
    expect(counts).toHaveTextContent('0Errors');

    expect(screen.getByTestId('provider-steam')).toHaveAttribute('data-provider-on', 'true');
    expect(screen.getByTestId('provider-igdb')).toHaveAttribute('data-provider-on', 'false');
    expect(screen.getByTestId('provider-rawg')).toHaveAttribute('data-provider-on', 'false');

    expect(screen.getByText(/IGDB and RAWG need API keys in GameGeek's server settings/)).toBeInTheDocument();
  });

  it('hides the key-needed line once IGDB and RAWG are both configured', async () => {
    getEnrichStatus.mockResolvedValueOnce(statusFixture({ providers: { steam: true, igdb: true, rawg: true } }));
    renderCard();

    await waitFor(() => expect(screen.getByTestId('provider-igdb')).toHaveAttribute('data-provider-on', 'true'));
    expect(screen.queryByText(/need API keys/)).not.toBeInTheDocument();
  });

  it('Run now calls the run endpoint and starts polling while running', async () => {
    getEnrichStatus.mockResolvedValueOnce(statusFixture({ running: false }));
    renderCard();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Run now' })).toBeInTheDocument());

    runEnrich.mockResolvedValueOnce({ started: true });
    getEnrichStatus.mockResolvedValueOnce(statusFixture({ running: true, queued: 40 }));
    fireEvent.click(screen.getByRole('button', { name: 'Run now' }));

    await waitFor(() => expect(runEnrich).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByTestId('metadata-running')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Running…' })).toBeDisabled();
    expect(getEnrichStatus).toHaveBeenCalledTimes(2);

    // The 5s poll fires again while running.
    getEnrichStatus.mockResolvedValueOnce(statusFixture({ running: true, queued: 20 }));
    await vi.advanceTimersByTimeAsync(5000);
    await waitFor(() => expect(getEnrichStatus).toHaveBeenCalledTimes(3));
  });

  it('stops polling once running flips to false and refreshes the library', async () => {
    const refetchSpy = vi.spyOn(ApolloClient.prototype, 'refetchQueries').mockResolvedValue([]);

    getEnrichStatus.mockResolvedValueOnce(statusFixture({ running: true, queued: 5 }));
    renderCard();
    await waitFor(() => expect(screen.getByTestId('metadata-running')).toBeInTheDocument());

    getEnrichStatus.mockResolvedValueOnce(statusFixture({ running: false }));
    await vi.advanceTimersByTimeAsync(5000);
    await waitFor(() => expect(screen.queryByTestId('metadata-running')).not.toBeInTheDocument());

    expect(refetchSpy).toHaveBeenCalledWith(
      expect.objectContaining({ include: expect.arrayContaining(['GetGameShelves', 'GetGameProfile']) })
    );
    // The paginated list is never refetched (that collapses a scrolled
    // library); a finished run drops the cached lists instead.
    expect(refetchSpy.mock.calls.flatMap(([opts]) => opts.include)).not.toContain('GetGames');

    // No further polling once it's no longer running.
    const callsSoFar = getEnrichStatus.mock.calls.length;
    await vi.advanceTimersByTimeAsync(10000);
    expect(getEnrichStatus.mock.calls.length).toBe(callsSoFar);

    refetchSpy.mockRestore();
  });
});
