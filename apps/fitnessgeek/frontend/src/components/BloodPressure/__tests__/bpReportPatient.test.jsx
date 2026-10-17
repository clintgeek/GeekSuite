/**
 * The BP report names the person who is signed in. It had one person's name
 * and birthday typed in, so Heather's export to her doctor carried Chef's.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../../../services/userService.js', () => ({
  userService: { getProfile: vi.fn(async () => ({ name: 'Heather Crocker', email: 'h@example.com', profile: { age: 52, gender: 'female' } })) },
}));

const { default: BPReport, patientName, patientDetails } = await import('../BPReport.jsx');

const logs = [
  { id: '1', systolic: 128, diastolic: 82, pulse: 70, log_date: '2026-10-14T00:00:00.000Z', measured_at: '2026-10-14T12:40:00.000Z' },
  { id: '2', systolic: 122, diastolic: 78, pulse: 68, log_date: '2026-10-15T00:00:00.000Z', measured_at: '2026-10-15T12:40:00.000Z' },
];

describe('BP report patient', () => {
  it("shows the signed-in person's name and details, never a hard-coded one", async () => {
    render(<BPReport bpLogs={logs} onClose={() => {}} />);
    expect((await screen.findByTestId('bp-report-patient')).textContent).toBe('Heather Crocker');
    expect(await screen.findByText('52 yr · Female')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/Clint Crocker|1978/);
  });

  it('builds the name from what the account has', () => {
    expect(patientName({ firstName: 'Heather', lastName: 'C' })).toBe('Heather C');
    expect(patientName({ email: 'chef@example.com' })).toBe('chef');
    expect(patientName(null)).toBe('');
    expect(patientDetails({})).toBe('');
  });
});
