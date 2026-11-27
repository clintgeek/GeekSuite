/**
 * Review 2026-11-27 (scenes 33, 47): with no signal the add sheet said "No
 * signal — I can't log this yet" under the button while the app-wide banner
 * said "You're offline…" on top of it. One message, where she is looking.
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { GeekToastProvider } from '@geeksuite/ui';

vi.mock('../../services/foodService', () => ({ foodService: { suggest: vi.fn().mockResolvedValue([]), search: vi.fn().mockResolvedValue([]) } }));
vi.mock('../../hooks/useRecentLogs.js', () => ({ useRecentLogs: () => ({ logs: [], meals: [], loading: false }), forgetRecentLogs: vi.fn() }));
vi.mock('../FoodSearch/useHouseholdMeals.js', () => ({ useHouseholdMeals: () => [] }));

const { default: OfflineIndicator } = await import('../OfflineIndicator/OfflineIndicator.jsx');
const { default: FoodComposer } = await import('../FoodSearch/FoodComposer.jsx');
const { useSaysOffline } = await import('../OfflineIndicator/offlineVoice.js');

const setOnline = (value) => Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => value });
afterEach(() => setOnline(true));

const Claimer = ({ active }) => { useSaysOffline(active); return null; };

describe('one offline message at a time', () => {
  it('the app-wide banner and chip stay quiet while a screen is saying it, and come back after', async () => {
    setOnline(false);
    const { rerender } = render(<><OfflineIndicator /><Claimer active={false} /></>);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    rerender(<><OfflineIndicator /><Claimer active /></>);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByTestId('offline-chip')).toBeNull();
    rerender(<><OfflineIndicator /><Claimer active={false} /></>);
    expect(screen.getByTestId('offline-chip')).toBeInTheDocument();
  });

  it('the add sheet says it once: its own line, and no banner', async () => {
    setOnline(false);
    render(
      <GeekToastProvider>
        <OfflineIndicator />
        <FoodComposer mode="dialog" onLogItems={vi.fn()} onDescribe={vi.fn()} mealType="lunch" />
      </GeekToastProvider>
    );
    expect(screen.getByTestId('composer-status')).toHaveTextContent(/No signal/);
    expect(screen.queryByText(/You’re offline/)).toBeNull();
    expect(screen.queryByTestId('offline-chip')).toBeNull();
    expect(document.body.textContent.match(/No signal|offline/gi)).toHaveLength(1);

    // Back online: nothing says offline; and the page's own box (not a
    // sheet, nothing typed) leaves the app-wide message alone.
    setOnline(true);
    await act(async () => { window.dispatchEvent(new Event('online')); });
    expect(screen.getByTestId('composer-status')).not.toHaveTextContent(/No signal/);
  });

  it('the box built into a page, with nothing typed, leaves the app-wide message alone', async () => {
    setOnline(false);
    render(
      <GeekToastProvider>
        <OfflineIndicator />
        <FoodComposer mode="page" onLogItems={vi.fn()} onDescribe={vi.fn()} mealType="lunch" />
      </GeekToastProvider>
    );
    expect(await screen.findByTestId('offline-chip')).toBeInTheDocument();
  });
});
