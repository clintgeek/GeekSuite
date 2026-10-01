import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { createNoteTheme } from '../../../theme/createAppTheme';

/**
 * The Fold-in sheet (DOCS/CONTEXT.md §13). What matters here:
 *   - nothing is written until Apply, and Apply sends ONLY the accepted ops,
 *     stripped of the gateway's own annotations
 *   - every change is shown in place, a correction as struck old + new text
 *   - dropped suggestions are disclosed and unplaced text is kept, with Copy
 *   - a failed proposal never reads as "nothing to add"
 *   - Undo restores the version the apply returned
 *
 * Apollo is mocked at the hook level (same pattern as noteEditorCompose).
 */

const preview = vi.fn();
const applyFn = vi.fn();
const clientQuery = vi.fn();
const clientMutate = vi.fn();
const notify = vi.fn();

vi.mock('@apollo/client', async () => {
  const actual = await vi.importActual('@apollo/client');
  return {
    ...actual,
    useMutation: (doc) => {
      const name = doc?.definitions?.[0]?.name?.value;
      const fn = { FoldInPreview: preview, FoldInApply: applyFn }[name] || vi.fn().mockResolvedValue({ data: {} });
      return [fn, { loading: false }];
    },
    useApolloClient: () => ({ query: clientQuery, mutate: clientMutate }),
  };
});

vi.mock('@geeksuite/ui', async () => {
  const actual = await vi.importActual('@geeksuite/ui');
  return { ...actual, useToast: () => ({ notify }) };
});

import FoldInSheet from '../../../components/foldin/FoldInSheet';

const theme = createNoteTheme('light');
const BASE = '2026-10-01T12:00:00.000Z';
const NOTE_CONTENT = '## Widow spiders\n\n- Black widow — orange hourglass\n- Red widow\n';
const FIND_AT = NOTE_CONTENT.indexOf('orange hourglass');

const OPS = [
  {
    __typename: 'FoldInOperation', id: 'op2', type: 'replace_text', why: 'the new info corrects it',
    find: 'orange hourglass', replace: 'red hourglass', reason: 'correction',
    location: 'In "## Widow spiders"', start: FIND_AT, end: FIND_AT + 'orange hourglass'.length, text: 'red hourglass',
    heading: null, markdown: null, anchor: null, items: null, tableHeaderRow: null, cells: null, afterHeading: null, level: null,
  },
  {
    __typename: 'FoldInOperation', id: 'op1', type: 'append_to_list', why: 'list of widows',
    anchor: 'Red widow', items: ['Brown widow — spiky egg sacs'],
    location: 'List under "## Widow spiders"', start: NOTE_CONTENT.length, end: NOTE_CONTENT.length, text: '- Brown widow — spiky egg sacs',
    heading: null, markdown: null, find: null, replace: null, reason: null, tableHeaderRow: null, cells: null, afterHeading: null, level: null,
  },
];

const proposal = (over = {}) => ({
  data: {
    foldInPreview: {
      operations: OPS,
      summary: 'Added the brown widow and corrected the hourglass.',
      unplaced: ['Saw one on the mailbox'],
      baseUpdatedAt: BASE,
      stats: {
        inputChars: 40, noteChars: NOTE_CONTENT.length, strategy: 'whole', sectionsTotal: 1, sectionsSent: 1, sentChars: 60,
        proposed: 4, valid: 2, failed: false, truncated: false,
        dropped: [{ index: 2, type: 'insert_after_heading', reason: 'anchor_not_found', detail: '' }, { index: 3, type: 'bogus', reason: 'malformed', detail: '' }],
      },
      provenance: { source: 'model', reason: null, model: 'openai/gpt-4.1-mini', provider: 'openrouter', cached: false, callsToday: 1, cap: 60 },
      ...over,
    },
  },
});

const SAVED = { id: 'n1', title: 'Spiders', content: `${NOTE_CONTENT}- Brown widow — spiky egg sacs\n`, type: 'markdown', tags: [], updatedAt: '2026-10-01T12:01:00.000Z' };

