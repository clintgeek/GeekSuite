/**
 * LibraryView — the grid and the collection chrome around it
 * (`@geeksuite/collection`, configured for books): the phone's Filters sheet
 * and shelf strip, the desktop panel with live counts, the chips, the sort
 * menu, Save view, and the ⋯ menu; plus the grid's own rules (states,
 * selection band, layout, rating).
 *
 * Rendered under the real URL-state provider (hooks/useLibraryParams), so a
 * tap is asserted as the URL it writes.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApolloProvider } from '@apollo/client';
import LibraryView from '../../views/LibraryView';
import { LibraryParamsProvider, useLibraryParams } from '../../hooks/useLibraryParams';
import { BOOKS, FACETS, SAVED_FILTERS, SHELVES, SHELF_SUMMARY } from '../fixtures';
import { mockMatchMediaMatches, renderWithProviders } from '../testUtils';
import { RouterProbe, createTestClient } from '../appHarness';

function baseProps(overrides = {}) {
  return {
    facets: { base: FACETS, current: FACETS, loading: false, error: null },
    basketBookIds: [],
    basketError: null,
    basketLoading: false,
    books: BOOKS,
    clearBasket: vi.fn(),
    error: null,
    handleCreateDeviceBasket: vi.fn(),
    handleMergeSelectedBooks: vi.fn(),
    handleExportCsv: vi.fn(),
    hasMore: false,
    loading: false,
    loadingMore: false,
    mergeLoading: false,
    mergeSelectionError: null,
    onLoadMore: vi.fn(),
    onRetry: vi.fn(),
    selectMode: false,
    selectedBookIds: [],
    setSelectMode: vi.fn(),
    setSelectedBook: vi.fn(),
    shelfSummary: SHELF_SUMMARY,
    shelves: SHELVES,
    showMergeUi: false,
    toggleBasket: vi.fn(),
    toggleBookSelection: vi.fn(),
    total: BOOKS.length,
    ...overrides,
  };
}

function WithLib(props) {
  const { lib } = useLibraryParams();
  return <LibraryView lib={lib} {...props} />;
}

function renderView(overrides = {}, { url = '/', handlers = {} } = {}) {
  const router = {};
  const saved = [];
  const { client } = createTestClient({
    GetLibraryFilters: () => ({ libraryFilters: SAVED_FILTERS }),
    SaveLibraryFilter: (v) => {
      saved.push(v.input);
      return { saveLibraryFilter: [...SAVED_FILTERS, { ...SAVED_FILTERS[2], id: 'f9', ...v.input, ownedOnly: false, ownedFilter: 'all' }] };
    },
    ...handlers,
  });
  const utils = renderWithProviders(
    <ApolloProvider client={client}>
      <RouterProbe into={router} />
      <LibraryParamsProvider>
        <WithLib {...baseProps(overrides)} />
      </LibraryParamsProvider>
    </ApolloProvider>,
    { initialEntries: [url] }
  );
  return { ...utils, router, saved };
}

// Layout and panel prefs are per-browser; every test starts from none.
beforeEach(() => {
  try { window.localStorage.clear(); } catch { /* storage may be blocked */ }
});

/** On a phone the covers/list switch lives in the ⋯ menu. */
async function chooseLayout(user, name) {
  await user.click(screen.getByRole('button', { name: 'Library actions' }));
  await user.click(await screen.findByRole('menuitem', { name }));
}

