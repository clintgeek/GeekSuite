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
  it('lists the four places the tabs do not hold, in order, as links', () => {
    render(<MemoryRouter><More /></MemoryRouter>);
    const links = screen.getAllByRole('link');
    expect(links.map((l) => l.getAttribute('href'))).toEqual([
      '/trends', '/saved-foods', '/calorie-wizard', '/settings',
    ]);
    expect(screen.getByRole('link', { name: /Saved foods/ })).toHaveTextContent('Meals and foods you saved');
  });

  it('every row has one short line under its name (short enough not to wrap at 390px)', () => {
    render(<MemoryRouter><More /></MemoryRouter>);
    // Import a scan is reached from Settings and the Weight page, not here.
    expect(screen.queryByRole('link', { name: /Import a scan/ })).toBeNull();
    expect(screen.getByRole('link', { name: /Settings/ })).toHaveTextContent('Text size, theme and your details');
    for (const link of screen.getAllByRole('link')) {
      const line = link.querySelectorAll('p')[1]?.textContent || '';
      expect(line.length).toBeGreaterThan(0);
      // ~34 characters of 15px Figtree fit beside the icon and chevron at 390px.
      expect(line.length).toBeLessThanOrEqual(34);
    }
  });

  it('has no row for the pages that folded away, and no mode wording', () => {
    render(<MemoryRouter><More /></MemoryRouter>);
    for (const gone of [/look up a specific food/i, /^Reports/, /^Activity/, /Health dashboard/, /My meals/, /My foods/, /Food log/]) {
      expect(screen.queryByRole('link', { name: gone })).toBeNull();
    }
    expect(document.body.textContent).not.toMatch(/Simple|Full|Everything else/);
  });
});
