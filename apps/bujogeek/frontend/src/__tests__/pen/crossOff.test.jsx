/**
 * The signature: ticking fills the square red and draws the strike (a
 * hand-drawn SVG path, revealed by background-size); under
 * prefers-reduced-motion it is there at once, with no transition.
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { createBuJoTheme } from '../../theme/theme';

let reduced = false;
vi.mock('@geeksuite/ui', async () => {
  const actual = await vi.importActual('@geeksuite/ui');
  return { ...actual, useReducedMotion: () => reduced };
});
const { default: PenRow } = await import('../../components/pen/PenRow');
const { strikeImage } = await import('../../components/pen/penMarks');

const task = { id: 't1', content: 'Review the PR', status: 'completed', dueDate: '2026-09-29T00:00:00.000Z', tags: [] };
const mount = (props) => render(
  <ThemeProvider theme={createBuJoTheme('light')}>
    <ul><PenRow task={task} now={new Date(2026, 8, 29)} crossed onDone={vi.fn()} {...props} /></ul>
  </ThemeProvider>,
);
const words = (c) => c.querySelector('[data-words]');

afterEach(() => { reduced = false; });

describe('the cross-off', () => {
  it('draws the red strike and fills the square', () => {
    const { container } = mount();
    const style = getComputedStyle(words(container));
    expect(style.backgroundImage).toContain('data:image/svg+xml');
    expect(decodeURIComponent(style.backgroundImage)).toContain('stroke="#C8202A"');
    expect(style.backgroundSize).toBe('100% 100%');
    expect(screen.getByRole('checkbox')).toHaveAttribute('aria-checked', 'true');
  });

  it('animates the strike when motion is allowed', () => {
    const { container } = mount();
    expect(getComputedStyle(words(container)).transition).toContain('background-size');
  });

  it('is instant under prefers-reduced-motion', () => {
    reduced = true;
    const { container } = mount();
    expect(getComputedStyle(words(container)).transition).toBe('none');
    expect(getComputedStyle(words(container)).backgroundSize).toBe('100% 100%');
  });

  it('uses the lighter night red in dark mode', () => {
    expect(decodeURIComponent(strikeImage('#E85250'))).toContain('stroke="#E85250"');
  });
});