describe('LibraryView', () => {
  it('renders every book card when loaded', () => {
    renderView();
    for (const book of BOOKS) {
      expect(screen.getByText(book.title)).toBeInTheDocument();
    }
  });

  it('shows an empty state with no filters active', () => {
    renderView({ books: [], total: 0 });
    expect(screen.getByText('No books here yet')).toBeInTheDocument();
    expect(screen.getByText('Add a book to start your library.')).toBeInTheDocument();
  });

  it('shows a different empty state, whose "Clear filters" clears them, when filters narrowed to nothing', async () => {
    const user = userEvent.setup();
    const { router } = renderView({ books: [], total: 0 }, { url: '/?author=Nobody%20Wrote%20This&sort=pageCount' });
    expect(screen.getByText('Nothing matches these filters')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(router.location.search).toBe('?sort=pageCount');
  });

  it('shows the error state with a retry action, and hides the grid', () => {
    renderView({ error: new Error('boom'), books: [] });
    expect(screen.getByText('Could not load your library')).toBeInTheDocument();
    expect(screen.queryByText(BOOKS[0].title)).not.toBeInTheDocument();
  });

  it('retry calls onRetry', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    renderView({ error: new Error('boom'), books: [], onRetry });
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('renders skeletons instead of cards while loading', () => {
    const { container } = renderView({ loading: true });
    expect(container.querySelectorAll('.MuiSkeleton-root').length).toBeGreaterThan(0);
    expect(screen.queryByText(BOOKS[0].title)).not.toBeInTheDocument();
    // Neither the empty nor the error state races the loading skeletons.
    expect(screen.queryByText('No books here yet')).not.toBeInTheDocument();
  });

  it('shows the selection band with the basket count once anything is selected', () => {
    renderView({ selectMode: true, basketBookIds: ['b1', 'b2'] });
    expect(screen.getByText('2 selected')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download to device' })).toBeInTheDocument();
  });

  it('shows the selection band even out of select mode, once the basket is non-empty', () => {
    renderView({ selectMode: false, basketBookIds: ['b1'] });
    expect(screen.getByText('1 selected')).toBeInTheDocument();
  });

  it('hides the selection band with nothing selected and select mode off', () => {
    renderView();
    expect(screen.queryByText(/selected$/)).not.toBeInTheDocument();
  });

  it('"Cancel" exits select mode and clears the basket', async () => {
    const user = userEvent.setup();
    const setSelectMode = vi.fn();
    const clearBasket = vi.fn();
    renderView({ selectMode: true, basketBookIds: ['b1'], setSelectMode, clearBasket });
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(setSelectMode).toHaveBeenCalledWith(false);
    expect(clearBasket).toHaveBeenCalledTimes(1);
  });

  it('the ⋯ menu exports what the filters match and enters select mode', async () => {
    const user = userEvent.setup();
    const handleExportCsv = vi.fn();
    const setSelectMode = vi.fn();
    renderView({ handleExportCsv, setSelectMode });
    await user.click(screen.getByRole('button', { name: 'Library actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Export these books (CSV)' }));
    expect(handleExportCsv).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Library actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Select books…' }));
    expect(setSelectMode).toHaveBeenCalledWith(true);
  });
});

describe('LibraryView — the phone: shelf strip + Filters sheet', () => {
  it('the strip picks one shelf; with several picked no chip lights', async () => {
    const user = userEvent.setup();
    const { router } = renderView({}, { url: '/?tag=fantasy' });
    await user.click(screen.getByRole('tab', { name: /^Read(?!ing)/ }));
    expect(router.location.search).toBe('?shelf=read&tag=fantasy');
    await act(async () => router.navigate('/?shelf=read&shelf=unread'));
    expect(screen.getAllByRole('tab').every((t) => t.getAttribute('aria-selected') === 'false')).toBe(true);
  });

  it('"Filters · N" opens the sections in a sheet whose footer says what you will get', async () => {
    const user = userEvent.setup();
    const { router } = renderView({ total: 4 }, { url: '/?tag=fantasy&format=epub' });
    await user.click(screen.getByRole('button', { name: 'Filters, 2 active' }));
    const sheet = await screen.findByRole('dialog');
    expect(within(sheet).getByRole('button', { name: /^Shelf/ })).toBeInTheDocument();
    expect(within(sheet).getByRole('button', { name: /^Tags/ })).toBeInTheDocument();
    expect(within(sheet).getByTestId('filters-sheet-show')).toHaveTextContent('Show 4 books');
    // A tap writes the URL at once: the list behind the sheet is already filtered.
    await user.click(within(sheet).getByRole('checkbox', { name: /^Unread/ }));
    expect(router.location.search).toBe('?shelf=unread&tag=fantasy&format=epub');
  });

  it('a single chosen shelf is not repeated as a chip under the strip', () => {
    renderView({}, { url: '/?shelf=read&tag=fantasy' });
    const chips = screen.getByTestId('active-chips');
    expect(within(chips).queryByRole('button', { name: /Remove Shelf/ })).not.toBeInTheDocument();
    expect(within(chips).getByRole('button', { name: 'Remove Tag: fantasy' })).toBeInTheDocument();
  });
});

describe('LibraryView — desktop: the filter panel', () => {
  let restore;
  beforeEach(() => {
    restore = mockMatchMediaMatches(true);
    try { window.localStorage.clear(); } catch { /* blocked */ }
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 });
  });
  afterEach(() => restore());

  it('lists every section in panel order, in the Midnight Reader display face', () => {
    renderView();
    const panel = screen.getByTestId('filter-panel');
    const titles = within(panel).getAllByRole('heading', { level: 3 }).map((h) => h.textContent.replace(/\d+ selected$/, ''));
    // One language in the library: no Language section to choose from.
    expect(titles).toEqual(['Shelf', 'Author', 'Series', 'Tags', 'Format', 'Copy', 'Year read', 'My rating']);
    expect(within(panel).getByRole('heading', { level: 2, name: 'Filters' })).toHaveStyle({ fontFamily: '"DM Serif Display", Georgia, serif' });
  });

  it('shows the live counts beside each option, custom shelves by their label', () => {
    renderView();
    const panel = screen.getByTestId('filter-panel');
    expect(within(panel).getByRole('checkbox', { name: 'Read, 118 books' })).toBeInTheDocument();
    expect(within(panel).getByRole('checkbox', { name: 'Comfort reads, 1 book' })).toBeInTheDocument();
    expect(within(panel).getByRole('checkbox', { name: 'EPUB, 4 books' })).toBeInTheDocument();
    expect(within(panel).getByRole('checkbox', { name: 'Books I own, 3 books' })).toBeInTheDocument();
  });

  it('a checkbox writes the URL, and its chip removes exactly it', async () => {
    const user = userEvent.setup();
    const { router } = renderView({}, { url: '/?sort=author' });
    const panel = screen.getByTestId('filter-panel');
    await user.click(within(panel).getByRole('checkbox', { name: 'John Scalzi, 3 books' }));
    await user.click(within(panel).getByRole('checkbox', { name: 'science fiction, 4 books' }));
    expect(router.location.search).toBe('?author=John+Scalzi&tag=science+fiction&sort=author');
    await user.click(screen.getByRole('button', { name: 'Remove Author: John Scalzi' }));
    expect(router.location.search).toBe('?tag=science+fiction&sort=author');
  });

  it('the Language section appears once there is a choice of languages', () => {
    renderView({ facets: { base: { ...FACETS, languages: [{ value: 'en', count: 3 }, { value: 'fr', count: 1 }] }, current: null } });
    const panel = screen.getByTestId('filter-panel');
    expect(within(panel).getByRole('button', { name: /^Language/ })).toBeInTheDocument();
  });

  it('the sort menu offers every sort, in words, and Shuffle is seeded', async () => {
    const user = userEvent.setup();
    const { router } = renderView();
    await user.click(screen.getByRole('button', { name: 'Sort: Title, A → Z' }));
    const menu = await screen.findByRole('menu', { name: 'Sort by' });
    const names = within(menu).getAllByRole('menuitemradio').map((i) => i.textContent);
    expect(names).toEqual([
      'Title', 'Author', 'Recently added', 'My rating', 'Date finished', 'Page count', 'Published', 'Owned first', 'Shuffle',
      'A → Z', 'Z → A',
    ]);
    await user.click(within(menu).getByRole('menuitemradio', { name: 'Page count' }));
    expect(router.location.search).toBe('?sort=pageCount');
    await user.click(screen.getByRole('button', { name: 'Sort: Page count, Shortest first' }));
    await user.click(await screen.findByRole('menuitemradio', { name: 'Shuffle' }));
    expect(router.location.search).toMatch(/^\?sort=random&seed=\d+$/);
  });

  it('Save view saves the whole filter + sort, with the legacy fields for old tabs', async () => {
    const user = userEvent.setup();
    const { saved } = renderView({}, { url: '/?shelf=read&tag=fantasy&stars=4-5&sort=rating' });
    await user.click(screen.getByRole('button', { name: 'Save view' }));
    const dialog = await screen.findByRole('dialog', { name: 'Save this view' });
    expect(within(dialog).getByLabelText('Name')).toHaveValue('Read · fantasy · 4★–5★');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await vi.waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0]).toEqual({
      name: 'Read · fantasy · 4★–5★',
      filter: { shelves: ['read'], tags: ['fantasy'], ratingMin: 4, ratingMax: 5 },
      sortBy: 'rating',
      sortDir: 'desc',
      searchQuery: '',
      authorFilter: '',
      tagFilter: 'fantasy',
      shelfFilter: 'read',
    });
  });

  it('hiding the panel is remembered, and "Filters" brings it back', async () => {
    const user = userEvent.setup();
    const { unmount } = renderView();
    await user.click(screen.getByRole('button', { name: 'Hide filters' }));
    expect(screen.queryByTestId('filter-panel')).not.toBeInTheDocument();
    unmount();
    renderView();
    expect(screen.queryByTestId('filter-panel')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Show filters' }));
    expect(screen.getByTestId('filter-panel')).toBeInTheDocument();
  });
});

