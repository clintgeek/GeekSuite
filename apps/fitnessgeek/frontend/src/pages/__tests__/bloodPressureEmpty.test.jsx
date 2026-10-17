/**
 * A brand-new account's BP page has a first step of its own. On a phone the
 * only way in used to be the floating button, which sits outside the page
 * (and left axe a scrolling region with nothing focusable, CI 2026-10-17).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { GeekToastProvider } from '@geeksuite/ui';

vi.mock('../../services/bpService.js', () => ({
  bpService: { getBPLogs: vi.fn(async () => ({ data: [] })), getAll: vi.fn(async () => ({ data: [] })) },
  default: { getBPLogs: vi.fn(async () => ({ data: [] })) },
}));

const { default: BloodPressure } = await import('../BloodPressure.jsx');

describe('BP page with no readings', () => {
  it('offers "Log your first reading", which opens the add form', async () => {
    render(<GeekToastProvider><MemoryRouter><BloodPressure /></MemoryRouter></GeekToastProvider>);
    const start = await screen.findByRole('button', { name: 'Log your first reading' });
    // Said once, not twice (the readings list's own empty card is hidden).
    expect(screen.getAllByText('No readings yet')).toHaveLength(1);
    fireEvent.click(start);
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });
});
