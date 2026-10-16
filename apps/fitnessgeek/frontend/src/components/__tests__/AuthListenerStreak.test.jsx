/**
 * The daily login streak (review B4/B5 follow-on): the "already recorded"
 * marker is per person, and an installed PWA kept alive across midnight
 * records the new day when it comes back to the foreground.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';

const recordLogin = vi.fn(() => Promise.resolve({}));
vi.mock('../../services/streakService', () => ({ streakService: { recordLogin: (...a) => recordLogin(...a) } }));
let authUser = { id: 'u-heather' };
vi.mock('@geeksuite/auth', () => ({ useAuth: () => ({ user: authUser }) }));

const { default: AuthListener } = await import('../AuthListener.jsx');

beforeEach(() => {
  recordLogin.mockClear();
  authUser = { id: 'u-heather' };
  window.localStorage.clear();
});
afterEach(() => vi.useRealTimers());

describe('AuthListener streak', () => {
  it("one person's recorded day does not stop another person's", async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 16, 9, 0));
    // Chef recorded today on this phone already.
    window.localStorage.setItem('fitnessgeek_last_login_recorded', '2026-10-16');
    window.localStorage.setItem('fitnessgeek_last_login_recorded.u-chef', '2026-10-16');
    render(<AuthListener />);
    await act(async () => {});
    expect(recordLogin).toHaveBeenCalledTimes(1);
    expect(recordLogin).toHaveBeenCalledWith({ date: '2026-10-16' });
    expect(window.localStorage.getItem('fitnessgeek_last_login_recorded.u-heather')).toBe('2026-10-16');
  });

  it('a PWA kept alive overnight records the new day when it comes back', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 15, 22, 0));
    render(<AuthListener />);
    await act(async () => {});
    expect(recordLogin).toHaveBeenLastCalledWith({ date: '2026-10-15' });

    vi.setSystemTime(new Date(2026, 9, 16, 7, 30));
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    await act(async () => {});
    expect(recordLogin).toHaveBeenCalledTimes(2);
    expect(recordLogin).toHaveBeenLastCalledWith({ date: '2026-10-16' });
  });

  it('records once per day, not on every render', async () => {
    const { rerender } = render(<AuthListener />);
    await act(async () => {});
    rerender(<AuthListener />);
    await act(async () => { window.dispatchEvent(new Event('focus')); });
    expect(recordLogin).toHaveBeenCalledTimes(1);
  });
});
