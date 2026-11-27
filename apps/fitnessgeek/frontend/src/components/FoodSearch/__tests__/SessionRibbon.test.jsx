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
    expect(screen.getByTestId('session-ribbon')).toHaveTextContent('790 cal');
  });

  it('shows from the first item: "Fage added to lunch", Undo and Done — no Undo all', () => {
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
    expect(screen.getByTestId('session-ribbon')).toHaveTextContent('Fage added to lunch');
    expect(screen.getByTestId('session-ribbon')).toHaveTextContent('190 cal');
    expect(screen.queryByRole('button', { name: /undo all/i })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /^undo$/i }));
    expect(onUndoLast).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('B7: names what it counts — "Egg ×2" for one entry, "2 foods" for more, and a copied meal by its foods', () => {
    const { rerender } = render(
      <SessionRibbon where="breakfast" items={[{ name: 'Egg', servings: 2, nutrition: { calories_per_serving: 72 }, logIds: ['e1'] }]} />
    );
    expect(screen.getByTestId('session-ribbon')).toHaveTextContent('Egg ×2 added to breakfast');
    rerender(
      <SessionRibbon
        where="breakfast"
        items={[
          { name: 'Egg', servings: 1, nutrition: { calories_per_serving: 72 }, logIds: ['e1'] },
          { name: 'Egg whites', servings: 1, nutrition: { calories_per_serving: 17 }, logIds: ['w1'] },
        ]}
      />
    );
    expect(screen.getByTestId('session-ribbon')).toHaveTextContent('2 foods added to breakfast');
    rerender(
      <SessionRibbon where="dinner" items={[{ type: 'household-meal', name: 'Sarah’s dinner', servings: 1, nutrition: { calories_per_serving: 631 }, logIds: ['s1', 's2', 's3'] }]} />
    );
    expect(screen.getByTestId('session-ribbon')).toHaveTextContent('3 foods added to dinner');
  });
});

// Review 2026-11-27, round three: "Greek Yogurt, Pla…" — one item's name was
// cut mid-word on a single line while the line under it wrapped freely.
describe('SessionRibbon: a long name wraps before it is cut', () => {
  it('the name may take a second line, breaking at a word, and only then is clamped', () => {
    render(
      <SessionRibbon
        where="lunch"
        onDone={() => {}}
        onUndoLast={() => {}}
        items={[{ name: 'Greek Yogurt, Plain Whole Milk', servings: 1, nutrition: { calories_per_serving: 190 }, logIds: ['f1'] }]}
      />
    );
    const what = screen.getByTestId('ribbon-what');
    expect(what).toHaveTextContent('Greek Yogurt, Plain Whole Milk');
    const style = getComputedStyle(what);
    expect(style.whiteSpace).not.toBe('nowrap');
    expect(style.textOverflow).not.toBe('ellipsis');
    expect(style.webkitLineClamp || style.getPropertyValue('-webkit-line-clamp')).toBe('2');
    expect(style.wordBreak).not.toBe('break-all');
  });
});
