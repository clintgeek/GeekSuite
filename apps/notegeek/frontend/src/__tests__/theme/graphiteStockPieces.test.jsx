/**
 * Review 2026-11-18 #7: stock Material pieces took Graphite's colours only
 * through the app theme — the blue "info" Alert and the default Switch.
 * Rendered, so the computed colours are what MUI actually draws.
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Alert, Switch } from '@mui/material';
import { ThemeProvider } from '@mui/material/styles';
import { createNoteTheme } from '../../theme/createAppTheme';
import { graphite } from '../../theme/graphite';

const hex = (rgb) => {
  const m = rgb.match(/\d+/g);
  return m ? `#${m.slice(0, 3).map((n) => Number(n).toString(16).padStart(2, '0')).join('')}`.toUpperCase() : rgb;
};

describe.each(['light', 'dark'])('Graphite stock pieces (%s)', (mode) => {
  const g = graphite[mode];
  const wrap = (ui) => render(<ThemeProvider theme={createNoteTheme(mode)}>{ui}</ThemeProvider>);

  it('an info Alert is ink on the sheet, not Material blue', () => {
    wrap(<Alert severity="info">Two lines were left out</Alert>);
    const style = getComputedStyle(screen.getByRole('alert'));
    expect(hex(style.backgroundColor)).toBe(g.sheet.toUpperCase());
    expect(hex(style.color)).toBe(g.ink.toUpperCase());
  });

  it('a Switch that is on lays ink on a highlighter track', () => {
    const { container } = wrap(<Switch checked onChange={() => {}} inputProps={{ 'aria-label': 'Finger draws' }} />);
    const track = container.querySelector('.MuiSwitch-track');
    const base = container.querySelector('.MuiSwitch-switchBase');
    expect(hex(getComputedStyle(track).backgroundColor)).toBe(g.hl.toUpperCase());
    expect(getComputedStyle(track).opacity).toBe('1');
    expect(hex(getComputedStyle(base).color)).toBe(g.onHl.toUpperCase());
  });
});
