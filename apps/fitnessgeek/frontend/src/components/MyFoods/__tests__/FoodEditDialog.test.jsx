/**
 * B11 in the custom-food form: every number box parsed each keystroke and
 * rendered `value || ''`, so the "0" of "0.5" blanked it. The parent still
 * receives numbers; the box keeps what was typed. Decimal keypad on phones.
 */
import React, { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import FoodEditDialog from '../FoodEditDialog.jsx';

function Harness({ onForm }) {
  const [form, setForm] = useState({ name: 'Oat milk', calories_per_serving: '', fat_grams: '' });
  return (
    <FoodEditDialog
      open
      food={null}
      form={form}
      onChange={(next) => { setForm(next); onForm(next); }}
      onClose={() => {}}
      onSave={() => {}}
    />
  );
}

describe('FoodEditDialog number boxes', () => {
  it('lets "0.5" be typed, and hands the parent a number', () => {
    const onForm = vi.fn();
    render(<Harness onForm={onForm} />);
    const fat = screen.getByLabelText('Fat');
    expect(fat).toHaveAttribute('inputmode', 'decimal');
    fireEvent.focus(fat);
    for (const v of ['0', '0.', '0.5']) {
      fireEvent.change(fat, { target: { value: v } });
      expect(fat).toHaveValue(v);
    }
    expect(onForm.mock.calls.at(-1)[0].fat_grams).toBe(0.5);
  });
});
