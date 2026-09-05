import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import DateField from '../DateField.jsx';

// DateField is the shared wrapper TODO_ORDER #30 / SUITE_TODO "Native date
// inputs" asked for: one native `<input type="date">` behind a MUI
// TextField, so weight/BP/food-log date fields stop hand-rolling their own
// label/size/min/max combination. Values in and out are plain `YYYY-MM-DD`
// strings — no Date object ever touches this component.

describe('DateField', () => {
  test('renders a native date input with the value and a default "Date" label', () => {
    render(<DateField value="2026-09-05" onChange={() => {}} />);

    const input = screen.getByLabelText('Date');
    expect(input).toHaveAttribute('type', 'date');
    expect(input).toHaveValue('2026-09-05');
  });

  test('calls onChange with the raw YYYY-MM-DD string, not a Date object', () => {
    const onChange = vi.fn();
    render(<DateField value="2026-09-05" onChange={onChange} />);

    const input = screen.getByLabelText('Date');
    // A native date input delivers one change event carrying the complete
    // ISO date string — it isn't typed key-by-key like a text field.
    fireEvent.change(input, { target: { value: '2026-09-06' } });

    expect(onChange).toHaveBeenCalledTimes(1);
    const [arg] = onChange.mock.calls[0];
    // Must be a plain string in the app's convention, never a Date object —
    // the guard against reintroducing the calendar-vs-instant bug fixed in
    // 4856227.
    expect(typeof arg).toBe('string');
    expect(arg).toBe('2026-09-06');
  });

  test('suppresses the label when label is falsy, for a field with its own adjacent caption', () => {
    render(<DateField value="2026-09-05" onChange={() => {}} label={false} />);

    expect(screen.queryByLabelText('Date')).not.toBeInTheDocument();
  });

  test('accepts a custom label', () => {
    render(<DateField value="2026-09-05" onChange={() => {}} label="From" />);

    expect(screen.getByLabelText('From')).toBeInTheDocument();
  });

  test('forwards min/max onto the native input (e.g. "no future dates")', () => {
    render(
      <DateField
        value="2026-09-05"
        onChange={() => {}}
        max="2026-09-05"
        min="2020-01-01"
      />
    );

    const input = screen.getByLabelText('Date');
    expect(input).toHaveAttribute('max', '2026-09-05');
    expect(input).toHaveAttribute('min', '2020-01-01');
  });
});
