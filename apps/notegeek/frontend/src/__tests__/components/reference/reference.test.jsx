import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { MemoryRouter } from 'react-router-dom';
import { createNoteTheme } from '../../../theme/createAppTheme';

/**
 * The reference pane (DOCS/REFERENCE_PANE_SPEC.md): a second note, read-only,
 * above the one being written.
 *
 * What matters here:
 *   - the divider rests at a third or half, and closes when let go near the top
 *   - the picker offers a person's earlier 1:1s first, then recents, and never
 *     the note being written
 *   - the pane only READS: the two queries it runs are the note and its
 *     transcript, and it calls no mutation at all
 *   - opening and closing never remounts the note under the pen
 *
 * Apollo is mocked at the hook level; the tldraw viewer is a stub (the real
 * canvas is exercised by the harness, scenes 26a–26c).
 */

const queries = vi.fn();
const mutations = vi.fn();
const store = vi.hoisted(() => ({ byOp: {} }));

vi.mock('@apollo/client', async () => {
  const actual = await vi.importActual('@apollo/client');
  return {
    ...actual,
    useQuery: (doc, opts = {}) => {
      const name = doc?.definitions?.[0]?.name?.value;
      if (opts.skip) return { data: undefined, loading: false, error: undefined };
      queries(name, opts.variables);
      const answer = store.byOp[name];
      const data = typeof answer === 'function' ? answer(opts.variables) : answer;
      return { data, loading: false, error: undefined };
    },
    useMutation: (doc) => {
      mutations(doc?.definitions?.[0]?.name?.value);
      return [vi.fn(), { loading: false }];
    },
  };
});

vi.mock('../../../components/reference/SketchReference', () => ({
  default: ({ content }) => <div data-testid="reference-sketch" data-content={content} />,
}));

vi.mock('../../../hooks/useNoteLinks', async () => {
  const actual = await vi.importActual('../../../hooks/useNoteLinks');
  return { ...actual, useNoteLinks: () => () => null };
});

import {
  SPLIT_DEFAULT, SPLIT_MAX, fractionAt, settleFraction, stepFraction,
} from '../../../components/reference/referenceSplit';
import ReferencePane from '../../../components/reference/ReferencePane';
import ReferencePicker, { referenceSections } from '../../../components/reference/ReferencePicker';
import { RECENT_NOTES_KEY, RECENT_NOTES_MAX, forgetOpened, recentlyOpened, rememberOpened } from '../../../utils/recentNotes';

const theme = createNoteTheme('light');
const wrap = (ui) => render(<ThemeProvider theme={theme}><MemoryRouter>{ui}</MemoryRouter></ThemeProvider>);

const BOSS = { id: 'boss', title: '2026-11-20 Dana 1:1', type: 'handwritten', content: '{"store":{}}', tags: ['fd/1on1/dana'] };
const TYPED = { id: 'typed', title: 'Promo packet', type: 'markdown', content: '# Packet\n\nDue **Friday**.', tags: [] };

beforeEach(() => {
  queries.mockClear();
  mutations.mockClear();
  window.localStorage.clear();
  store.byOp = {
    GetNoteById: ({ id }) => ({ note: { boss: BOSS, typed: TYPED }[id] || null }),
    SketchTranscript: () => ({ sketchTranscript: { text: 'Kin needs the rotation plan by Friday' } }),
    GetNotes: ({ tag }) => ({
      notes: tag
        ? [
          { id: 'k1', title: '2026-11-10 Kin 1:1', type: 'handwritten', createdAt: '2026-11-10T15:00:00Z' },
          { id: 'k2', title: '2026-11-17 Kin 1:1', type: 'handwritten', createdAt: '2026-11-17T15:00:00Z' },
          { id: 'now', title: '2026-11-24 Kin 1:1', type: 'handwritten', createdAt: '2026-11-24T15:00:00Z' },
        ]
        : [
          { id: 'typed', title: 'Promo packet', type: 'markdown', updatedAt: '2026-11-23T10:00:00Z' },
          { id: 'now', title: '2026-11-24 Kin 1:1', type: 'handwritten', updatedAt: '2026-11-24T15:00:00Z' },
        ],
    }),
    SearchNotes: ({ q }) => ({ searchNotes: q === 'dana' ? [{ _id: 'boss', title: BOSS.title, type: 'handwritten' }] : [] }),
  };
});

