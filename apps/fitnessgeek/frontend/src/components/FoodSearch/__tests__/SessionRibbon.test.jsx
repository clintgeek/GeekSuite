/** P2: a saved meal in the sitting was counted as 0 cal. */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
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
    expect(screen.getByText('790 cal this sitting')).toBeInTheDocument();
  });
});
