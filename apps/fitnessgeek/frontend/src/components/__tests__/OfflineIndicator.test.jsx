/**
 * The offline banner tells the truth (review B17): there is no offline
 * queue, so it says changes can't be saved, and never promises a sync.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import OfflineIndicator from '../OfflineIndicator/OfflineIndicator.jsx';

const setOnline = (value) => Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => value });

afterEach(() => setOnline(true));

describe('OfflineIndicator', () => {
  it("says changes can't be saved, and never that anything will sync", async () => {
    setOnline(true);
    render(<OfflineIndicator />);
    expect(screen.queryByRole('alert')).toBeNull();
    setOnline(false);
    await act(async () => { window.dispatchEvent(new Event('offline')); });
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('You’re offline. Changes can’t be saved until you’re back online.');
    // The chip outlives the banner, so it carries the consequence too.
    expect(screen.getByTestId('offline-chip')).toHaveTextContent('Offline. Changes won’t save');
    expect(document.body.textContent).not.toMatch(/sync/i);
  });

  it('goes away when the signal comes back', async () => {
    setOnline(false);
    render(<OfflineIndicator />);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    setOnline(true);
    await act(async () => { window.dispatchEvent(new Event('online')); });
    expect(screen.queryByTestId('offline-chip')).toBeNull();
    expect(screen.queryByText(/Offline/)).toBeNull();
  });
});
