/**
 * Review 2026-11-27 (scene 31a): "Bigger ~300" looked chosen while Calories
 * said 220, and the sheet had two save actions. The sizes and the Calories
 * box are one number now, and there is one filled button per view.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import FixSheet from '../FixSheet.jsx';

const ITEM = { logId: 'soup', name: 'Chicken soup, 1 bowl', calories: 220, nutrition: { calories_per_serving: 220 }, servings: 1, mealType: 'lunch', date: '2026-11-27', range: { low: 150, high: 300 } };
const open = (fixes = {}, onClose = vi.fn()) => {
  const all = { setCalories: vi.fn().mockResolvedValue(), redescribe: vi.fn().mockResolvedValue(), ...fixes };
  render(<FixSheet item={ITEM} onClose={onClose} fixes={all} />);
  return { fixes: all, onClose };
};
const pressed = () => screen.getAllByRole('button', { pressed: true }).map((b) => b.getAttribute('aria-label'));
const size = (key) => screen.getByTestId(`fix-size-${key}`);

describe('Fix sheet: the chosen size is the number in the box', () => {
  it('opens on "About right", which is what the box says', () => {
    open();
    expect(screen.getByLabelText('Calories')).toHaveValue('220');
    expect(pressed()).toEqual(['About right']);
    expect(size('bigger')).toHaveAttribute('aria-pressed', 'false');
    expect(size('smaller')).toHaveAttribute('aria-pressed', 'false');
  });

  it('a size fills the box and is the only one marked; it writes nothing yet', () => {
    const { fixes } = open();
    fireEvent.click(size('bigger'));
    expect(screen.getByLabelText('Calories')).toHaveValue('300');
    expect(pressed()).toEqual(['Bigger · ~300']);
    fireEvent.click(size('smaller'));
    expect(screen.getByLabelText('Calories')).toHaveValue('150');
    expect(pressed()).toEqual(['Smaller · ~150']);
    expect(fixes.setCalories).not.toHaveBeenCalled();
  });

  it('typing her own number un-marks every size', () => {
    open();
    fireEvent.change(screen.getByLabelText('Calories'), { target: { value: '275' } });
    expect(screen.queryAllByRole('button', { pressed: true })).toHaveLength(0);
    fireEvent.change(screen.getByLabelText('Calories'), { target: { value: '300' } });
    expect(pressed()).toEqual(['Bigger · ~300']);
  });
});

describe('Fix sheet: one filled button', () => {
  const filled = () => Array.from(document.querySelectorAll('.MuiButton-contained'));

  it('says what it will do: keep it, or save the new number', async () => {
    const { fixes, onClose } = open();
    expect(filled()).toHaveLength(1);
    expect(filled()[0]).toHaveTextContent('Keep 220 cal');
    fireEvent.click(size('smaller'));
    expect(filled()[0]).toHaveTextContent('Save 150 cal');
    fireEvent.click(filled()[0]);
    await waitFor(() => expect(fixes.setCalories).toHaveBeenCalledWith(ITEM, 150));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('"Keep" closes without writing', () => {
    const { fixes, onClose } = open();
    fireEvent.click(screen.getByTestId('fix-save'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(fixes.setCalories).not.toHaveBeenCalled();
  });

  it('"It was something else" is a link, and swaps the sheet to the one describe button', async () => {
    const { fixes } = open();
    expect(screen.queryByLabelText('It was actually…')).toBeNull();
    const link = screen.getByRole('button', { name: 'It was something else' });
    expect(link.className).not.toMatch(/MuiButton/);
    fireEvent.click(link);
    expect(screen.queryByLabelText('Calories')).toBeNull();
    expect(filled()).toHaveLength(1);
    expect(filled()[0]).toHaveTextContent('Log this instead');
    expect(filled()[0]).toBeDisabled();
    fireEvent.change(screen.getByLabelText('It was actually…'), { target: { value: 'tomato soup' } });
    fireEvent.click(filled()[0]);
    await waitFor(() => expect(fixes.redescribe).toHaveBeenCalledWith(ITEM, 'tomato soup', expect.any(String)));
  });

  it('a save that fails says so and keeps the number she chose', async () => {
    const { onClose } = open({ setCalories: vi.fn().mockRejectedValue(new Error('down')) });
    fireEvent.click(size('bigger'));
    fireEvent.click(screen.getByTestId('fix-save'));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Calories')).toHaveValue('300');
    expect(pressed()).toEqual(['Bigger · ~300']);
  });

  it('a number that is too high cannot be saved', () => {
    open();
    fireEvent.change(screen.getByLabelText('Calories'), { target: { value: '25000' } });
    expect(screen.getByTestId('fix-save')).toBeDisabled();
    expect(screen.getByText('That looks too high. Check the number.')).toBeInTheDocument();
  });
});

describe('Fix sheet: it is called "Change" (review 2026-11-27, round three)', () => {
  it('the title reads "Change <name>", matching the button that opened it', () => {
    open();
    expect(screen.getByRole('dialog', { name: /^Change Chicken soup, 1 bowl/ })).toBeInTheDocument();
    expect(screen.queryByText(/^Fix /)).toBeNull();
  });
});
