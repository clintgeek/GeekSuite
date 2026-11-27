/**
 * The readings list is a record, not the page: ten rows, then "Show all".
 * It used to draw every reading ever logged (two a day for a year is 700
 * rows under the charts). And a partial record is skipped, not a crash.
 */
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import BPLogList, { INITIAL_ROWS } from '../BPLogList.jsx';

const reading = (i) => ({
  id: `bp-${i}`,
  systolic: 120 + (i % 5),
  diastolic: 78,
  pulse: 60,
  log_date: new Date(Date.UTC(2026, 5, 1 + i)).toISOString(),
  measured_at: new Date(Date.UTC(2026, 5, 1 + i, 13)).toISOString(),
});

describe('BPLogList', () => {
  it('shows the newest ten, and the rest behind "Show all"', () => {
    const logs = Array.from({ length: 23 }, (_, i) => reading(i));
    render(<BPLogList logs={logs} onDelete={() => {}} />);
    expect(screen.getAllByTestId('bp-log-row')).toHaveLength(INITIAL_ROWS);
    expect(screen.getByText('23 readings')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show all 23' }));
    expect(screen.getAllByTestId('bp-log-row')).toHaveLength(23);
    fireEvent.click(screen.getByRole('button', { name: 'Show fewer' }));
    expect(screen.getAllByTestId('bp-log-row')).toHaveLength(INITIAL_ROWS);
  });

  it('ten or fewer readings have no "Show all"', () => {
    render(<BPLogList logs={[reading(0), reading(1)]} onDelete={() => {}} />);
    expect(screen.queryByRole('button', { name: /show all/i })).toBeNull();
  });

  it('skips a null row and a row with no numbers instead of crashing', () => {
    render(<BPLogList logs={[null, reading(0), { id: 'x', log_date: '2026-06-02T00:00:00.000Z' }]} onDelete={() => {}} />);
    expect(screen.getAllByTestId('bp-log-row')).toHaveLength(1);
    expect(document.body.textContent).not.toMatch(/undefined|NaN/);
  });

  it('no list at all is the empty panel, not a crash', () => {
    render(<BPLogList logs={undefined} onDelete={() => {}} />);
    expect(screen.getByText('No readings yet')).toBeInTheDocument();
  });
});
