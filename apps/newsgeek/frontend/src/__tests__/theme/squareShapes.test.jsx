/**
 * The Gazette is square (UX review 2026-11-18, finding 8): text fields,
 * selects and menus take the theme's 2px radius, not the suite's rounded
 * control — the shared MuiTextField rule (`& .MuiOutlinedInput-root`, two
 * classes) used to win over NewsGeek's one-class OutlinedInput override.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { Menu, MenuItem, TextField } from '@mui/material';
import { createNewsTheme } from '../../theme/theme';

describe.each(['light', 'dark'])('square shapes (%s)', (mode) => {
  const wrap = (ui) => render(<ThemeProvider theme={createNewsTheme(mode)}>{ui}</ThemeProvider>);

  it('a TextField’s outlined box is 2px, not the suite’s rounded control', () => {
    wrap(<TextField label="Feed URL" />);
    const root = screen.getByLabelText('Feed URL').closest('.MuiOutlinedInput-root');
    expect(getComputedStyle(root).borderRadius).toBe('2px');
  });

  it('a menu is a square slip with a hairline and no shadow', () => {
    wrap(
      <Menu open anchorEl={document.body}>
        <MenuItem>Open at publisher</MenuItem>
      </Menu>
    );
    const paper = screen.getByRole('menu').closest('.MuiPaper-root');
    const cs = getComputedStyle(paper);
    expect(cs.borderRadius).toBe('2px');
    expect(cs.boxShadow).toBe('none');
  });
});

describe('visually hidden text', () => {
  it('is a 1px box — a bare 1 in sx is 100%, a page-wide box that scrolled the page sideways', async () => {
    const { Box } = await import('@mui/material');
    const { visuallyHiddenSx } = await import('../../theme/theme');
    render(
      <ThemeProvider theme={createNewsTheme('light')}>
        <Box data-testid="hidden" sx={visuallyHiddenSx}>
          Everything
        </Box>
      </ThemeProvider>
    );
    const cs = getComputedStyle(screen.getByTestId('hidden'));
    expect(cs.width).toBe('1px');
    expect(cs.height).toBe('1px');
  });
});