/**
 * Grid or list, and rating from either.
 */
describe('LibraryView — layout', () => {
  beforeEach(() => {
    try { window.localStorage.clear(); } catch { /* storage may be blocked */ }
  });

  it('starts as covers and switches to a list', async () => {
    const user = userEvent.setup();
    renderView();
    expect(screen.queryAllByTestId('book-row')).toHaveLength(0);
    await chooseLayout(user, 'Show as a list');
    expect(screen.getAllByTestId('book-row')).toHaveLength(BOOKS.length);
    await chooseLayout(user, 'Show as covers');
    expect(screen.queryAllByTestId('book-row')).toHaveLength(0);
  });

  it('remembers the list next time', async () => {
    const user = userEvent.setup();
    const { unmount } = renderView();
    await chooseLayout(user, 'Show as a list');
    unmount();
    renderView();
    expect(screen.getAllByTestId('book-row')).toHaveLength(BOOKS.length);
  });

  it('still renders when storage is blocked', async () => {
    // A private window throws on localStorage access; the library must not.
    const user = userEvent.setup();
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    renderView();
    await chooseLayout(user, 'Show as a list');
    expect(screen.getAllByTestId('book-row')).toHaveLength(BOOKS.length);
    get.mockRestore();
    set.mockRestore();
  });

  it('on a desktop the switch is its own button beside the sort', async () => {
    const restore = mockMatchMediaMatches(true);
    const user = userEvent.setup();
    renderView();
    await user.click(screen.getByRole('button', { name: 'Show as a list' }));
    expect(screen.getAllByTestId('book-row')).toHaveLength(BOOKS.length);
    restore();
  });
});

