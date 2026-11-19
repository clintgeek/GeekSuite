/**
 * No ripple (UX review 2026-11-18 #5). Material's ripple, caught mid-spread,
 * froze as a clipped grey blob behind "3 carried over" and "Done reordering".
 * The theme turns it off for every control; focus stays visible through the
 * suite's :focus-visible outline.
 */
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { Button, ButtonBase, IconButton } from '@mui/material';
import { createTodoTheme } from '../../theme/theme';

describe.each(['light', 'dark'])('Red Pen theme (%s): no ripple', (mode) => {
  it('draws no TouchRipple in a Button, a ButtonBase or an IconButton', () => {
    const { container } = render(
      <ThemeProvider theme={createTodoTheme(mode)}>
        <Button>Reorder</Button>
        <ButtonBase>3 carried over</ButtonBase>
        <IconButton aria-label="Help">?</IconButton>
      </ThemeProvider>,
    );
    fireEvent.mouseDown(screen.getByText('Reorder'));
    fireEvent.mouseDown(screen.getByText('3 carried over'));
    expect(container.querySelector('.MuiTouchRipple-root')).toBeNull();
  });
});
