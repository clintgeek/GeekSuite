/**
 * "Save as PDF" on the blood-pressure report.
 *
 * Making the PDF fetches two libraries on the tap and takes seconds on a
 * phone. A failure used to be a console line and nothing on screen, and a
 * second tap while it worked made a second PDF.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../../../services/userService.js', () => ({
  userService: { getProfile: vi.fn(async () => null) },
}));
let release;
const html2canvas = vi.fn(() => new Promise((_resolve, reject) => { release = () => reject(new Error('chunk failed to load')); }));
vi.mock('html2canvas', () => ({ default: (...a) => html2canvas(...a) }));
vi.mock('jspdf', () => ({ default: vi.fn() }));

const { default: BPReport } = await import('../BPReport.jsx');

const logs = [
  { id: '1', systolic: 128, diastolic: 82, pulse: 70, log_date: '2026-10-14T00:00:00.000Z', measured_at: '2026-10-14T12:40:00.000Z' },
  { id: '2', systolic: 122, diastolic: 78, pulse: 68, log_date: '2026-10-15T00:00:00.000Z', measured_at: '2026-10-15T12:40:00.000Z' },
];

describe('BP report — Save as PDF', () => {
  it('is busy while it works (no second PDF), and says so in words when it fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<BPReport bpLogs={logs} onClose={() => {}} />);
    const save = screen.getByRole('button', { name: 'Save as PDF', hidden: true });
    fireEvent.click(save);

    const busy = await screen.findByRole('button', { name: 'Making the PDF…', hidden: true });
    expect(busy).toBeDisabled();
    await waitFor(() => expect(html2canvas).toHaveBeenCalledTimes(1));
    fireEvent.click(busy);
    expect(html2canvas).toHaveBeenCalledTimes(1);

    release();
    expect(await screen.findByRole('alert', { hidden: true })).toHaveTextContent('Couldn’t make the PDF. Check your connection and try again.');
    expect(screen.getByRole('button', { name: 'Save as PDF', hidden: true })).toBeEnabled();
  });

  it('names its other exports in plain words', () => {
    render(<BPReport bpLogs={logs} onClose={() => {}} />);
    expect(screen.getByRole('button', { name: 'Save as a spreadsheet', hidden: true })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save as text', hidden: true })).toBeInTheDocument();
  });
});
