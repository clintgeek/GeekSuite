import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { MemoryRouter } from 'react-router-dom';
import { createNoteTheme } from '../../../theme/createAppTheme';
import NewNoteSheet from '../../../components/new/NewNoteSheet';
import NewNoteMenu from '../../../components/new/NewNoteMenu';
import useImportStore from '../../../store/importStore';

/**
 * "Import a Markdown file" on the New surfaces (DOCS/CONTEXT.md §9). Both
 * render outside the toast provider, so they only ask the importer
 * (store/importStore.js) to open its picker — inside the tap.
 */
const theme = createNoteTheme('light');
const wrap = (ui) => render(
  <ThemeProvider theme={theme}><MemoryRouter>{ui}</MemoryRouter></ThemeProvider>,
);

let picker;
beforeEach(() => {
  picker = vi.fn();
  useImportStore.setState({ picker });
});
afterEach(() => useImportStore.setState({ picker: null }));

describe('the phone\'s New sheet', () => {
  it('offers "Import a Markdown file", which opens the picker and closes the sheet', () => {
    const onClose = vi.fn();
    wrap(<NewNoteSheet open onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /import a markdown file/i }));
    expect(picker).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('desktop\'s New menu', () => {
  it('offers "Import Markdown files", which opens the picker', () => {
    wrap(<NewNoteMenu />);
    fireEvent.click(screen.getByRole('button', { name: 'More kinds of note' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /import markdown files/i }));
    expect(picker).toHaveBeenCalledTimes(1);
  });
});
