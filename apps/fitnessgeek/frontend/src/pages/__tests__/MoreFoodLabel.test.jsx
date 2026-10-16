/**
 * More: the food search page is "Look up a specific food" (REVIEW_2026-10).
 * "Find a food" read as the way to log one; the way to log one is the meal
 * cards' Add now.
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import More from '../More.jsx';

describe('More', () => {
  it('calls the food search "Look up a specific food"', () => {
    render(<MemoryRouter><More /></MemoryRouter>);
    const link = screen.getByRole('link', { name: /look up a specific food/i });
    expect(link).toHaveAttribute('href', '/food-search');
    expect(screen.queryByText('Find a food')).toBeNull();
  });
});
