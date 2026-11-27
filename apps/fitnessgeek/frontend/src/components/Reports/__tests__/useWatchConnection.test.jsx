/**
 * One answer to "does this person have a watch connected?", for the Trends
 * tabs, the Food view's body section and the quiet line at the foot.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const get = vi.fn();
vi.mock('../../../services/apiService', () => ({ apiService: { get: (...a) => get(...a) } }));

const { useWatchConnection, watchConnectedFrom, CONNECT_WATCH_HREF } = await import('../useWatchConnection.js');

beforeEach(() => {
  get.mockReset();
  window.localStorage.clear();
});

describe('watchConnectedFrom', () => {
  it('a saved Garmin login or the watch-data switch means a watch', () => {
    expect(watchConnectedFrom({ garmin: { enabled: true }, influxEnabled: false })).toBe(true);
    expect(watchConnectedFrom({ garmin: { enabled: false }, influxEnabled: true })).toBe(true);
    expect(watchConnectedFrom({ garmin: { enabled: false }, influxEnabled: false })).toBe(false);
    expect(watchConnectedFrom({ garmin: null })).toBe(false);
    expect(watchConnectedFrom(null)).toBe(false);
  });
  it('sends a person to the devices part of Settings', () => {
    expect(CONNECT_WATCH_HREF).toBe('/settings#devices');
  });
});

describe('useWatchConnection', () => {
  it('checking, then connected', async () => {
    get.mockResolvedValue({ success: true, data: { garmin: { enabled: true } } });
    const { result } = renderHook(() => useWatchConnection());
    expect(result.current).toMatchObject({ status: 'checking', showWatch: false, settled: false });
    await waitFor(() => expect(result.current.status).toBe('connected'));
    expect(result.current).toMatchObject({ showWatch: true, settled: true });
    expect(get).toHaveBeenCalledWith('/user/settings');
  });

  it('checking, then none', async () => {
    get.mockResolvedValue({ success: true, data: { garmin: { enabled: false }, influxEnabled: false } });
    const { result } = renderHook(() => useWatchConnection());
    await waitFor(() => expect(result.current.status).toBe('none'));
    expect(result.current.showWatch).toBe(false);
  });

  it('a failed read is "unknown", which shows the watch parts (owner-safe)', async () => {
    get.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useWatchConnection());
    await waitFor(() => expect(result.current.status).toBe('unknown'));
    expect(result.current.showWatch).toBe(true);
  });

  it('starts from what this device saw last time, and corrects it', async () => {
    window.localStorage.setItem('fitnessgeek.watchConnected', '1');
    get.mockResolvedValue({ success: true, data: { garmin: { enabled: false } } });
    const { result } = renderHook(() => useWatchConnection());
    expect(result.current).toMatchObject({ status: 'connected', showWatch: true, settled: false });
    await waitFor(() => expect(result.current.status).toBe('none'));
    expect(window.localStorage.getItem('fitnessgeek.watchConnected')).toBe('0');
  });

  it('storage that throws (private mode) is not a crash', async () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied'); });
    try {
      get.mockResolvedValue({ success: true, data: { garmin: { enabled: true } } });
      const { result } = renderHook(() => useWatchConnection());
      expect(result.current.status).toBe('checking');
      await waitFor(() => expect(result.current.status).toBe('connected'));
    } finally {
      getItem.mockRestore();
      setItem.mockRestore();
    }
  });
});
