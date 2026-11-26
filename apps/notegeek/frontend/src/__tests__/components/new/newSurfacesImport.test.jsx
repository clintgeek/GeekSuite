import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { MemoryRouter } from 'react-router-dom';
import { createNoteTheme } from '../../../theme/createAppTheme';
import NewNoteSheet from '../../../components/new/NewNoteSheet';
import NewNoteMenu from '../../../components/new/NewNoteMenu';
import useImportStore from '../../../store/importStore';
import { VIEWPORTS, setViewport, restoreViewport } from '../../helpers/viewport';

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
afterEach(() => { useImportStore.setState({ picker: null }); restoreViewport(); });

describe('the phone\'s New sheet', () => {
  it('offers "Import a Markdown file", which opens the picker and closes the sheet', () => {
    const onClose = vi.fn();
    wrap(<NewNoteSheet open onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /import a markdown file/i }));
    expect(picker).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('the New sheet\'s first row', () => {
  const firstRow = () => within(screen.getByRole('list', { name: 'New' })).getAllByRole('listitem')[0];

  it('leads with "Write by hand" off a phone', () => {
    setViewport(VIEWPORTS.tabletPortrait);
    wrap(<NewNoteSheet open onClose={vi.fn()} />);
    expect(firstRow()).toHaveTextContent('Write by hand');
    expect(within(screen.getByRole('list', { name: 'New' })).getAllByRole('listitem')[1]).toHaveTextContent('Type a note');
  });

  it('leads with "Type a note" on a phone', () => {
    setViewport(VIEWPORTS.phone);
    wrap(<NewNoteSheet open onClose={vi.fn()} />);
    expect(firstRow()).toHaveTextContent('Type a note');
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
