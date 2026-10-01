import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import { renderWithProviders } from '../../testUtils';
import SearchResults from '../../../components/SearchResults';
import { SEARCH_NOTES } from '../../../graphql/queries';

/**
 * Search's "Best match" (DOCS/CONTEXT.md §11): when the gateway names one
 * clear answer (`bestMatch`), it sits first in its own named region, with the
 * passage that matched; the rest follow under "Also related". With no best
 * match the list is the plain list it always was — no headings at all.
 */

const store = vi.hoisted(() => ({ state: {} }));
vi.mock('../../../store/noteStore', () => {
  const useStore = (selector) => (selector ? selector(store.state) : store.state);
  useStore.getState = () => store.state;
  return { default: useStore };
});

const hit = (id, title, extra = {}) => ({
  _id: id,
  title,
  type: 'markdown',
  tags: [],
  isLocked: false,
  isEncrypted: false,
  createdAt: '2026-09-20T12:00:00.000Z',
  updatedAt: '2026-09-20T12:00:00.000Z',
  score: 0.01,
  snippet: `${ title } opening line.`,
  message: null,
  matchedBy: 'both',
  why: null,
  bestMatch: false,
  ...extra,
});

function show(results) {
  store.state = {
    searchResults: results,
    isSearching: false,
    searchError: null,
    searchNotes: vi.fn(),
    clearSearchResults: vi.fn(),
  };
  return renderWithProviders(<SearchResults />, { route: '/search?q=pills' });
}

beforeEach(() => { store.state = {}; });

describe('SearchResults — best match', () => {
  it('a best match gets its own "Best match" region, first, with the matched passage; the rest are "Also related"', () => {
    show([
      hit('w1', 'Card issuance summary'),
      hit('m1', 'Meds and Supplements', { matchedBy: 'meaning', bestMatch: true, why: 'Morning: vitamin D, magnesium. Evening: the blue one.' }),
      hit('w2', 'Interview project', { matchedBy: 'keyword' }),
    ]);
    const best = screen.getByRole('region', { name: 'Best match' });
    expect(within(best).getAllByRole('link')).toHaveLength(1);
    expect(within(best).getByText('Meds and Supplements')).toBeInTheDocument();
    expect(within(best).getByText(/vitamin D, magnesium/)).toBeInTheDocument();

    const also = screen.getByRole('region', { name: 'Also related' });
    expect(within(also).getAllByRole('link').map((a) => a.textContent)).toEqual([
      expect.stringContaining('Card issuance summary'),
      expect.stringContaining('Interview project'),
    ]);
    // Best match comes before the rest in reading order.
    expect(best.compareDocumentPosition(also) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // The count still counts everything.
    expect(screen.getByText(/3 results · 1 similar/)).toBeInTheDocument();
  });

  it('a keyword-matched best match shows the matched passage with the words marked', () => {
    const { container } = show([
      hit('b1', 'Daily pills', { bestMatch: true, why: 'Two pills with breakfast.' }),
    ]);
    const best = screen.getByRole('region', { name: 'Best match' });
    expect(within(best).getByText((_, el) => el?.textContent === 'Two pills with breakfast.' && el.tagName === 'DIV')).toBeInTheDocument();
    expect(container.querySelectorAll('[data-search-best] mark').length).toBeGreaterThanOrEqual(1);
    // Alone: no empty "Also related" heading.
    expect(screen.queryByRole('region', { name: 'Also related' })).not.toBeInTheDocument();
  });

  it('no best match: the plain list, no headings', () => {
    show([hit('a', 'Server SSH key'), hit('b', 'RallyCenter info', { matchedBy: 'meaning' })]);
    expect(screen.queryByRole('region', { name: 'Best match' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Also related' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 2 })).not.toBeInTheDocument();
    expect(screen.getAllByRole('link')).toHaveLength(2);
  });

  it('the search query selects bestMatch', () => {
    expect(SEARCH_NOTES.loc.source.body).toMatch(/\bbestMatch\b/);
  });
});
