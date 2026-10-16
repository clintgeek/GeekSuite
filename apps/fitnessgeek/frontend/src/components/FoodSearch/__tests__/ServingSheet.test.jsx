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
    expect(screen.getByText('1 serving = 3.5 oz')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'oz' }));
    const amount = screen.getByLabelText('oz');
    expect(amount).toHaveValue(3.5);

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
    expect(screen.getByLabelText('Servings')).toHaveValue(1);
  });
});
