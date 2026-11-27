/**
 * More (DOCS/ONE_APP_PLAN.md §3): one list, the same for everybody —
 * Blood pressure, Medications, Saved foods, Calorie plan, Import a scan,
 * Settings — each a link to its page.
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import More from '../More.jsx';

describe('More', () => {
  it('lists the six places the tabs do not hold, in order, as links', () => {
    render(<MemoryRouter><More /></MemoryRouter>);
    const links = screen.getAllByRole('link');
    expect(links.map((l) => l.getAttribute('href'))).toEqual([
      '/blood-pressure', '/medications', '/saved-foods', '/calorie-wizard', '/scan-import', '/settings',
    ]);
    expect(screen.getByRole('link', { name: /Saved foods/ })).toHaveTextContent('Meals and foods you saved');
  });

  it('has no row for the pages that folded away, and no mode wording', () => {
    render(<MemoryRouter><More /></MemoryRouter>);
    for (const gone of [/look up a specific food/i, /^Reports/, /^Activity/, /Health dashboard/, /My meals/, /My foods/, /Food log/]) {
      expect(screen.queryByRole('link', { name: gone })).toBeNull();
    }
    expect(document.body.textContent).not.toMatch(/Simple|Full|Everything else/);
  });
});