describe('LibraryView — rating', () => {
  const read100 = BOOKS[1]; // The Sound of Gravel, read, 5

  it('rates, and offers an undo that restores the old rating', async () => {
    const onRateBook = vi.fn().mockResolvedValue(true);
    renderView({ onRateBook });
    screen.getByRole('slider', { name: 'Rate The Sound of Gravel' }).focus();
    await userEvent.keyboard('3');
    expect(onRateBook).toHaveBeenCalledWith(read100, 3);

    await userEvent.click(await screen.findByRole('button', { name: 'Undo' }));
    expect(onRateBook).toHaveBeenLastCalledWith({ ...read100, rating: 3 }, 5);
  });

  it('says so when a rating fails to save', async () => {
    const onRateBook = vi.fn().mockResolvedValue(false);
    renderView({ onRateBook });
    screen.getByRole('slider', { name: 'Rate The Sound of Gravel' }).focus();
    await userEvent.keyboard('2');
    expect(await screen.findByText(/couldn't save the rating/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument();
  });

  it('rates from the list too', async () => {
    const user = userEvent.setup();
    const onRateBook = vi.fn().mockResolvedValue(true);
    renderView({ onRateBook });
    await chooseLayout(user, 'Show as a list');
    screen.getByRole('slider', { name: 'Rate The Sound of Gravel' }).focus();
    await userEvent.keyboard('4');
    expect(onRateBook).toHaveBeenCalledWith(read100, 4);
  });
});
