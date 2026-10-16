/**
 * `/` on the food log (and the food search page) lands in the composer's box
 * — the page's main job (suite slash focus, @geeksuite/ui). An existing query
 * is selected so typing replaces it. (This was SearchBar's test; the box is
 * ComposerBox now.)
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SlashFocusProvider } from '@geeksuite/ui';
import ComposerBox from '../FoodSearch/ComposerBox.jsx';

const renderBar = (value = '') =>
  render(
    <SlashFocusProvider>
      <button type="button">elsewhere</button>
      <input aria-label="Adjust today" />
      <ComposerBox value={value} onChange={vi.fn()} />
    </SlashFocusProvider>
  );

describe('food search slash focus', () => {
  it('"/" focuses the food search box and selects the query', () => {
    renderBar('eggs');
    fireEvent.keyDown(screen.getByText('elsewhere'), { key: '/' });
    const box = screen.getByLabelText('Tell me what you ate');
    expect(box).toHaveFocus();
    expect([box.selectionStart, box.selectionEnd]).toEqual([0, 4]);
  });

  it('a "/" typed into another field stays there', () => {
    renderBar();
    const other = screen.getByLabelText('Adjust today');
    other.focus();
    fireEvent.keyDown(other, { key: '/' });
    expect(other).toHaveFocus();
  });
});
