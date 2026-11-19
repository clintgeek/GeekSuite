import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, screen } from '@testing-library/react';
import { renderWithProviders } from '../../testUtils';
import WritingIndicator, { formatElapsed } from '../../../components/play/WritingIndicator';

/**
 * UX review 2026-11-18, StoryGeek #1: a turn can take up to three minutes and
 * the indicator used to be a fixed sentence. It now counts, says what is
 * usual, says leaving is safe, and admits when a turn runs long.
 */
afterEach(() => { vi.useRealTimers(); });

describe('WritingIndicator — the long wait', () => {
  it('formats the clock as m:ss', () => {
    expect(formatElapsed(0)).toBe('0:00');
    expect(formatElapsed(42.7)).toBe('0:42');
    expect(formatElapsed(125)).toBe('2:05');
  });

  it('counts the seconds, says how long a turn usually takes and that leaving is safe', () => {
    vi.useFakeTimers();
    renderWithProviders(<WritingIndicator />, { router: false });
    expect(screen.getByTestId('writing-elapsed')).toHaveTextContent('0:00');
    expect(screen.getByText(/usually takes one to three minutes/i)).toBeInTheDocument();
    expect(screen.getByText(/you can leave; it will be here when you come back/i)).toBeInTheDocument();

    act(() => { vi.advanceTimersByTime(42_000); });
    expect(screen.getByTestId('writing-elapsed')).toHaveTextContent('0:42');
  });

  it('says so when a turn runs past two minutes', () => {
    vi.useFakeTimers();
    renderWithProviders(<WritingIndicator />, { router: false });
    act(() => { vi.advanceTimersByTime(121_000); });
    expect(screen.getByTestId('writing-elapsed')).toHaveTextContent('2:01');
    expect(screen.getByText(/taking longer than usual/i)).toBeInTheDocument();
    expect(screen.queryByText(/usually takes one to three minutes/i)).not.toBeInTheDocument();
  });

  it('keeps the ticking clock out of the live region', () => {
    renderWithProviders(<WritingIndicator />, { router: false });
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent(/The Game Master is writing/);
    expect(status).not.toContainElement(screen.getByTestId('writing-elapsed'));
  });
});
