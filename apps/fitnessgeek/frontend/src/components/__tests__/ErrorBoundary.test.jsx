/**
 * Review 0.16: a render error anywhere under the router shows a plain
 * "Something went wrong" with Reload instead of a white screen, and is
 * logged through the app logger.
 *
 * 2026-11-27: it also offers "Try again" (draw the screen again, no reload)
 * and "Go to Today" (leave a screen that keeps failing).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const logError = vi.fn();
vi.mock('../../utils/logger.js', () => ({ default: { error: (...a) => logError(...a), debug: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

const { default: ErrorBoundary } = await import('../ErrorBoundary.jsx');

function Boom() {
  throw new Error('Cannot read properties of undefined (reading "map")');
}

describe('ErrorBoundary', () => {
  it('shows a plain sentence and Reload, never the raw error, and logs it', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const reload = vi.fn();
    Object.defineProperty(window, 'location', { configurable: true, value: { ...window.location, reload } });
    render(<ErrorBoundary resetKey="/"><Boom /></ErrorBoundary>);
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong.');
    expect(document.body.textContent).not.toMatch(/Cannot read/);
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
    expect(reload).toHaveBeenCalled();
    expect(logError).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('"Try again" draws the screen again without a reload', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const reload = vi.fn();
    Object.defineProperty(window, 'location', { configurable: true, value: { ...window.location, pathname: '/weight', reload, assign: vi.fn() } });
    let broken = true;
    const Flaky = () => {
      if (broken) throw new Error('one bad answer');
      return <p>Weight</p>;
    };
    render(<ErrorBoundary resetKey="/weight"><Flaky /></ErrorBoundary>);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    broken = false;
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(screen.getByText('Weight')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(reload).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('a screen that fails again shows the same way on, not a white screen', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<ErrorBoundary resetKey="/weight"><Boom /></ErrorBoundary>);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong.');
    spy.mockRestore();
  });

  it('"Go to Today" leaves the broken screen with a full load, and is not offered on Today itself', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const assign = vi.fn();
    Object.defineProperty(window, 'location', { configurable: true, value: { ...window.location, pathname: '/saved-foods', reload: vi.fn(), assign } });
    const { unmount } = render(<ErrorBoundary resetKey="/saved-foods"><Boom /></ErrorBoundary>);
    fireEvent.click(screen.getByRole('button', { name: 'Go to Today' }));
    expect(assign).toHaveBeenCalledWith('/dashboard');
    unmount();

    Object.defineProperty(window, 'location', { configurable: true, value: { ...window.location, pathname: '/dashboard', reload: vi.fn(), assign } });
    render(<ErrorBoundary resetKey="/dashboard"><Boom /></ErrorBoundary>);
    expect(screen.queryByRole('button', { name: 'Go to Today' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    spy.mockRestore();
  });

  it('a screen whose code could not be fetched reloads on "Try again"', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const reload = vi.fn();
    Object.defineProperty(window, 'location', { configurable: true, value: { ...window.location, pathname: '/trends', reload, assign: vi.fn() } });
    const Stale = () => { throw new TypeError('Failed to fetch dynamically imported module: https://x/assets/Trends-abc.js'); };
    render(<ErrorBoundary resetKey="/trends"><Stale /></ErrorBoundary>);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(reload).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it('a new route gets a fresh try', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { rerender } = render(<ErrorBoundary resetKey="/a"><Boom /></ErrorBoundary>);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    rerender(<ErrorBoundary resetKey="/b"><p>Weight</p></ErrorBoundary>);
    expect(screen.getByText('Weight')).toBeInTheDocument();
    spy.mockRestore();
  });

  it('App mounts it around the routes', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const app = fs.readFileSync(path.resolve(process.cwd(), 'src/App.jsx'), 'utf8');
    expect(app).toMatch(/<RoutedErrorBoundary>[\s\S]*<AppRoutes \/>[\s\S]*<\/RoutedErrorBoundary>/);
  });
});
