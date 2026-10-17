/**
 * Review D-14: an over-target macro says so in words — "99 of 78g · 21 over"
 * — so the full bar's colour isn't carrying "over" on its own.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { createFitnessTheme } from '../../../theme/theme.jsx';
import MacroStrip from '../MacroStrip.jsx';

const renderStrip = (props) => render(
  <ThemeProvider theme={createFitnessTheme('light')}>
    <MacroStrip protein={{ current: 96, goal: 156 }} carbs={{ current: 120, goal: 200 }} fat={{ current: 99, goal: 78 }} {...props} />
  </ThemeProvider>
);

describe('MacroStrip over target', () => {
  it('says how far over, in words', () => {
    renderStrip();
    expect(screen.getByText('99 of 78g · 21 over')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Fat: 99 of 78 grams, 21 over' })).toBeInTheDocument();
  });

  it('under target says nothing extra', () => {
    renderStrip();
    expect(screen.getByText('96 of 156g')).toBeInTheDocument();
    expect(screen.queryByText(/Protein.*over/)).toBeNull();
  });
});

describe('MacroStrip colours (visual review B2)', () => {
  it('draws macros in the macro ramp, not the meal produce', () => {
    renderStrip();
    // Protein basil, Carbs cinnamon, Fat the muted ink — tomato/leaf/lemon mean meals.
    expect(screen.getByTestId('macro-fill-protein')).toHaveStyle({ backgroundColor: 'rgb(47, 107, 53)' });
    expect(screen.getByTestId('macro-fill-carbs')).toHaveStyle({ backgroundColor: 'rgb(138, 90, 60)' });
    expect(screen.getByTestId('macro-fill-fat')).toHaveStyle({ backgroundColor: 'rgb(107, 88, 71)' });
  });
});
