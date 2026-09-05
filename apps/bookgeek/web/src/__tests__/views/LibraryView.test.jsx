import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LibraryView from '../../views/LibraryView';
import { BOOKS, SHELVES, SHELF_SUMMARY, SAVED_FILTERS } from '../fixtures';
import { renderWithProviders } from '../testUtils';

function baseProps(overrides = {}) {
  return {
    activeView: 'library',
    applySavedFilter: vi.fn(),
    authorFilter: '',
    basketBookIds: [],
    basketError: null,
    basketLoading: false,
    books: BOOKS,
    clearBasket: vi.fn(),
    error: null,
    handleCreateDeviceBasket: vi.fn(),
    handleMergeSelectedBooks: vi.fn(),
    handleSaveCurrentFilter: vi.fn(),
    hasMore: false,
    loadMoreRef: { current: null },
    loading: false,
    loadingMore: false,
    mergeLoading: false,
    mergeSelectionError: null,
    onRetry: vi.fn(),
    saveFilterLoading: false,
    savedFilters: SAVED_FILTERS,
    savedFiltersError: null,
    searchQuery: '',
    selectMode: false,
    selectedBookIds: [],
    setActiveView: vi.fn(),
    setAuthorFilter: vi.fn(),
    setDownloadOpen: vi.fn(),
    setSearchQuery: vi.fn(),
    setSelectMode: vi.fn(),
    setSelectedBook: vi.fn(),
    setShelfFilter: vi.fn(),
    setSortBy: vi.fn(),
    setSortDir: vi.fn(),
    setTagFilter: vi.fn(),
    shelfFilter: 'all',
    shelfSummary: SHELF_SUMMARY,
    shelves: SHELVES,
    showMergeUi: false,
    sortBy: 'title',
    sortDir: 'asc',
    tagFilter: '',
    toggleBasket: vi.fn(),
    toggleBookSelection: vi.fn(),
    total: BOOKS.length,
    ...overrides,
  };
}

describe('LibraryView', () => {
  it('renders every book card when loaded', () => {
    renderWithProviders(<LibraryView {...baseProps()} />);
    for (const book of BOOKS) {
      expect(screen.getByText(book.title)).toBeInTheDocument();
    }
  });

  it('shows an empty state with no filters active', () => {
    renderWithProviders(<LibraryView {...baseProps({ books: [], total: 0 })} />);
    expect(screen.getByText('No books here yet')).toBeInTheDocument();
    expect(screen.getByText('Add a book to start your library.')).toBeInTheDocument();
  });

  it('shows a different empty state, with a "Clear filters" action, when filters narrowed to nothing', () => {
    renderWithProviders(
      <LibraryView {...baseProps({ books: [], total: 0, authorFilter: 'Nobody Wrote This' })} />
    );
    expect(screen.getByText('Nothing matches these filters')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear filters' })).toBeInTheDocument();
  });

  it('shows the error state with a retry action, and hides the grid', () => {
    const onRetry = vi.fn();
    renderWithProviders(
      <LibraryView {...baseProps({ error: new Error('boom'), books: [], onRetry })} />
    );
    expect(screen.getByText('Could not load your library')).toBeInTheDocument();
    expect(screen.queryByText(BOOKS[0].title)).not.toBeInTheDocument();
  });

  it('retry calls onRetry', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    renderWithProviders(<LibraryView {...baseProps({ error: new Error('boom'), books: [], onRetry })} />);
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('renders skeletons instead of cards while loading', () => {
    const { container } = renderWithProviders(<LibraryView {...baseProps({ loading: true })} />);
    expect(container.querySelectorAll('.MuiSkeleton-root').length).toBeGreaterThan(0);
    expect(screen.queryByText(BOOKS[0].title)).not.toBeInTheDocument();
    // Neither the empty nor the error state races the loading skeletons.
    expect(screen.queryByText('No books here yet')).not.toBeInTheDocument();
  });

  it('shows the selection band with the basket count once anything is selected', () => {
    renderWithProviders(
      <LibraryView {...baseProps({ selectMode: true, basketBookIds: ['b1', 'b2'] })} />
    );
    expect(screen.getByText('2 selected')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download to device' })).toBeInTheDocument();
  });

  it('shows the selection band even out of select mode, once the basket is non-empty', () => {
    renderWithProviders(<LibraryView {...baseProps({ selectMode: false, basketBookIds: ['b1'] })} />);
    expect(screen.getByText('1 selected')).toBeInTheDocument();
  });

  it('hides the selection band with nothing selected and select mode off', () => {
    renderWithProviders(<LibraryView {...baseProps()} />);
    expect(screen.queryByText(/selected$/)).not.toBeInTheDocument();
  });

  it('"Cancel" exits select mode and clears the basket', async () => {
    const user = userEvent.setup();
    const setSelectMode = vi.fn();
    const clearBasket = vi.fn();
    renderWithProviders(
      <LibraryView {...baseProps({ selectMode: true, basketBookIds: ['b1'], setSelectMode, clearBasket })} />
    );
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(setSelectMode).toHaveBeenCalledWith(false);
    expect(clearBasket).toHaveBeenCalledTimes(1);
  });
});
