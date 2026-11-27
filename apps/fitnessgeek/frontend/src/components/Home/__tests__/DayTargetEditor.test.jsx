/**
 * "Change today's target" writes ONE slot of the plan's Mon=0..Sun=6 weekly
 * schedule, and the gateway's `derivedMacros` reads the slot for the weekday
 * of the calendar day Today sends. The writer used
 * `new Date('YYYY-MM-DD').getDay()`: UTC midnight read in the device's zone,
 * which in every US zone is the evening before. Changing Friday's target
 * wrote Thursday's slot, said "saved", and Today kept the old number.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterAll, beforeAll } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const { getSettings, updateSettings } = vi.hoisted(() => ({
  getSettings: vi.fn(),
  updateSettings: vi.fn(),
}));
vi.mock('../../../services/settingsService.js', () => ({
  settingsService: { getSettings, updateSettings },
}));

const ORIGINAL_TZ = process.env.TZ;
beforeAll(() => { process.env.TZ = 'America/Chicago'; });
afterAll(() => { process.env.TZ = ORIGINAL_TZ; });

import DayTargetEditor, { mondayFirstIndex } from '../DayTargetEditor.jsx';

// The reader's rule, copied from the gateway's `derivedMacros` resolver.
const readerIndex = (ymd) => (new Date(`${ymd}T00:00:00.000Z`).getUTCDay() + 6) % 7;

describe('DayTargetEditor writes the slot the reader reads (America/Chicago)', () => {
  beforeEach(() => {
    getSettings.mockReset();
    updateSettings.mockReset();
  });

  it('is running in a zone west of UTC', () => {
    expect(new Date('2026-11-27').getDate()).toBe(26);
  });

  it('agrees with the reader for every day of a week', () => {
    // 2026-11-23 is a Monday.
    const days = ['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28', '2026-11-29'];
    expect(days.map(mondayFirstIndex)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(days.map(mondayFirstIndex)).toEqual(days.map(readerIndex));
  });

  it('saving on a Friday changes Friday, not Thursday', async () => {
    getSettings.mockResolvedValue({
      data: { nutrition_goal: { min_safe_calories: 1200, weekly_schedule: [2000, 2000, 2000, 2000, 2000, 2000, 2000] } },
    });
    updateSettings.mockResolvedValue({ success: true });
    const onSaved = vi.fn();

    render(<DayTargetEditor day="2026-11-27" goal={2000} onSaved={onSaved} />);
    fireEvent.change(screen.getByLabelText(/change today/i), { target: { value: '2400' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(updateSettings).toHaveBeenCalledTimes(1));
    const sent = updateSettings.mock.calls[0][0].nutrition_goal.weekly_schedule;
    expect(sent).toEqual([2000, 2000, 2000, 2000, 2400, 2000, 2000]);
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });

  it('writes nothing when the plan could not be read (no seven copies of today)', async () => {
    getSettings.mockResolvedValue({ data: {} });
    updateSettings.mockReset();
    render(<DayTargetEditor day="2026-11-27" goal={2000} />);
    fireEvent.change(screen.getByLabelText(/change today/i), { target: { value: '2400' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Couldn’t save that. Try again.')).toBeInTheDocument();
    expect(updateSettings).not.toHaveBeenCalled();
  });
});
