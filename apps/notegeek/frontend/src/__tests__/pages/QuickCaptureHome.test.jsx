import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, within, fireEvent } from '@testing-library/react';
import { renderWithProviders } from '../testUtils';
import useOneOnOneStore from '../../store/oneOnOneStore';

/**
 * Home is built around capture: four start tiles, the typing box, and one
 * "Pick up where you left off" list (pinned notes first, as the server
 * returns them). No Pinned group, no select mode.
 */

const note = (id, title, extra = {}) => ({
  id,
  title,
  content: '',
  type: 'markdown',
  tags: [],
  pinned: false,
  createdAt: '2026-09-20T12:00:00.000Z',
  updatedAt: '2026-09-20T12:00:00.000Z',
  ...extra,
});

const { mockStore } = vi.hoisted(() => ({ mockStore: { notes: [], fetchNotes: vi.fn(), isLoadingList: false, createNote: vi.fn() } }));

vi.mock('../../store/noteStore', () => {
  const useStore = (selector) => (selector ? selector(mockStore) : mockStore);
  useStore.getState = () => mockStore;
  return { default: useStore };
});

const { toast } = vi.hoisted(() => ({ toast: { notify: vi.fn() } }));
vi.mock('@geeksuite/ui', async () => {
  const actual = await vi.importActual('@geeksuite/ui');
  return { ...actual, useToast: () => ({ notify: toast.notify, dismiss: vi.fn() }) };
});

import { useLocation } from 'react-router-dom';
import QuickCaptureHome from '../../pages/QuickCaptureHome';

function LocationProbe() {
  const loc = useLocation();
  return <span data-testid="probe">{loc.pathname + loc.search}</span>;
}

const reset = () => {
  mockStore.notes = [];
  mockStore.isLoadingList = false;
  mockStore.fetchNotes = vi.fn();
  mockStore.createNote = vi.fn();
};

