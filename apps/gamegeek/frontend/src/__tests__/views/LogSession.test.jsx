import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import LogSessionSheet, { defaultSessionPlatform } from '../../views/detail/LogSessionSheet';
import { buildSessionInput, parseMinutes } from '../../views/detail/sessionInput';
import { calendarDateToUtcIso, todayInputValue } from '../../utils/dates';
import { makeGame } from '../fixtures';
import { renderWithProviders } from '../testUtils';

describe('buildSessionInput', () => {
  it('sends the picked calendar day as UTC midnight, whatever the local zone', () => {
    const { input } = buildSessionInput({ date: '2026-09-24', minutes: 90, platform: 'switch', note: '  boss 2 ' });
    expect(input).toEqual({ playedOn: '2026-09-24T00:00:00.000Z', minutes: 90, platform: 'switch', note: 'boss 2' });
  });

  it('turns typed lengths into whole minutes and refuses nonsense', () => {
    expect(parseMinutes('45')).toBe(45);
    expect(parseMinutes('1.5h')).toBe(90);
    expect(parseMinutes('1h 30m')).toBe(90);
    expect(parseMinutes('2 hours')).toBe(120);
    expect(parseMinutes('1:15')).toBe(75);
    expect(parseMinutes('soon')).toBeNull();
    expect(buildSessionInput({ date: '2026-09-24', minutes: 'soon' }).error).toBeTruthy();
    expect(buildSessionInput({ date: '', minutes: 30 }).error).toBeTruthy();
    expect(buildSessionInput({ date: '2026-09-24', minutes: 24 * 60 + 1 }).error).toBeTruthy();
  });

  it('omits an empty platform and note', () => {
    expect(buildSessionInput({ date: '2026-01-02', minutes: '30', platform: '', note: ' ' }).input).toEqual({
      playedOn: '2026-01-02T00:00:00.000Z',
      minutes: 30,
    });
  });
});

describe('defaultSessionPlatform', () => {
  it('prefers the profile default when the game is on it, else the first copy', () => {
    const game = makeGame({ copies: [{ id: 'a', platform: 'switch' }, { id: 'b', platform: 'pc' }] });
    expect(defaultSessionPlatform(game, { defaultPlatform: 'pc' })).toBe('pc');
    expect(defaultSessionPlatform(game, { defaultPlatform: 'ps5' })).toBe('switch');
    expect(defaultSessionPlatform(makeGame({ copies: [] }), { defaultPlatform: 'steam-deck' })).toBe('steam-deck');
  });
});

describe('LogSessionSheet', () => {
  afterEach(() => vi.useRealTimers());

  it('two taps: pick 1h 30m, Log — today at UTC midnight, the default platform', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    renderWithProviders(
      <LogSessionSheet open onClose={onClose} game={makeGame()} profile={{ defaultPlatform: 'switch', platformsOwned: ['switch'] }} vocabPlatforms={['pc', 'switch']} onSubmit={onSubmit} />
    );
    fireEvent.click(screen.getByRole('button', { name: '1h 30m' }));
    fireEvent.click(screen.getByRole('button', { name: 'Log 1h 30m' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({
      playedOn: calendarDateToUtcIso(todayInputValue()),
      minutes: 90,
      platform: 'switch',
    });
    expect(onSubmit.mock.calls[0][0].playedOn).toMatch(/^\d{4}-\d{2}-\d{2}T00:00:00\.000Z$/);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('a custom length is parsed', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderWithProviders(
      <LogSessionSheet open onClose={() => {}} game={makeGame()} profile={null} vocabPlatforms={['pc']} onSubmit={onSubmit} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Other' }));
    fireEvent.change(screen.getByLabelText('Length'), { target: { value: '2h 15m' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log 2h 15m' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ minutes: 135 })));
  });
});
