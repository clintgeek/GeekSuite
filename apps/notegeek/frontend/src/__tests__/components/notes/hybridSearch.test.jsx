import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../../testUtils';
import NoteRow from '../../../components/notes/NoteRow';
import RelatedNotes from '../../../components/notes/RelatedNotes';
import { RELATED_NOTES } from '../../../graphql/queries';

/**
 * Hybrid search (DOCS/CONTEXT.md §11): a row found by MEANING carries a quiet
 * "similar" mark, shows the passage that matched and highlights nothing —
 * the typed words are not in it, and a row with no marks and no explanation
 * reads as a bug. Related notes sit under a note, and vanish when empty or
 * unavailable.
 */

const row = (extra = {}) => ({
  _id: 'n1',
  title: 'Chamberlain opener',
  type: 'markdown',
  tags: [],
  snippet: 'The opener needs a new remote battery.',
  createdAt: '2026-09-20T12:00:00.000Z',
  updatedAt: '2026-09-20T12:00:00.000Z',
  ...extra,
});

describe('NoteRow — how a search hit matched', () => {
  it('a meaning hit is marked "similar", shows why, and highlights nothing', () => {
    const { container } = renderWithProviders(
      // "opener" IS in the title: substring highlighting would mark it, but a
      // meaning hit is not what the words found, so nothing is marked.
      <NoteRow note={row({ matchedBy: 'meaning', why: 'the remote battery is a CR2032' })} query="opener" />,
    );
    expect(screen.getByText('similar')).toHaveAttribute('data-match', 'meaning');
    expect(screen.getByText('the remote battery is a CR2032')).toBeInTheDocument();
    expect(container.querySelectorAll('mark')).toHaveLength(0);
  });

  it('a meaning hit with no passage falls back to the snippet', () => {
    renderWithProviders(<NoteRow note={row({ matchedBy: 'meaning', why: null })} query="garage" />);
    expect(screen.getByText('The opener needs a new remote battery.')).toBeInTheDocument();
  });

  it.each(['keyword', 'both', null])('a %s hit highlights the typed words and is not marked', (matchedBy) => {
    const { container } = renderWithProviders(
      <NoteRow note={row({ matchedBy, why: 'ignored passage' })} query="opener" />,
    );
    expect(screen.queryByText('similar')).not.toBeInTheDocument();
    expect(screen.queryByText('ignored passage')).not.toBeInTheDocument();
    expect(container.querySelectorAll('mark').length).toBeGreaterThanOrEqual(2);
  });
});

describe('NoteRow — multi-word queries', () => {
  it('marks each word of the query, not only the whole phrase', () => {
    const { container } = renderWithProviders(
      <NoteRow note={row({ title: 'Garage shelving', snippet: 'Fix the brackets.', matchedBy: 'both' })} query="fix the garage" />,
    );
    const marks = [...container.querySelectorAll('mark')].map((m) => m.textContent);
    expect(marks).toEqual(['Garage', 'Fix']);
  });

  it('highlightTerms drops short words and stop words, keeps a short query whole', async () => {
    const { highlightTerms } = await import('../../../utils/highlightTerms');
    expect(highlightTerms('fix the garage')).toEqual(['fix', 'garage']);
    expect(highlightTerms('go')).toEqual(['go']);
    expect(highlightTerms('  ')).toEqual([]);
  });
});

const relatedMock = (relatedNotes, extra = {}) => ({
  request: { query: RELATED_NOTES, variables: { noteId: 'me', limit: 5 } },
  ...(relatedNotes instanceof Error ? { error: relatedNotes } : { result: { data: { relatedNotes } } }),
  ...extra,
});
const near = (id, title, snippet = null) => ({ id, title, type: 'markdown', updatedAt: '2026-09-20T12:00:00.000Z', score: 0.7, snippet });

describe('RelatedNotes', () => {
  it('lists the nearest notes as links, under a "Related notes" heading', async () => {
    renderWithProviders(<RelatedNotes noteId="me" />, {
      mocks: [relatedMock([near('a', 'Garage remote', 'new battery'), near('b', 'Shed door')])],
    });
    const heading = await screen.findByRole('heading', { name: 'Related notes' });
    const section = heading.closest('section');
    expect(section).toHaveAttribute('data-related-notes');
    const links = screen.getAllByRole('link');
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['/notes/a', '/notes/b']);
    expect(screen.getByText('new battery')).toBeInTheDocument();
    expect(screen.getByText('similar in meaning')).toBeInTheDocument();
  });

  it('never lists the note itself', async () => {
    renderWithProviders(<RelatedNotes noteId="me" />, {
      mocks: [relatedMock([near('me', 'Myself'), near('a', 'Other')])],
    });
    await screen.findByRole('heading', { name: 'Related notes' });
    expect(screen.queryByText('Myself')).not.toBeInTheDocument();
  });

  it('renders nothing when there are none', async () => {
    const { container } = renderWithProviders(<RelatedNotes noteId="me" />, { mocks: [relatedMock([])] });
    await waitFor(() => expect(container.querySelector('section')).toBeNull());
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByRole('heading', { name: 'Related notes' })).not.toBeInTheDocument();
  });

  it('renders nothing when the query fails (an older gateway, embeddings down)', async () => {
    const { container } = renderWithProviders(<RelatedNotes noteId="me" />, {
      mocks: [relatedMock(new Error('Cannot query field "relatedNotes"'))],
    });
    await new Promise((r) => setTimeout(r, 30));
    expect(container.querySelector('section')).toBeNull();
  });

  it('asks for nothing without a saved note', () => {
    const { container } = renderWithProviders(<RelatedNotes noteId={null} />);
    expect(container.innerHTML).toBe('');
  });
});

// ── SearchResults keeps what you are looking at while you type ──────────────
const store = vi.hoisted(() => ({
  state: {
    searchResults: [],
    isSearching: false,
    searchError: null,
    searchNotes: () => {},
    clearSearchResults: () => {},
  },
}));
vi.mock('../../../store/noteStore', () => {
  const useStore = (selector) => (selector ? selector(store.state) : store.state);
  useStore.getState = () => store.state;
  return { default: useStore };
});
const { default: SearchResults } = await import('../../../components/SearchResults');

describe('SearchResults while a newer search is in flight', () => {
  beforeEach(() => {
    store.state.searchResults = [];
    store.state.isSearching = false;
  });

  it('keeps the previous results on screen, with a quiet spinner', () => {
    store.state.searchResults = [row({ _id: 'k', title: 'Garage', matchedBy: 'both' }), row({ _id: 'm', matchedBy: 'meaning', why: 'battery' })];
    store.state.isSearching = true;
    renderWithProviders(<SearchResults />, { route: '/search?q=garage' });
    expect(screen.getByText('Garage')).toBeInTheDocument();
    expect(screen.getByText(/2 results · 1 similar/)).toBeInTheDocument();
    expect(screen.getByLabelText('Searching')).toBeInTheDocument();
    expect(screen.queryByText('Searching…')).not.toBeInTheDocument();
  });

  it('shows the skeleton only when there is nothing to keep', () => {
    store.state.isSearching = true;
    renderWithProviders(<SearchResults />, { route: '/search?q=garage' });
    expect(screen.getByText('Searching…')).toBeInTheDocument();
  });
});