describe('QuickCaptureHome — the list', () => {
  beforeEach(reset);

  it('lists pinned notes first in the one list, with no "Pinned" or "Recent" heading', () => {
    // The server sorts pinned notes first; Home just shows what it is given.
    mockStore.notes = [
      note('p1', 'Roof quote', { pinned: true }),
      note('n1', 'Groceries'),
      note('n2', 'Standup notes'),
    ];
    renderWithProviders(<QuickCaptureHome />);

    expect(screen.queryByRole('heading', { name: 'Pinned' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Recent' })).not.toBeInTheDocument();
    const section = screen.getByRole('heading', { name: 'Pick up where you left off' }).closest('section');
    expect(screen.getAllByText('Roof quote')).toHaveLength(1);
    const text = section.textContent;
    expect(text.indexOf('Roof quote')).toBeLessThan(text.indexOf('Groceries'));
    expect(text.indexOf('Groceries')).toBeLessThan(text.indexOf('Standup notes'));
    expect(within(section).getByRole('button', { name: /^Notes$/ })).toBeInTheDocument();
  });

  it('shows at most six rows', () => {
    mockStore.notes = Array.from({ length: 9 }, (_, i) => note(`n${i}`, `Note number ${i}`));
    renderWithProviders(<QuickCaptureHome />);
    expect(screen.getAllByText(/^Note number \d$/)).toHaveLength(6);
  });

  it('has no select mode', () => {
    mockStore.notes = [note('n1', 'Groceries')];
    renderWithProviders(<QuickCaptureHome />);
    expect(screen.queryByRole('button', { name: /select/i })).toBeNull();
  });
});

describe('QuickCaptureHome — the start tiles', () => {
  beforeEach(() => {
    reset();
    useOneOnOneStore.setState({ open: false });
  });

  const group = () => screen.getByRole('group', { name: 'Start a note' });
  const tile = (key) => group().querySelector(`[data-home-start="${key}"]`);

  it('offers Write, 1:1, Meeting and Photo, in that order', () => {
    renderWithProviders(<QuickCaptureHome />);
    expect(screen.getByTestId('home-starts')).toBe(group());
    const tiles = [...group().querySelectorAll('[data-home-start]')];
    expect(tiles.map((t) => t.getAttribute('data-home-start'))).toEqual(['handwritten', 'one-on-one', 'meeting', 'photo']);
    expect(tiles.map((t) => t.textContent)).toEqual(['Write', '1:1', 'Meeting', 'Photo']);
  });

  it('sends each tile where it says', () => {
    const { container } = renderWithProviders(
      <>
        <QuickCaptureHome />
        <LocationProbe />
      </>,
    );
    const where = () => container.querySelector('[data-testid="probe"]').textContent;
    fireEvent.click(tile('handwritten'));
    expect(where()).toBe('/notes/new?type=handwritten');
    fireEvent.click(tile('meeting'));
    expect(where()).toBe('/notes/new?type=handwritten&meeting=1');
    fireEvent.click(tile('photo'));
    expect(where()).toBe('/notes/photo');
  });

  it('opens the 1:1 person picker, and goes nowhere', () => {
    const { container } = renderWithProviders(
      <>
        <QuickCaptureHome />
        <LocationProbe />
      </>,
    );
    const before = container.querySelector('[data-testid="probe"]').textContent;
    expect(useOneOnOneStore.getState().open).toBe(false);
    fireEvent.click(tile('one-on-one'));
    expect(useOneOnOneStore.getState().open).toBe(true);
    expect(container.querySelector('[data-testid="probe"]').textContent).toBe(before);
  });

  it('leaves the box without Photo or Sketch shortcuts', () => {
    renderWithProviders(<QuickCaptureHome />);
    expect(screen.getByLabelText('Quick capture')).toHaveAttribute('placeholder', 'Type something down…');
    expect(screen.queryByRole('button', { name: 'New sketch' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'New note from a photo of a page' })).toBeNull();
  });

  it('fetches six notes, not twelve', () => {
    renderWithProviders(<QuickCaptureHome />);
    expect(mockStore.fetchNotes).toHaveBeenCalledWith({ limit: 6 });
  });

  it('describes the empty state in terms of Write', () => {
    renderWithProviders(<QuickCaptureHome />);
    expect(screen.getByText('Write starts a handwritten note. Or type a thought in the box and press Save.')).toBeInTheDocument();
  });
});

describe('QuickCaptureHome — Fold into a note', () => {
  beforeEach(() => {
    mockStore.notes = [];
    mockStore.isLoadingList = false;
    mockStore.fetchNotes = vi.fn();
    mockStore.createNote = vi.fn();
  });

  it('offers "Fold into an existing note" only once something is typed, and it opens the picker', async () => {
    renderWithProviders(<QuickCaptureHome />);
    expect(screen.queryByRole('button', { name: 'Fold into an existing note' })).toBeNull();
    fireEvent.change(screen.getByLabelText('Quick capture'), { target: { value: 'brown widow in the garage' } });
    fireEvent.click(screen.getByRole('button', { name: 'Fold into an existing note' }));
    expect(await screen.findByText('Fold into a note')).toBeInTheDocument();
    expect(screen.getByLabelText('Find a note')).toBeInTheDocument();
    // Picking is not saving: nothing was created.
    expect(mockStore.createNote).not.toHaveBeenCalled();
  });
});

describe('QuickCaptureHome — capture integrity (review 1.21, 3.5)', () => {
  beforeEach(() => {
    mockStore.notes = [];
    mockStore.isLoadingList = false;
    mockStore.listError = null;
    mockStore.selectedError = null;
    mockStore.fetchNotes = vi.fn();
    mockStore.createNote = vi.fn();
  });

  const box = () => screen.getByRole('textbox', { name: 'Quick capture' });

  it('keeps line breaks', async () => {
    mockStore.createNote = vi.fn().mockResolvedValue({ id: 'n9' });
    renderWithProviders(<QuickCaptureHome />);
    fireEvent.change(box(), { target: { value: 'groceries\n- milk\n- eggs\n' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await vi.waitFor(() => expect(mockStore.createNote).toHaveBeenCalledTimes(1));
    expect(mockStore.createNote.mock.calls[0][0].content).toBe('groceries\n- milk\n- eggs');
  });

  it('a double tap saves once', async () => {
    let resolve;
    mockStore.createNote = vi.fn(() => new Promise((r) => { resolve = r; }));
    renderWithProviders(<QuickCaptureHome />);
    fireEvent.change(box(), { target: { value: 'one thought' } });
    const save = screen.getByRole('button', { name: 'Save' });
    fireEvent.click(save);
    fireEvent.click(save);
    expect(mockStore.createNote).toHaveBeenCalledTimes(1);
    resolve({ id: 'n1' });
    await vi.waitFor(() => expect(box().value).toBe(''));
  });

  it('says so when the save fails, and keeps the text', async () => {
    mockStore.createNote = vi.fn().mockResolvedValue(null);
    mockStore.selectedError = 'Network down';
    renderWithProviders(<QuickCaptureHome />);
    fireEvent.change(box(), { target: { value: 'do not lose me' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await vi.waitFor(() => expect(toast.notify).toHaveBeenCalledWith(expect.stringMatching(/not saved — Network down/i), { tone: 'error' }));
    expect(box().value).toBe('do not lose me');
  });

  it('fetches only what it shows, and keeps cached notes on screen while refreshing', () => {
    mockStore.notes = [note('n1', 'Groceries')];
    mockStore.isLoadingList = true;
    const { container } = renderWithProviders(<QuickCaptureHome />);
    expect(mockStore.fetchNotes).toHaveBeenCalledWith({ limit: 6 });
    expect(screen.getByText('Groceries')).toBeInTheDocument();
    expect(container.querySelectorAll('.MuiSkeleton-root')).toHaveLength(0);
  });

  it('shows a failed load as an error, not "Nothing here yet"', () => {
    mockStore.listError = 'Failed to fetch notes';
    renderWithProviders(<QuickCaptureHome />);
    expect(screen.queryByText('Nothing here yet')).toBeNull();
    expect(screen.getByRole('button', { name: /retry|try again/i })).toBeInTheDocument();
  });
});
