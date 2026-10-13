// A meal card on Home is a link to that day's meal in the food log — the
// whole card, via a stretched link — while "Add" and remove stay their own
// buttons rather than nesting inside the link.

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import MealCards from '../MealCards.jsx';

const MEALS = { lunch: { calories: 640, foods: [{ logId: 'l1', name: 'Turkey chili', calories: 640 }] } };

describe('MealCards', () => {
  it('links each card to that day’s meal in the log', () => {
    render(<MemoryRouter><MealCards meals={MEALS} date="2026-10-13" onAdd={vi.fn()} onRemove={vi.fn()} /></MemoryRouter>);

    const link = screen.getByRole('link', { name: /open lunch in the food log/i });
    expect(link.getAttribute('href')).toBe('/food-log?date=2026-10-13&meal=lunch');
    // Add and remove are siblings of the link, not inside it.
    const add = screen.getByRole('button', { name: /add to lunch/i });
    const remove = screen.getByRole('button', { name: /remove turkey chili/i });
    expect(link.contains(add)).toBe(false);
    expect(link.contains(remove)).toBe(false);
  });

  it('is not a link when no date is given', () => {
    render(<MemoryRouter><MealCards meals={MEALS} onAdd={vi.fn()} /></MemoryRouter>);
    expect(screen.queryByRole('link')).toBeNull();
  });
});
