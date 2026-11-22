import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { createNoteTheme } from '../../../theme/createAppTheme';
import NewNoteSheet from '../../../components/new/NewNoteSheet';
import NewNoteMenu from '../../../components/new/NewNoteMenu';
import { TemplateList } from '../../../components/new/TemplateList';
import { NOTE_TEMPLATES } from '../../../utils/noteTemplates';

/**
 * DOCS/TEMPLATES_SPEC.md N1 and N5 — "From a template" on the New surfaces:
 * the phone/tablet sheet (NewNoteSheet) and desktop's split-button menu
 * (NewNoteMenu). Picking one goes to the ordinary new-note route.
 */
const theme = createNoteTheme('light');

function Where() {
  const location = useLocation();
  return <div data-testid="where">{location.pathname + location.search}</div>;
}

const wrap = (ui) => render(
  <ThemeProvider theme={theme}><MemoryRouter>{ui}<Where /></MemoryRouter></ThemeProvider>,
);
const where = () => screen.getByTestId('where').textContent;
const LABELS = NOTE_TEMPLATES.map((t) => t.label);
const rowNames = () => within(screen.getByRole('list', { name: 'Templates' }))
  .getAllByRole('button').map((b) => b.querySelector('p').textContent);

describe('the template list', () => {
  it('offers exactly the eight, each with its one-line description', () => {
    wrap(<TemplateList onPick={() => {}} />);
    expect(rowNames()).toEqual([
      'Meeting notes', '1:1', 'Weekly review', 'Project brief',
      'Decision record', 'Troubleshooting log', 'Packing list', 'Recipe',
    ]);
    for (const t of NOTE_TEMPLATES) {
      const row = screen.getByRole('button', { name: new RegExp(`^${t.label}`) });
      expect(row).toHaveTextContent(t.description);
      expect(row.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    }
  });

  it('picks by click and by keyboard: rows are buttons, and the arrows move between them', () => {
    const onPick = vi.fn();
    wrap(<TemplateList onPick={onPick} autoFocus />);
    const rows = within(screen.getByRole('list', { name: 'Templates' })).getAllByRole('button');
    for (const row of rows) expect(row.tagName).toBe('BUTTON');
    // autoFocus: the first row has the caret as the list appears.
    expect(document.activeElement).toBe(rows[0]);
    fireEvent.keyDown(rows[0], { key: 'ArrowDown' });
    expect(document.activeElement).toBe(rows[1]);
    fireEvent.keyDown(rows[1], { key: 'End' });
    expect(document.activeElement).toBe(rows[7]);
    fireEvent.keyDown(rows[7], { key: 'ArrowDown' });
    expect(document.activeElement).toBe(rows[0]);
    fireEvent.keyDown(rows[0], { key: 'ArrowUp' });
    expect(document.activeElement).toBe(rows[7]);
    fireEvent.keyDown(rows[7], { key: 'Home' });
    expect(document.activeElement).toBe(rows[0]);
    // A native button: Enter and Space arrive as a click.
    fireEvent.click(rows[2]);
    expect(onPick).toHaveBeenCalledWith('weekly-review');
  });
});

describe('the New sheet (phone, and the tablet rail)', () => {
  it('offers "From a template" beside the kinds of note', () => {
    wrap(<NewNoteSheet open onClose={() => {}} />);
    const entry = screen.getByRole('button', { name: /^from a template/i });
    expect(entry).toHaveTextContent(/meeting notes, weekly review/i);
    // The existing entries are all still there, in their order.
    const keys = [...document.querySelectorAll('[data-new-entry]')].map((el) => el.dataset.newEntry);
    expect(keys.slice(0, 4)).toEqual(['markdown', 'photo', 'handwritten', 'template']);
    expect(keys).toContain('import');
  });

  it('turns the same sheet over to the templates, and back again', () => {
    const onClose = vi.fn();
    wrap(<NewNoteSheet open onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /^from a template/i }));
    expect(onClose).not.toHaveBeenCalled();
    expect(rowNames()).toEqual(LABELS);
    // The first template has the caret, so the keyboard carries straight on.
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /^meeting notes/i }));
    expect(screen.queryByRole('button', { name: /^new note/i })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /all kinds of note/i }));
    expect(screen.getByRole('button', { name: /^new note/i })).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Templates' })).toBeNull();
  });

  it('picking one closes the sheet and opens the new-note route with that template', () => {
    const onClose = vi.fn();
    wrap(<NewNoteSheet open onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /^from a template/i }));
    fireEvent.click(screen.getByRole('button', { name: /^troubleshooting log/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(where()).toBe('/notes/new?template=troubleshooting');
  });

  it('opens on the kinds of note again the next time, not on the templates', () => {
    const view = (open) => (
      <ThemeProvider theme={theme}><MemoryRouter><NewNoteSheet open={open} onClose={() => {}} /></MemoryRouter></ThemeProvider>
    );
    const { rerender } = render(view(true));
    fireEvent.click(screen.getByRole('button', { name: /^from a template/i }));
    expect(screen.getByRole('list', { name: 'Templates' })).toBeInTheDocument();
    rerender(view(false));
    rerender(view(true));
    expect(screen.getByRole('button', { name: /^new note/i })).toBeInTheDocument();
  });
});

describe('desktop\'s New menu', () => {
  it('offers "From a template…" as a menu item, reachable by keyboard', () => {
    wrap(<NewNoteMenu />);
    const more = screen.getByRole('button', { name: 'More kinds of note' });
    fireEvent.click(more);
    const item = screen.getByRole('menuitem', { name: /from a template/i });
    expect(item).toHaveAttribute('aria-haspopup', 'dialog');
    // It sits with the kinds of note, above Code / Mind map and Import.
    const keys = [...document.querySelectorAll('[role="menuitem"]')].map((el) => el.dataset.newEntry);
    expect(keys).toEqual(['photo', 'handwritten', 'template', 'code', 'mindmap', 'import']);
  });

  it('opens the picker in a dialog; picking one goes to the new-note route and closes it', async () => {
    wrap(<NewNoteMenu />);
    fireEvent.click(screen.getByRole('button', { name: 'More kinds of note' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /from a template/i }));
    const dialog = await screen.findByRole('dialog', { name: 'From a template' });
    expect(within(dialog).getAllByRole('button').filter((b) => b.dataset.template).map((b) => b.dataset.template))
      .toEqual(NOTE_TEMPLATES.map((t) => t.id));
    fireEvent.click(within(dialog).getByRole('button', { name: /^decision record/i }));
    expect(where()).toBe('/notes/new?template=decision-record');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'From a template' })).toBeNull());
  });

  it('Escape closes the picker without going anywhere', async () => {
    wrap(<NewNoteMenu />);
    fireEvent.click(screen.getByRole('button', { name: 'More kinds of note' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /from a template/i }));
    const dialog = await screen.findByRole('dialog', { name: 'From a template' });
    fireEvent.keyDown(within(dialog).getByRole('button', { name: /^recipe/i }), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'From a template' })).toBeNull());
    expect(where()).toBe('/');
  });

  it('the plain "New note" half still makes a plain note in one click', () => {
    wrap(<NewNoteMenu />);
    fireEvent.click(screen.getByRole('button', { name: 'New note' }));
    expect(where()).toBe('/notes/new');
  });
});
