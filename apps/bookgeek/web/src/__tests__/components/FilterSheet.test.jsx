import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FilterSheet from '../../components/FilterSheet';
import { SAVED_FILTERS } from '../fixtures';
import { renderWithProviders, mockMatchMediaMatches } from '../testUtils';

function baseProps(overrides = {}) {
  return {
    open: true,
    onClose: vi.fn(),
    total: 223,
    sortBy: 'title',
    setSortBy: vi.fn(),
    sortDir: 'asc',
    setSortDir: vi.fn(),
    authorFilter: '',
    setAuthorFilter: vi.fn(),
    tagFilter: '',
    setTagFilter: vi.fn(),
    setShelfFilter: vi.fn(),
    setSearchQuery: vi.fn(),
    savedFilters: SAVED_FILTERS,
    savedFiltersError: null,
    applySavedFilter: vi.fn(),
    handleSaveCurrentFilter: vi.fn(),
    saveFilterLoading: false,
    onEnterSelectMode: vi.fn(),
    showMergeUi: false,
    handleMergeSelectedBooks: vi.fn(),
    mergeLoading: false,
    selectedBookIds: [],
    ...overrides,
  };
}

describe('FilterSheet', () => {
  let restoreMatchMedia;
  afterEach(() => {
    restoreMatchMedia?.();
    restoreMatchMedia = undefined;
  });

  it('resolves to GeekSheet\'s sheet mode below the nav breakpoint', () => {
    restoreMatchMedia = mockMatchMediaMatches(true); // "mobile": matches theme.breakpoints.down(...)
    const { baseElement } = renderWithProviders(<FilterSheet {...baseProps()} />);
    // GeekSheet's Modal portals into document.body, outside the render
    // container, so the mode hook is asserted against baseElement.
    expect(baseElement.querySelector('[data-geek-sheet-mode="sheet"]')).not.toBeNull();
  });

  it('resolves to GeekSheet\'s dialog mode at/above the nav breakpoint', () => {
    restoreMatchMedia = mockMatchMediaMatches(false); // "desktop"
    const { baseElement } = renderWithProviders(<FilterSheet {...baseProps()} />);
    expect(baseElement.querySelector('[data-geek-sheet-mode="dialog"]')).not.toBeNull();
  });

  it('changes sortBy from the sort toggle group', async () => {
    restoreMatchMedia = mockMatchMediaMatches(false);
    const user = userEvent.setup();
    const setSortBy = vi.fn();
    renderWithProviders(<FilterSheet {...baseProps({ setSortBy })} />);
    await user.click(screen.getByRole('button', { name: 'Author' }));
    expect(setSortBy).toHaveBeenCalledWith('author');
  });

  it('changes sortDir from the direction toggle group', async () => {
    restoreMatchMedia = mockMatchMediaMatches(false);
    const user = userEvent.setup();
    const setSortDir = vi.fn();
    renderWithProviders(<FilterSheet {...baseProps({ setSortDir })} />);
    await user.click(screen.getByRole('button', { name: 'Descending' }));
    expect(setSortDir).toHaveBeenCalledWith('desc');
  });

  it('types into the author and tag fields', async () => {
    restoreMatchMedia = mockMatchMediaMatches(false);
    const user = userEvent.setup();
    const setAuthorFilter = vi.fn();
    const setTagFilter = vi.fn();
    renderWithProviders(<FilterSheet {...baseProps({ setAuthorFilter, setTagFilter })} />);
    await user.type(screen.getByLabelText('Author'), 'S');
    expect(setAuthorFilter).toHaveBeenCalledWith('S');
    await user.type(screen.getByLabelText('Tag or genre'), 'f');
    expect(setTagFilter).toHaveBeenCalledWith('f');
  });

  it('applies a saved filter chip on click', async () => {
    restoreMatchMedia = mockMatchMediaMatches(false);
    const user = userEvent.setup();
    const applySavedFilter = vi.fn();
    renderWithProviders(<FilterSheet {...baseProps({ applySavedFilter })} />);
    await user.click(screen.getByText('Kindle queue'));
    expect(applySavedFilter).toHaveBeenCalledWith(SAVED_FILTERS[0]);
  });

  it('"Show N books" closes the sheet', async () => {
    restoreMatchMedia = mockMatchMediaMatches(false);
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderWithProviders(<FilterSheet {...baseProps({ total: 223, onClose })} />);
    await user.click(screen.getByRole('button', { name: 'Show 223 books' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('singularizes "Show 1 book"', () => {
    restoreMatchMedia = mockMatchMediaMatches(false);
    renderWithProviders(<FilterSheet {...baseProps({ total: 1 })} />);
    expect(screen.getByRole('button', { name: 'Show 1 book' })).toBeInTheDocument();
  });
});