describe('the divider', () => {
  it('opens at a third', () => {
    expect(SPLIT_DEFAULT).toBeCloseTo(1 / 3);
  });

  it('rests at a third or half, whichever is nearer', () => {
    expect(settleFraction(0.3)).toBeCloseTo(1 / 3);
    expect(settleFraction(0.4)).toBeCloseTo(1 / 3);
    expect(settleFraction(0.45)).toBe(0.5);
    expect(settleFraction(0.6)).toBe(0.5);
  });

  it('closes when let go near the top', () => {
    expect(settleFraction(0.1)).toBeNull();
    expect(settleFraction(0)).toBeNull();
    expect(settleFraction(NaN)).toBeNull();
  });

  it('follows the pointer, but never takes more than the cap', () => {
    expect(fractionAt(300, 100, 800)).toBeCloseTo(0.25);
    expect(fractionAt(2000, 100, 800)).toBe(SPLIT_MAX);
    expect(fractionAt(0, 100, 800)).toBe(0);
  });

  it('steps between the rests from the keyboard, and closes past the first', () => {
    expect(stepFraction(1 / 3, 1)).toBe(0.5);
    expect(stepFraction(0.5, 1)).toBe(0.5);
    expect(stepFraction(0.5, -1)).toBeCloseTo(1 / 3);
    expect(stepFraction(1 / 3, -1)).toBeNull();
  });
});

describe('notes opened on this device', () => {
  it('keeps the newest first, once each, and only so many', () => {
    for (let i = 0; i < RECENT_NOTES_MAX + 3; i += 1) rememberOpened({ id: `n${i}`, title: `Note ${i}`, type: 'markdown' });
    rememberOpened({ id: 'n5', title: 'Note 5 renamed', type: 'markdown' });
    const list = recentlyOpened();
    expect(list).toHaveLength(RECENT_NOTES_MAX);
    expect(list[0]).toMatchObject({ id: 'n5', title: 'Note 5 renamed' });
    expect(list.filter((n) => n.id === 'n5')).toHaveLength(1);
  });

  it('ignores a note with no id yet, and survives a broken store', () => {
    rememberOpened({ id: 'new', title: 'x' });
    rememberOpened(null);
    expect(recentlyOpened()).toEqual([]);
    window.localStorage.setItem(RECENT_NOTES_KEY, '{not json');
    expect(recentlyOpened()).toEqual([]);
  });

  it('forgets a note', () => {
    rememberOpened({ id: 'a', title: 'A' });
    rememberOpened({ id: 'b', title: 'B' });
    forgetOpened('a');
    expect(recentlyOpened().map((n) => n.id)).toEqual(['b']);
  });
});

