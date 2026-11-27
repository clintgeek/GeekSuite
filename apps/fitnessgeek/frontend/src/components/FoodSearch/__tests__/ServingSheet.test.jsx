import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ServingSheet from '../ServingSheet.jsx';

const chicken = {
  name: 'Chicken breast',
  serving: { size: 100, unit: 'g' },
  nutrition: { calories_per_serving: 165, protein_grams: 31, carbs_grams: 0, fat_grams: 3.6 },
};

describe('ServingSheet in US units', () => {
  it('logs a weighed food by the ounce', () => {
    const onConfirm = vi.fn();
    render(<ServingSheet open food={chicken} onClose={() => {}} onConfirm={onConfirm} />);
    expect(screen.getByText('1 serving is about 3.5 oz')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'oz' }));
    const amount = screen.getByLabelText('oz');
    expect(amount).toHaveValue('3.5');

    fireEvent.change(amount, { target: { value: '6' } });
    expect(screen.getByText('281 cal')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Log it' }));
    expect(onConfirm.mock.calls[0][0].servings).toBeCloseTo(1.701, 3);
  });

  it('offers no unit switch for a food without a weight', () => {
    render(
      <ServingSheet
        open
        food={{ name: 'Toast', serving: { size: 1, unit: 'slice' }, nutrition: { calories_per_serving: 80 } }}
        onClose={() => {}}
      />
    );
    expect(screen.queryByRole('button', { name: 'oz' })).toBeNull();
    expect(screen.getByLabelText('Servings')).toHaveValue('1');
  });
});

/**
 * B11: typing the "0" of "0.5" used to blank the field, and an empty field
 * logged one serving. Heather has never logged anything but 1 serving.
 */
describe('typing an amount', () => {
  const toast = { name: 'Toast', serving: { size: 1, unit: 'slice' }, nutrition: { calories_per_serving: 80 } };

  it('keeps "0", "0." and "0.5" as typed, and logs half a serving', () => {
    const onConfirm = vi.fn();
    render(<ServingSheet open food={toast} onClose={() => {}} onConfirm={onConfirm} />);
    const amount = screen.getByLabelText('Servings');
    for (const v of ['0', '0.', '0.5']) {
      fireEvent.change(amount, { target: { value: v } });
      expect(amount).toHaveValue(v);
    }
    expect(screen.getByText('40 cal')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Log it' }));
    expect(onConfirm.mock.calls[0][0].servings).toBe(0.5);
  });

  it('accepts a leading ".5"', () => {
    const onConfirm = vi.fn();
    render(<ServingSheet open food={toast} onClose={() => {}} onConfirm={onConfirm} />);
    fireEvent.change(screen.getByLabelText('Servings'), { target: { value: '.5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log it' }));
    expect(onConfirm.mock.calls[0][0].servings).toBe(0.5);
  });

  it('will not log an empty or zero amount as one serving', () => {
    const onConfirm = vi.fn();
    render(<ServingSheet open food={toast} onClose={() => {}} onConfirm={onConfirm} />);
    const amount = screen.getByLabelText('Servings');
    const logIt = screen.getByRole('button', { name: 'Log it' });

    fireEvent.change(amount, { target: { value: '' } });
    fireEvent.blur(amount);
    expect(logIt).toBeDisabled();
    fireEvent.change(amount, { target: { value: '0' } });
    expect(logIt).toBeDisabled();
    fireEvent.click(logIt);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('brings up the decimal keypad', () => {
    render(<ServingSheet open food={toast} onClose={() => {}} onConfirm={() => {}} />);
    expect(screen.getByLabelText('Servings')).toHaveAttribute('inputmode', 'decimal');
  });
});

/** P2: Android's back gesture closes the sheet instead of leaving the page. */
describe('the back gesture', () => {
  const toast = { name: 'Toast', serving: { size: 1, unit: 'slice' }, nutrition: { calories_per_serving: 80 } };

  it('closes the sheet', () => {
    const onClose = vi.fn();
    render(<ServingSheet open food={toast} onClose={onClose} onConfirm={() => {}} />);
    // The sheet owns the entry on top of history…
    expect(window.history.state?.fgSheets?.length).toBeGreaterThan(0);
    // …and back, landing on a state without it, closes it.
    window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

// Review 2026-11-27, round three: "Change Egg" over "1 serving = 1.8 oz" read
// like a settings screen. The sheet asks its question in words.
describe('ServingSheet asks "How much?"', () => {
  const egg = { name: 'Egg', serving: { size: 50, unit: 'g' }, nutrition: { calories_per_serving: 72 } };

  it('adding: "How much Egg?", the hint in a sentence, and Log it', () => {
    render(<ServingSheet open food={egg} onClose={() => {}} onConfirm={() => {}} />);
    expect(screen.getByText('How much Egg?')).toBeInTheDocument();
    expect(screen.getByText('1 serving is about 1.8 oz')).toBeInTheDocument();
    expect(screen.queryByText(/1 serving =/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Log it' })).toBeInTheDocument();
  });

  it('changing one already added: the same question, opened on what was logged, with Save', () => {
    render(<ServingSheet open food={egg} editing={{ servings: 2 }} onClose={() => {}} onConfirm={() => {}} />);
    expect(screen.getByText('How much Egg?')).toBeInTheDocument();
    expect(screen.queryByText(/^Change /)).toBeNull();
    expect(screen.getByLabelText('Servings')).toHaveValue('2');
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });
});
