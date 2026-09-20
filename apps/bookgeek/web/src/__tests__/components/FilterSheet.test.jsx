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

describe('FilterSheet — CSV export', () => {
  afterEach(() => vi.restoreAllMocks());

  it('offers the export and calls the handler', async () => {
    const handleExportCsv = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<FilterSheet {...baseProps({ handleExportCsv })} />);

    await user.click(screen.getByRole('button', { name: /export these books/i }));
    expect(handleExportCsv).toHaveBeenCalledTimes(1);
  });

  it('closes the sheet, since the export outlives it and reports by toast', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <FilterSheet {...baseProps({ handleExportCsv: vi.fn(), onClose })} />
    );

    await user.click(screen.getByRole('button', { name: /export these books/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it('shows progress and blocks a second click while exporting', async () => {
    // A long export must not be startable twice; App also guards, but the
    // control should say why it is inert.
    const handleExportCsv = vi.fn();
    renderWithProviders(
      <FilterSheet {...baseProps({ handleExportCsv, exportingCsv: true })} />
    );

    const button = screen.getByRole('button', { name: /exporting/i });
    expect(button).toBeDisabled();
  });

  it('does not throw when no handler is wired', async () => {
    // The optional-call guard, so a caller that forgets the prop degrades to
    // a no-op rather than a crash in the sheet.
    const user = userEvent.setup();
    renderWithProviders(<FilterSheet {...baseProps({ handleExportCsv: undefined })} />);
    await expect(
      user.click(screen.getByRole('button', { name: /export these books/i }))
    ).resolves.not.toThrow();
  });
});