describe('what the picker offers', () => {
  it("lists a person's earlier 1:1s first, newest first, then recents, and never the open note", () => {
    const sections = referenceSections({
      currentId: 'now',
      person: { tag: 'fd/1on1/kin', name: 'Kin' },
      personNotes: store.byOp.GetNotes({ tag: 'fd/1on1/kin' }).notes,
      opened: [{ id: 'boss', title: BOSS.title, type: 'handwritten', at: 5 }, { id: 'k2', title: 'dup', type: 'handwritten' }],
      edited: store.byOp.GetNotes({}).notes,
    });
    expect(sections.map((s) => s.key)).toEqual(['person', 'recent']);
    expect(sections[0].label).toBe('Earlier 1:1s with Kin');
    expect(sections[0].rows.map((r) => r.id)).toEqual(['k2', 'k1']);
    // Opened on this device first, then recently edited; no repeats, not the open note.
    expect(sections[1].rows.map((r) => r.id)).toEqual(['boss', 'typed']);
  });

  it('has no person section outside a 1:1', () => {
    const sections = referenceSections({ currentId: 'now', edited: store.byOp.GetNotes({}).notes });
    expect(sections.map((s) => s.key)).toEqual(['recent']);
  });

  it('shows the sections, and picking a row hands back its id', async () => {
    rememberOpened(BOSS);
    const onPick = vi.fn();
    wrap(<ReferencePicker open onClose={() => {}} onPick={onPick} currentNoteId="now" person={{ tag: 'fd/1on1/kin', name: 'Kin' }} />);
    expect(screen.getByText('Earlier 1:1s with Kin')).toBeInTheDocument();
    expect(screen.queryByText('2026-11-24 Kin 1:1')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText(BOSS.title));
    expect(onPick).toHaveBeenCalledWith('boss');
    expect(queries).toHaveBeenCalledWith('GetNotes', expect.objectContaining({ tag: 'fd/1on1/kin' }));
  });

  it('searches every note once something is typed', async () => {
    vi.useFakeTimers();
    try {
      wrap(<ReferencePicker open onClose={() => {}} onPick={() => {}} currentNoteId="now" />);
      fireEvent.change(screen.getByLabelText('Search all notes'), { target: { value: 'dana' } });
      await act(async () => { vi.advanceTimersByTime(250); });
      expect(queries).toHaveBeenCalledWith('SearchNotes', { q: 'dana' });
      expect(screen.getByText(BOSS.title)).toBeInTheDocument();
      expect(screen.queryByText('Recent')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('asks nothing while closed', () => {
    wrap(<ReferencePicker open={false} onClose={() => {}} onPick={() => {}} />);
    expect(queries).not.toHaveBeenCalled();
  });
});

describe('the pane', () => {
  const Page = ({ onMount }) => {
    React.useEffect(() => { onMount(); }, [onMount]);
    return <div data-testid="the-note">the note being written</div>;
  };

  it('renders only the note when closed', () => {
    wrap(<ReferencePane noteId={null} onClose={() => {}}><div data-testid="the-note" /></ReferencePane>);
    expect(screen.getByTestId('the-note')).toBeInTheDocument();
    expect(screen.queryByTestId('reference-pane')).not.toBeInTheDocument();
    expect(queries).not.toHaveBeenCalled();
  });

  it('opening and closing never remounts the note under the pen', () => {
    const mounted = vi.fn();
    const ui = (id) => (
      <ThemeProvider theme={theme}><MemoryRouter>
        <ReferencePane noteId={id} onClose={() => {}}><Page onMount={mounted} /></ReferencePane>
      </MemoryRouter></ThemeProvider>
    );
    const { rerender } = render(ui(null));
    rerender(ui('typed'));
    rerender(ui(null));
    rerender(ui('boss'));
    expect(mounted).toHaveBeenCalledTimes(1);
  });

  it('shows a typed note as text that cannot be edited', () => {
    wrap(<ReferencePane noteId="typed" onClose={() => {}}><div /></ReferencePane>);
    const body = screen.getByTestId('reference-text');
    expect(within(body).getByText('Friday')).toBeInTheDocument();
    expect(body.querySelector('textarea, input, [contenteditable="true"]')).toBeNull();
    expect(screen.getByTestId('reference-title')).toHaveTextContent('Promo packet');
    expect(screen.queryByTestId('reference-transcript')).not.toBeInTheDocument();
  });

  it('shows a handwritten note as its handwriting first, with a switch to the transcript', async () => {
    wrap(<ReferencePane noteId="boss" onClose={() => {}}><div /></ReferencePane>);
    await waitFor(() => expect(screen.getByTestId('reference-sketch')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('reference-transcript'));
    expect(screen.getByTestId('reference-text')).toHaveTextContent('Kin needs the rotation plan by Friday');
    expect(screen.queryByTestId('reference-sketch')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('reference-transcript'));
    await waitFor(() => expect(screen.getByTestId('reference-sketch')).toBeInTheDocument());
  });

  it('offers no transcript switch when the page has not been read', async () => {
    store.byOp.SketchTranscript = () => ({ sketchTranscript: { text: '' } });
    wrap(<ReferencePane noteId="boss" onClose={() => {}}><div /></ReferencePane>);
    await waitFor(() => expect(screen.getByTestId('reference-sketch')).toBeInTheDocument());
    expect(screen.queryByTestId('reference-transcript')).not.toBeInTheDocument();
  });

  it('only reads: the note and its transcript, and no mutation', async () => {
    wrap(<ReferencePane noteId="boss" onClose={() => {}}><div /></ReferencePane>);
    await waitFor(() => expect(screen.getByTestId('reference-sketch')).toBeInTheDocument());
    expect([...new Set(queries.mock.calls.map((c) => c[0]))].sort()).toEqual(['GetNoteById', 'SketchTranscript']);
    expect(mutations).not.toHaveBeenCalled();
  });

  it('closes, changes and opens in full from the bar', () => {
    const onClose = vi.fn();
    const onChange = vi.fn();
    const onOpenFull = vi.fn();
    wrap(<ReferencePane noteId="typed" onClose={onClose} onChange={onChange} onOpenFull={onOpenFull}><div /></ReferencePane>);
    fireEvent.click(screen.getByTestId('reference-open'));
    expect(onOpenFull).toHaveBeenCalledWith('typed');
    fireEvent.click(screen.getByTestId('reference-change'));
    expect(onChange).toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('reference-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('steps to half and back from the keyboard, then closes', () => {
    const onClose = vi.fn();
    wrap(<ReferencePane noteId="typed" onClose={onClose}><div /></ReferencePane>);
    const divider = screen.getByTestId('reference-divider');
    expect(divider).toHaveAttribute('aria-valuenow', '33');
    fireEvent.keyDown(divider, { key: 'ArrowDown' });
    expect(divider).toHaveAttribute('aria-valuenow', '50');
    fireEvent.keyDown(divider, { key: 'ArrowUp' });
    expect(divider).toHaveAttribute('aria-valuenow', '33');
    fireEvent.keyDown(divider, { key: 'ArrowUp' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('says so when the note is gone', () => {
    wrap(<ReferencePane noteId="missing" onClose={() => {}}><div /></ReferencePane>);
    expect(screen.getByText('This note is no longer there.')).toBeInTheDocument();
  });
});
