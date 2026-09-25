import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { MockedProvider } from '@apollo/client/testing';
import { InMemoryCache } from '@apollo/client';
import StarRating from '../../components/StarRating';
import { useRateGame } from '../../hooks/useGameActions';
import { GAME_TYPE_POLICIES } from '../../graphql/cachePolicies';
import { GAME_CARD_FIELDS } from '../../graphql/queries';
import { SET_GAME_STATE } from '../../graphql/mutations';
import { createRateGame } from '../../utils/rateGame';
import { makeDetailGame, makeGame } from '../fixtures';
import { renderWithProviders } from '../testUtils';

describe('createRateGame', () => {
  it('applies at once and keeps it when the save succeeds', async () => {
    const apply = vi.fn();
    const rate = createRateGame({ save: async () => ({ id: 'g1' }), apply });
    const res = await rate(makeGame(), 5);
    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenCalledWith('g1', 5);
    expect(res).toEqual({ ok: true, previous: 4 });
  });

  it('rolls back to the previous rating when the save fails', async () => {
    const apply = vi.fn();
    const rate = createRateGame({ save: async () => { throw new Error('nope'); }, apply });
    const res = await rate(makeGame(), 2);
    expect(apply.mock.calls).toEqual([['g1', 2], ['g1', 4]]);
    expect(res.ok).toBe(false);
  });

  it('a late failure for an old tap does not undo a newer one', async () => {
    const apply = vi.fn();
    let rejectFirst;
    const save = vi.fn()
      .mockImplementationOnce(() => new Promise((_r, rej) => { rejectFirst = rej; }))
      .mockImplementationOnce(async () => ({ id: 'g1' }));
    const rate = createRateGame({ save, apply });
    const first = rate(makeGame(), 3);
    await rate(makeGame(), 5);
    rejectFirst(new Error('late'));
    await first;
    expect(apply.mock.calls).toEqual([['g1', 3], ['g1', 5]]);
  });
});

describe('StarRating', () => {
  it('commits the star under the pointer, and not a repeat of the current value', () => {
    const onChange = vi.fn();
    renderWithProviders(<StarRating value={2} label="Hades" onChange={onChange} />);
    const slider = screen.getByRole('slider', { name: 'Rate Hades' });
    slider.getBoundingClientRect = () => ({ left: 0, width: 100, top: 0, height: 44, right: 100, bottom: 44 });
    fireEvent.click(slider, { clientX: 85 });
    expect(onChange).toHaveBeenCalledWith(5);
    onChange.mockClear();
    fireEvent.click(slider, { clientX: 30 });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.keyDown(slider, { key: '3' });
    expect(onChange).toHaveBeenCalledWith(3);
  });
});

function RateHarness({ game }) {
  const rate = useRateGame();
  return <StarRating value={game.me.rating} label={game.title} onChange={(n) => rate(game, n)} />;
}

describe('useRateGame — optimistic with Undo', () => {
  it('writes the cache before the server answers, then Undo sends the previous rating', async () => {
    const game = makeDetailGame();
    const cache = new InMemoryCache({ typePolicies: GAME_TYPE_POLICIES });
    cache.writeFragment({ fragment: GAME_CARD_FIELDS, data: game, id: 'Game:g1' });

    const reply = (rating) => ({
      data: { setGameState: { ...game, me: { ...game.me, rating } } },
    });
    const sent = [];
    // Detail fields the mutation selects; the mock returns what it gets asked for.
    const mocks = [5, 4].map((rating) => ({
      request: { query: SET_GAME_STATE, variables: { gameId: 'g1', input: { rating } } },
      result: () => {
        sent.push(rating);
        return reply(rating);
      },
      delay: 20,
    }));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    renderWithProviders(<RateHarness game={game} />, {
      wrapper: ({ children }) => (
        <MockedProvider mocks={mocks} cache={cache} addTypename>
          {children}
        </MockedProvider>
      ),
    });

    const slider = screen.getByRole('slider');
    await act(async () => {
      fireEvent.keyDown(slider, { key: '5' });
    });
    // Optimistic: the cache already says 5 while the mutation is in flight.
    expect(cache.readFragment({ fragment: GAME_CARD_FIELDS, id: 'Game:g1' }).me.rating).toBe(5);

    const undo = await screen.findByRole('button', { name: 'Undo' });
    await waitFor(() => expect(sent).toEqual([5]));
    await act(async () => {
      fireEvent.click(undo);
    });
    await waitFor(() => expect(sent).toEqual([5, 4]));
    expect(cache.readFragment({ fragment: GAME_CARD_FIELDS, id: 'Game:g1' }).me.rating).toBe(4);
    warn.mockRestore();
    error.mockRestore();
  });
});