function renderSheet(props = {}) {
  return render(
    <ThemeProvider theme={theme}>
      <FoldInSheet open note={{ id: 'n1', title: 'Spiders', type: 'markdown' }} onClose={() => {}} {...props} />
    </ThemeProvider>
  );
}

const typeAndPropose = async (text = 'found a brown widow; the hourglass is red') => {
  fireEvent.change(screen.getByLabelText('New info'), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: 'Propose changes' }));
};

beforeEach(() => {
  preview.mockReset();
  applyFn.mockReset();
  clientQuery.mockReset();
  clientMutate.mockReset();
  notify.mockReset();
  clientQuery.mockResolvedValue({ data: { note: { id: 'n1', content: NOTE_CONTENT, updatedAt: BASE } } });
});

describe('FoldInSheet', () => {
  it('proposes with the note id and the text, and writes nothing', async () => {
    preview.mockResolvedValue(proposal());
    renderSheet();
    await typeAndPropose();
    await screen.findByRole('list', { name: 'Proposed changes' });
    expect(preview).toHaveBeenCalledWith({ variables: { noteId: 'n1', input: 'found a brown widow; the hourglass is red' } });
    expect(applyFn).not.toHaveBeenCalled();
    expect(clientMutate).not.toHaveBeenCalled();
  });

  it('shows each change where it lands, a correction struck through beside the new text', async () => {
    preview.mockResolvedValue(proposal());
    renderSheet();
    await typeAndPropose();
    const list = await screen.findByRole('list', { name: 'Proposed changes' });
    const cards = [...list.querySelectorAll('[data-foldin-card]')];
    expect(cards.map((c) => c.getAttribute('data-foldin-card'))).toEqual(['replace_text', 'append_to_list']);
    expect(within(cards[0]).getByText('In "## Widow spiders"')).toBeInTheDocument();
    expect(cards[0].querySelector('del').textContent).toBe('orange hourglass');
    expect(cards[0].querySelector('ins').textContent).toBe('red hourglass');
    expect(within(cards[1]).getByText('Brown widow — spiky egg sacs')).toBeInTheDocument();
  });

  it('discloses dropped suggestions and keeps unplaced text, with Copy', async () => {
    preview.mockResolvedValue(proposal());
    renderSheet();
    await typeAndPropose();
    expect(await screen.findByText(/2 suggestions didn't match the note and were left out/)).toBeInTheDocument();
    expect(screen.getByText('Couldn’t find a place for:')).toBeInTheDocument();
    expect(screen.getByText('Saw one on the mailbox')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Copy: Saw one on the mailbox/ })).toBeInTheDocument();
  });

  it('applies only the accepted changes, without the gateway annotations, then offers Undo', async () => {
    preview.mockResolvedValue(proposal());
    applyFn.mockResolvedValue({ data: { foldInApply: { note: SAVED, versionId: 'v9', applied: 1 } } });
    const onApplied = vi.fn();
    const onUndone = vi.fn();
    renderSheet({ onApplied, onUndone });
    await typeAndPropose();
    await screen.findByRole('list', { name: 'Proposed changes' });
    expect(screen.getByRole('button', { name: 'Apply 2 changes' })).toBeEnabled();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Include: In "## Widow spiders"' }));
    fireEvent.click(screen.getByRole('button', { name: 'Apply 1 change' }));

    await waitFor(() => expect(applyFn).toHaveBeenCalledTimes(1));
    expect(applyFn.mock.calls[0][0].variables).toEqual({
      noteId: 'n1',
      baseUpdatedAt: BASE,
      operations: [{ type: 'append_to_list', why: 'list of widows', anchor: 'Red widow', items: ['Brown widow — spiky egg sacs'] }],
    });
    await waitFor(() => expect(onApplied).toHaveBeenCalledWith({ note: SAVED, versionId: 'v9', applied: 1 }));
    const [message, opts] = notify.mock.calls.find(([m]) => /Folded in/.test(m));
    expect(message).toBe('Folded in 1 change.');

    clientMutate.mockResolvedValue({ data: { restoreNoteVersion: { id: 'n1', content: NOTE_CONTENT } } });
    render(<ThemeProvider theme={theme}>{opts.action}</ThemeProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(clientMutate).toHaveBeenCalledWith(expect.objectContaining({ variables: { versionId: 'v9' } })));
    await waitFor(() => expect(onUndone).toHaveBeenCalledWith({ id: 'n1', content: NOTE_CONTENT }));
  });

  it('a failed proposal says so and offers a retry, not an Apply', async () => {
    preview.mockResolvedValue(proposal({
      operations: [], unplaced: [], summary: '',
      stats: { ...proposal().data.foldInPreview.stats, failed: true, dropped: [], proposed: 0, valid: 0 },
      provenance: { source: 'fallback', reason: 'unavailable', model: null, provider: null, cached: false, callsToday: 1, cap: 60 },
    }));
    renderSheet();
    await typeAndPropose();
    expect(await screen.findByText(/Fold-in is unavailable right now/)).toBeInTheDocument();
    expect(screen.queryByText(/No changes to suggest/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Apply/ })).toBeNull();
  });

  it('waits for prepare (the editor flushing its save) before asking, and stops if it fails', async () => {
    preview.mockResolvedValue(proposal());
    const order = [];
    const prepare = vi.fn(async () => { order.push('prepare'); });
    preview.mockImplementation(async () => { order.push('preview'); return proposal(); });
    const { unmount } = renderSheet({ prepare });
    await typeAndPropose();
    await screen.findByRole('list', { name: 'Proposed changes' });
    expect(order).toEqual(['prepare', 'preview']);
    unmount();

    preview.mockClear();
    renderSheet({ prepare: async () => { throw new Error('Your latest edits are not saved yet.'); } });
    await typeAndPropose();
    expect(await screen.findByText('Your latest edits are not saved yet.')).toBeInTheDocument();
    expect(preview).not.toHaveBeenCalled();
  });

  it('a conflict on apply says so and offers to propose again', async () => {
    preview.mockResolvedValue(proposal());
    const err = Object.assign(new Error('conflict'), { graphQLErrors: [{ message: 'The note changed since these changes were proposed, and some no longer fit. Propose again.', extensions: { code: 'CONFLICT' } }] });
    applyFn.mockRejectedValue(err);
    renderSheet();
    await typeAndPropose();
    await screen.findByRole('list', { name: 'Proposed changes' });
    fireEvent.click(screen.getByRole('button', { name: 'Apply 2 changes' }));
    expect(await screen.findByText(/The note changed since/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Propose again' })).toBeInTheDocument();
  });

  it('previews the whole note with the changes marked, when the stored note is the one proposed against', async () => {
    preview.mockResolvedValue(proposal());
    renderSheet();
    await typeAndPropose();
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Preview the whole note' }));
    const region = screen.getByRole('region', { name: 'The whole note with the changes' });
    expect(region.querySelector('del').textContent).toBe('orange hourglass');
    expect([...region.querySelectorAll('ins')].map((n) => n.textContent)).toEqual(['red hourglass', '- Brown widow — spiky egg sacs\n']);
    expect(region.textContent.startsWith('## Widow spiders')).toBe(true);
  });

  it('offers no whole-note preview when the note moved on since the proposal', async () => {
    preview.mockResolvedValue(proposal());
    clientQuery.mockResolvedValue({ data: { note: { id: 'n1', content: 'something else', updatedAt: '2026-10-01T12:05:00.000Z' } } });
    renderSheet();
    await typeAndPropose();
    await screen.findByRole('list', { name: 'Proposed changes' });
    await waitFor(() => expect(clientQuery).toHaveBeenCalled());
    expect(screen.queryByRole('checkbox', { name: 'Preview the whole note' })).toBeNull();
  });

  it('refuses text over the ceiling before asking', () => {
    renderSheet();
    fireEvent.change(screen.getByLabelText('New info'), { target: { value: 'x'.repeat(12001) } });
    expect(screen.getByRole('button', { name: 'Propose changes' })).toBeDisabled();
    expect(screen.getByText(/Fold-in takes up to 12,000/)).toBeInTheDocument();
  });
});
