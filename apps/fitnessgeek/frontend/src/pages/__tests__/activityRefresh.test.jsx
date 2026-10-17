/**
 * Activity's foot: "Updated …" and a Refresh that asks Garmin again without
 * blanking the page (d-fixes). It is also the page's one focusable control:
 * the shell's scrolling <main> held nothing a keyboard could land on (axe
 * scrollable-region-focusable on harness 58).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../services/fitnessGeekService', () => ({
  fitnessGeekService: {
    getGarminStatus: vi.fn(() => Promise.resolve({ data: { enabled: true } })),
    getGarminDaily: vi.fn(() => Promise.resolve({ data: { steps: 4200, fetchedAt: new Date().toISOString() } })),
    getGarminSleep: vi.fn(() => Promise.resolve({ data: null })),
    getGarminActivities: vi.fn(() => Promise.resolve({ data: [] })),
  },
}));

const { fitnessGeekService } = await import('../../services/fitnessGeekService');
const { default: Activity } = await import('../Activity.jsx');

describe('Activity Refresh', () => {
  it('asks Garmin again, and the page stays up while it does', async () => {
    render(<MemoryRouter><Activity /></MemoryRouter>);
    const refresh = await screen.findByRole('button', { name: 'Refresh' });
    expect(fitnessGeekService.getGarminDaily).toHaveBeenCalledTimes(1);
    fireEvent.click(refresh);
    expect(screen.getByText('Today so far')).toBeInTheDocument();
    await waitFor(() => expect(fitnessGeekService.getGarminDaily).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole('button', { name: 'Refresh' })).toBeEnabled();
  });
});
