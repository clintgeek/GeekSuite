/** P2: a saved meal in the sitting was counted as 0 cal. L10/L11: Done, and no Undo all. */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SessionRibbon from '../SessionRibbon.jsx';

describe('SessionRibbon', () => {
  it('counts a saved meal by its total', () => {
    render(
      <SessionRibbon
        items={[
          { type: 'meal', name: 'Taco night', totalNutrition: { calories_per_serving: 650 }, logIds: ['m1', 'm2'] },
          { name: 'Egg', servings: 2, nutrition: { calories_per_serving: 70 }, logIds: ['e1'] }
        ]}
      />
    );
    expect(screen.getByText('790 cal')).toBeInTheDocument();
  });

  it('shows from the first item: "1 added to lunch", Undo last and Done — no Undo all', () => {
    const onDone = vi.fn();
    const onUndoLast = vi.fn();
    render(
      <SessionRibbon
        where="lunch"
        onDone={onDone}
        onUndoLast={onUndoLast}
        items={[{ name: 'Fage', servings: 1, nutrition: { calories_per_serving: 190 }, logIds: ['f1'] }]}
      />
    );
    expect(screen.getByText('1 added to lunch')).toBeInTheDocument();
    expect(screen.getByText('190 cal')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /undo all/i })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /undo last/i }));
    expect(onUndoLast).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
