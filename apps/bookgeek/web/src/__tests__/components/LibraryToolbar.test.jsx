import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LibraryToolbar from '../../components/LibraryToolbar';
import { SHELVES } from '../fixtures';
import { renderWithProviders } from '../testUtils';

function baseProps(overrides = {}) {
  return {
    total: 223,
    sortBy: 'title',
    sortDir: 'asc',
    onOpenSort: vi.fn(),
    onOpenFilter: vi.fn(),
    activeFilterCount: 0,
    shelves: SHELVES,
    shelfFilter: 'all',
    setShelfFilter: vi.fn(),
    searchQuery: '',
    setSearchQuery: vi.fn(),
    authorFilter: '',
    setAuthorFilter: vi.fn(),
    tagFilter: '',
    setTagFilter: vi.fn(),
    ...overrides,
  };
}

describe('LibraryToolbar', () => {
  it('shows the book count, singular for exactly one', () => {
    const { rerender } = renderWithProviders(<LibraryToolbar {...baseProps({ total: 223 })} />);
    expect(screen.getByText('223 books')).toBeInTheDocument();
    rerender(<LibraryToolbar {...baseProps({ total: 1 })} />);
    expect(screen.getByText('1 book')).toBeInTheDocument();
  });

  it('shows the sort label and direction, in the visible text and the aria-label', () => {
    renderWithProviders(<LibraryToolbar {...baseProps({ sortBy: 'dateAdded', sortDir: 'desc' })} />);
    expect(screen.getByText('Added ↓')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Added, descending/ })).toBeInTheDocument();
  });

  it('opens the sheet from either pill', async () => {
    const user = userEvent.setup();
    const onOpenSort = vi.fn();
    const onOpenFilter = vi.fn();
    renderWithProviders(<LibraryToolbar {...baseProps({ onOpenSort, onOpenFilter })} />);
    await user.click(screen.getByRole('button', { name: /Title/ }));
    expect(onOpenSort).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Filter' }));
    expect(onOpenFilter).toHaveBeenCalledTimes(1);
  });

  it('badges the filter pill with author + tag count only — the shelf does not count', () => {
    renderWithProviders(
      <LibraryToolbar
        {...baseProps({
          activeFilterCount: 2,
          shelfFilter: 'reading',
          authorFilter: 'Scalzi',
          tagFilter: 'science fiction',
        })}
      />
    );
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('renders no chips at all when nothing is narrowed', () => {
    renderWithProviders(<LibraryToolbar {...baseProps()} />);
    expect(screen.queryByText('Clear all')).not.toBeInTheDocument();
  });

  it('renders a removable chip per active filter, and each delete calls the right setter', async () => {
    const user = userEvent.setup();
    const setShelfFilter = vi.fn();
    const setSearchQuery = vi.fn();
    const setAuthorFilter = vi.fn();
    const setTagFilter = vi.fn();
    renderWithProviders(
      <LibraryToolbar
        {...baseProps({
          shelfFilter: 'reading',
          searchQuery: 'gravel',
          authorFilter: 'Wariner',
          tagFilter: 'memoir',
          setShelfFilter,
          setSearchQuery,
          setAuthorFilter,
          setTagFilter,
        })}
      />
    );

    expect(screen.getByText('Shelf: Reading')).toBeInTheDocument();
    expect(screen.getByText('Search: gravel')).toBeInTheDocument();
    expect(screen.getByText('Author: Wariner')).toBeInTheDocument();
    expect(screen.getByText('Tag: memoir')).toBeInTheDocument();

    // MUI Chip's delete icon has no accessible name of its own; select it via
    // the chip's own DOM structure instead of a role query.
    const deleteIcon = (label) =>
      screen.getByText(label).closest('.MuiChip-root').querySelector('.MuiChip-deleteIcon');

    await user.click(deleteIcon('Shelf: Reading'));
    expect(setShelfFilter).toHaveBeenCalledWith('all');

    await user.click(deleteIcon('Search: gravel'));
    expect(setSearchQuery).toHaveBeenCalledWith('');

    await user.click(deleteIcon('Author: Wariner'));
    expect(setAuthorFilter).toHaveBeenCalledWith('');

    await user.click(deleteIcon('Tag: memoir'));
    expect(setTagFilter).toHaveBeenCalledWith('');
  });

  it('"Clear all" resets every filter, including the shelf', async () => {
    const user = userEvent.setup();
    const setShelfFilter = vi.fn();
    const setSearchQuery = vi.fn();
    const setAuthorFilter = vi.fn();
    const setTagFilter = vi.fn();
    renderWithProviders(
      <LibraryToolbar
        {...baseProps({
          shelfFilter: 'reading',
          searchQuery: 'gravel',
          authorFilter: 'Wariner',
          tagFilter: 'memoir',
          setShelfFilter,
          setSearchQuery,
          setAuthorFilter,
          setTagFilter,
        })}
      />
    );
    await user.click(screen.getByRole('button', { name: 'Clear all' }));
    expect(setSearchQuery).toHaveBeenCalledWith('');
    expect(setAuthorFilter).toHaveBeenCalledWith('');
    expect(setTagFilter).toHaveBeenCalledWith('');
    expect(setShelfFilter).toHaveBeenCalledWith('all');
  });
});
