import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';

vi.mock('../MyMeals.jsx', () => ({ default: ({ embedded }) => <div data-testid="p-meals">{String(embedded)}</div> }));
vi.mock('../MyFoods.jsx', () => ({ default: () => <div data-testid="p-foods" /> }));

import SavedFoods from '../SavedFoods.jsx';

const Where = () => <div data-testid="where">{useLocation().search}</div>;
const setup = (url) =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <SavedFoods />
      <Where />
    </MemoryRouter>,
  );
const only = async (id, other) => {
  expect(await screen.findByTestId(id)).toBeInTheDocument();
  expect(screen.queryByTestId(other)).toBeNull();
};

describe('SavedFoods', () => {
  it('defaults to Meals, embedded', async () => {
    setup('/saved-foods');
    await only('p-meals', 'p-foods');
    expect(screen.getByTestId('p-meals')).toHaveTextContent('true');
    expect(screen.getByRole('tablist', { name: 'Saved foods sections' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Meals' })).toHaveAttribute('aria-selected', 'true');
  });

  it('selects from ?tab=', async () => {
    setup('/saved-foods?tab=foods');
    await only('p-foods', 'p-meals');
    expect(screen.getByRole('tab', { name: 'Foods' })).toHaveAttribute('aria-selected', 'true');
  });

  it('falls back to Meals for an unknown tab', async () => {
    setup('/saved-foods?tab=nope');
    await only('p-meals', 'p-foods');
  });

  it('switching updates the URL, keeps other params, mounts only that page', async () => {
    setup('/saved-foods?q=pie');
    await only('p-meals', 'p-foods');
    await userEvent.click(screen.getByRole('tab', { name: 'Foods' }));
    await only('p-foods', 'p-meals');
    expect(screen.getByTestId('where').textContent).toContain('tab=foods');
    expect(screen.getByTestId('where').textContent).toContain('q=pie');
  });
});
