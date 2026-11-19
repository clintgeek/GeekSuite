/**
 * The swipe's word sits inside the strip the row has uncovered, whole or not
 * at all (UX review 2026-11-18 #8: at a short left swipe the moving row
 * covered the first letters and the label read "omorrow").
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { createTodoTheme } from '../../theme/theme';
import PenRow, { revealFits } from '../../components/pen/PenRow';
import { PrivacyProvider } from '../../context/PrivacyContext';

const now = new Date(2026, 8, 29, 10, 0);
const task = {
  id: 't1', content: 'Water the plants', status: 'pending', priority: null, note: null, tags: [],
  dueDate: '2026-09-29T00:00:00.000Z',
};

/** Hold a touch swipe of `dx` px on the row (no pointerup: the reveal stays). */
function hold(dx) {
  render(
    <ThemeProvider theme={createTodoTheme('light')}>
      <PrivacyProvider><ul><PenRow task={task} now={now} /></ul></PrivacyProvider>
    </ThemeProvider>,
  );
  const surface = screen.getByText('Water the plants').closest('button').parentElement;
  const at = (x) => ({ pointerType: 'touch', clientX: x, clientY: 100, pointerId: 1 });
  fireEvent.pointerDown(surface, at(300));
  fireEvent.pointerMove(surface, at(300 + dx / 2));
  fireEvent.pointerMove(surface, at(300 + dx));
  return document.querySelector('[data-swipe-reveal-strip]');
}

describe('swipe reveal label', () => {
  it('a short left swipe (past the action, short of room) shows the icon, not a clipped word', () => {
    const strip = hold(-90);
    expect(strip).not.toBeNull();
    expect(strip.style.width || getComputedStyle(strip).width).toBe('90px');
    expect(strip.textContent).toBe('');
    expect(strip.querySelector('svg')).not.toBeNull();
  });

  it('with room for the word but not the icon too, the word wins (the harness swipe, 110px)', () => {
    const strip = hold(-110);
    expect(strip.textContent).toBe('Tomorrow');
    expect(strip.querySelector('svg')).toBeNull();
  });

  it('once the strip has room, the whole word "Tomorrow" shows inside it', () => {
    const strip = hold(-140);
    expect(strip.textContent).toBe('Tomorrow');
    expect(getComputedStyle(strip).width).toBe('140px');
  });

  it('the long swipe has room for "Pick a date" from its first pixel', () => {
    expect(revealFits('Pick a date', 160)).toBe(true);
    expect(revealFits('Tomorrow', 90)).toBe(false);
  });
});
