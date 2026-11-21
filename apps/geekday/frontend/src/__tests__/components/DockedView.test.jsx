// Runs in America/Chicago (vitest.config.js).
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen } from '@testing-library/react';
import DockedView from '../../components/DockedView.jsx';
import { GET_DAY_TASKS } from '../../graphql/documents.js';
import { dateOnly, makeTask, renderDay } from '../helpers.jsx';

const TODAY = '2026-11-20';
const tasksMock = (dailyTasks) => ({
  request: { query: GET_DAY_TASKS, variables: { date: TODAY, tzOffsetMinutes: 360 } },
  result: { data: { dailyTasks } },
});

describe('DockedView (spec reqs 14, 16)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 20, 12, 5, 0)); // 12:05 pm Central
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url) => ({
        ok: true,
        json: async () =>
          String(url).includes('ipapi')
            ? { latitude: 34.12, longitude: -93.05, city: 'Arkadelphia', region: 'Arkansas' }
            : { current: { temperature_2m: 63.6, weather_code: 2 }, daily: { temperature_2m_max: [70], temperature_2m_min: [48] } },
      }))
    );
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('shows the clock, the next task and the weather', async () => {
    renderDay(<DockedView today={TODAY} onWake={vi.fn()} />, {
      mocks: [
        tasksMock([
          makeTask({ content: 'Morning standup', dueDate: '2026-11-20T15:00:00.000Z', hasDueTime: true }),
          makeTask({ content: 'Call the vet', dueDate: '2026-11-20T20:00:00.000Z', hasDueTime: true }),
          makeTask({ content: 'Buy layer pellets', dueDate: dateOnly(TODAY) }),
        ]),
      ],
    });
    expect(screen.getByTestId('docked-clock')).toHaveTextContent('12:05');
    expect(await screen.findByText('Call the vet')).toBeInTheDocument();
    expect(screen.getByTestId('docked-next')).toHaveTextContent(/Next\s*2:00\sPM/);
    expect(await screen.findByText(/Partly cloudy/)).toBeInTheDocument();
    expect(screen.getByTestId('docked-weather')).toHaveTextContent('64°');
    expect(screen.getByTestId('docked-weather')).toHaveTextContent('High 70° · Low 48°');
  });

  it('says the list is clear only once it knows', async () => {
    renderDay(<DockedView today={TODAY} onWake={vi.fn()} />, { mocks: [tasksMock([])] });
    expect(screen.getByTestId('docked-next')).toBeEmptyDOMElement();
    expect(await screen.findByText('Nothing left on today’s list.')).toBeInTheDocument();
  });

  it('shows no weather line when the weather cannot be read', async () => {
    fetch.mockRejectedValue(new Error('offline'));
    renderDay(<DockedView today={TODAY} onWake={vi.fn()} />, { mocks: [tasksMock([])] });
    await screen.findByText('Nothing left on today’s list.');
    expect(screen.getByTestId('docked-weather')).toBeEmptyDOMElement();
  });

  it('wakes on a tap and on a key', () => {
    const onWake = vi.fn();
    renderDay(<DockedView today={TODAY} onWake={onWake} />, { mocks: [tasksMock([])] });
    const face = screen.getByTestId('docked');
    fireEvent.click(face);
    expect(onWake).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(face, { key: ' ' });
    expect(onWake).toHaveBeenCalledTimes(2);
  });

  it('does not wake on the press, only after the release, so the same touch cannot reach the page', () => {
    vi.useFakeTimers();
    const onWake = vi.fn();
    renderDay(<DockedView today={TODAY} onWake={onWake} />, { mocks: [tasksMock([])] });
    const face = screen.getByTestId('docked');
    fireEvent.pointerDown(face, { pointerType: 'pen' });
    expect(onWake).not.toHaveBeenCalled();
    fireEvent.pointerUp(face, { pointerType: 'pen' });
    expect(onWake).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(100));
    expect(onWake).toHaveBeenCalledTimes(1);
  });
});
