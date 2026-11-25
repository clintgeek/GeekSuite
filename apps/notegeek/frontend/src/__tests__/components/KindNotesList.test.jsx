import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import KindNotesList from '../../components/KindNotesList';

vi.mock('@geeksuite/user', () => ({
  useAppPreferences: vi.fn(() => ({ preferences: { oneOnOneTag: 'people' } })),
}));
vi.mock('../../components/notes/ListColumn', () => ({ default: ({ children }) => children, useListWidth: () => 720 }));
vi.mock('../../components/NoteList', () => ({
  default: (props) => <div data-testid="list">{JSON.stringify(props)}</div>,
}));

const listProps = (kind) => {
  render(<MemoryRouter><KindNotesList kind={kind} /></MemoryRouter>);
  return JSON.parse(screen.getByTestId('list').textContent);
};

describe('KindNotesList', () => {
  it('Notes: no dailies, meetings or 1:1s (the 1:1 tag from Settings), the usual list otherwise', () => {
    const props = listProps('notes');
    expect(props.notUnder).toEqual(['daily', 'meeting', 'people']);
    expect(props.under).toBeUndefined();
    expect(props.typeFilters).toBe(true);
    expect(props.defaultSort).toBe('updated');
    expect(screen.queryByTestId('kind-new')).toBeNull();
  });

  it('Meetings: the meeting tag, by day written, no type chips, New meeting at the top', () => {
    const props = listProps('meetings');
    expect(props.under).toBe('meeting');
    expect(props.notUnder).toBeUndefined();
    expect(props.typeFilters).toBe(false);
    expect(props.defaultSort).toBe('created');
    expect(screen.getByRole('link', { name: 'New meeting' })).toHaveAttribute('href', '/notes/new?type=handwritten&meeting=1');
  });

  it('Dailies: the daily tag, by day; nothing to start here (a day is written in GeekDay)', () => {
    const props = listProps('dailies');
    expect(props.under).toBe('daily');
    expect(props.defaultSort).toBe('created');
    expect(props.noun).toEqual(['day', 'days']);
    expect(screen.queryByTestId('kind-new')).toBeNull();
  });

  it('Everything: nothing left out', () => {
    const props = listProps('everything');
    expect(props.under).toBeUndefined();
    expect(props.notUnder).toBeUndefined();
    expect(props.typeFilters).toBe(true);
  });
});
