/**
 * Review 0.16: a render error anywhere under the router shows a plain
 * "Something went wrong" with Reload instead of a white screen, and is
 * logged through the app logger.
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
