/**
 * PenLab (/labs/pen) — shows what a pen sends, and what penButton.js would do
 * with it. A diagnostic; this keeps it honest about the mapping it reports.
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { createNoteTheme } from '../../theme/createAppTheme';
import PenLab from '../../pages/PenLab';
import { penButtonTool } from '../../utils/penButton';

const show = () => render(<ThemeProvider theme={createNoteTheme('light')}><PenLab /></ThemeProvider>);
const press = (init) => fireEvent(screen.getByRole('application', { name: 'Pen test area' }), new PointerEvent('pointerdown', { bubbles: true, pointerType: 'pen', ...init }));
const firstRow = () => within(screen.getAllByRole('row')[1]).getAllByRole('cell').map((c) => c.textContent);

describe('PenLab', () => {
  it('lists each press with the fields penButton.js reads', () => {
    show();
    press({ button: 2, buttons: 2 });
    const cells = firstRow();
    expect(cells.slice(1, 5)).toEqual(['pointerdown', 'pen', '2', '2']);
    expect(cells[6]).toBe('eraser (side button)');
  });

  it("its verdict agrees with penButton.js for every case that module handles", () => {
    show();
    const cases = [
      [{ button: 2, buttons: 2 }, 'eraser'],
      [{ button: 0, buttons: 32 }, 'eraser'],
      [{ button: 1, buttons: 4 }, 'hand'],
      [{ button: 0, buttons: 1 }, null],
    ];
    for (const [init, tool] of cases) {
      press(init);
      const said = firstRow()[6];
      expect(penButtonTool({ pointerType: 'pen', ...init })).toBe(tool);
      expect(said.startsWith(tool === 'eraser' ? 'eraser' : tool === 'hand' ? 'scroll' : 'write')).toBe(true);
    }
  });

  it('a key press is listed too (a Bluetooth pen button can arrive as a key)', () => {
    show();
    fireEvent.keyDown(window, { key: 'PageDown', code: 'PageDown' });
    expect(firstRow().slice(1, 4)).toEqual(['keydown', 'PageDown', 'PageDown']);
  });
});
