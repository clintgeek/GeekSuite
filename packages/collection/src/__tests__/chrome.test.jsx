import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import ActiveChips from '../ui/ActiveChips';
import FiltersSheet from '../ui/FiltersSheet';
import LibraryHeader from '../ui/LibraryHeader';
import SaveViewDialog from '../ui/SaveViewDialog';
import SavedViews from '../ui/SavedViews';
import SortMenu from '../ui/SortMenu';
import { countText, showLabel } from '../ui/filterUi';
import { BOOK_CODEC, BOOK_SORTS } from './fixtures';
import { renderUi } from './testUtils';

const NOUN = { one: 'book', many: 'books' };
const lib = (filter = {}, extra = {}) => ({
  state: { ...BOOK_CODEC.DEFAULT_STATE, ...extra, filter: { ...BOOK_CODEC.EMPTY_FILTER, ...filter } },
  activeCount: 1,
  update: vi.fn(),
  toggle: vi.fn(),
  clearAll: vi.fn(),
  setSort: vi.fn(),
  reshuffle: vi.fn(),
});
const CHIPS = [
  { id: 'authors:Banks', group: 'Author', label: 'Banks', patch: { authors: [] } },
  { id: 'q', group: 'Search', label: '“dune”', patch: { q: '' }, search: true },
];

describe('wording', () => {
  it('counts and the sheet footer use the noun', () => {
    expect(countText(null, NOUN)).toBe('');
    expect(countText(1, NOUN)).toBe('1 book');
    expect(countText(1234, NOUN)).toBe(`${(1234).toLocaleString()} books`);
    expect(showLabel(null, NOUN)).toBe('Show books');
    expect(showLabel(0, NOUN)).toBe('No books match');
    expect(showLabel(3, NOUN)).toBe('Show 3 books');
  });
});

describe('ActiveChips', () => {
  it('each chip removes itself; Clear all calls through; none renders nothing', () => {
    const onRemove = vi.fn();
    const onClearAll = vi.fn();
    const { unmount } = renderUi(<ActiveChips chips={CHIPS} onRemove={onRemove} onClearAll={onClearAll} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove Author: Banks' }));
    expect(onRemove).toHaveBeenCalledWith(CHIPS[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }));
    expect(onClearAll).toHaveBeenCalled();
    unmount();
    const { container } = renderUi(<ActiveChips chips={[]} onRemove={() => {}} onClearAll={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('SortMenu', () => {
  it('lists the app’s sorts, the direction in its words, and shuffle-again for random', () => {
    const onSort = vi.fn();
    const onReshuffle = vi.fn();
    const { rerender } = renderUi(<SortMenu sorts={BOOK_SORTS} sort="author" dir="asc" onSort={onSort} onReshuffle={onReshuffle} />);
    fireEvent.click(screen.getByRole('button', { name: 'Sort: Author, A → Z' }));
    expect(screen.getAllByRole('menuitemradio').map((m) => m.textContent)).toEqual(['Title', 'Author', 'Recently added', 'Rating', 'Shuffle', 'A → Z', 'Z → A']);
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Z → A' }));
    expect(onSort).toHaveBeenCalledWith('author', 'desc');
    rerender(<SortMenu sorts={BOOK_SORTS} sort="random" dir="asc" onSort={onSort} onReshuffle={onReshuffle} compact />);
    fireEvent.click(screen.getByRole('button', { name: 'Sort: Shuffle' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Shuffle again' }));
    expect(onReshuffle).toHaveBeenCalled();
  });

  it('the phone pill uses the short label', () => {
    renderUi(<SortMenu sorts={BOOK_SORTS} sort="dateAdded" dir="desc" onSort={() => {}} onReshuffle={() => {}} compact />);
    expect(screen.getByRole('button', { name: 'Sort: Recently added, Newest first' })).toHaveTextContent('Added');
  });
});

describe('LibraryHeader', () => {
  const base = { sorts: BOOK_SORTS, chips: [], onSave: () => {}, view: 'grid', onToggleView: () => {} };

  it('desktop: a polite live count in the app’s noun, chips, and the show-panel pill when hidden', () => {
    const l = lib({ authors: ['Banks'] });
    const onShowPanel = vi.fn();
    renderUi(<LibraryHeader {...base} isDesktop total={3} lib={l} chips={CHIPS} panelOpen={false} onShowPanel={onShowPanel} />);
    const count = screen.getByTestId('result-count');
    expect(count).toHaveTextContent('3 books');
    expect(count).toHaveAttribute('aria-live', 'polite');
    fireEvent.click(screen.getByRole('button', { name: 'Show filters, 1 active' }));
    expect(onShowPanel).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Remove Author: Banks' }));
    expect(l.update).toHaveBeenCalledWith({ authors: [] });
  });

  it('phone: "Filters · N" opens the sheet; Save view shows only when narrowed', () => {
    const onOpenSheet = vi.fn();
    const { unmount } = renderUi(<LibraryHeader {...base} isDesktop={false} total={3} lib={lib({ authors: ['A'] })} onOpenSheet={onOpenSheet} />);
    fireEvent.click(screen.getByRole('button', { name: 'Filters, 1 active' }));
    expect(onOpenSheet).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Save view' })).toBeInTheDocument();
    unmount();
    renderUi(<LibraryHeader {...base} isDesktop={false} total={3} lib={{ ...lib(), activeCount: 0 }} onOpenSheet={() => {}} />);
    expect(screen.queryByRole('button', { name: 'Save view' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Show as a list' })).toBeInTheDocument();
  });

  it('an app control sits in `actions` beside the sort; without onToggleView there is no toggle', () => {
    for (const isDesktop of [true, false]) {
      const { unmount } = renderUi(
        <LibraryHeader
          {...base}
          onToggleView={undefined}
          isDesktop={isDesktop}
          total={3}
          lib={lib()}
          actions={<button type="button">Library actions</button>}
        />
      );
      expect(screen.getByRole('button', { name: 'Library actions' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Show as a list' })).toBeNull();
      unmount();
    }
  });

  it('displayWeight sets the display headings’ weight (a one-weight face); unset keeps the package’s', () => {
    const weight = () => window.getComputedStyle(screen.getByTestId('result-count')).fontWeight;
    const { unmount } = renderUi(<LibraryHeader {...base} isDesktop total={3} lib={lib()} panelOpen />, {
      config: { noun: NOUN, displayFont: 'Georgia', displayWeight: 400 },
    });
    expect(weight()).toBe('400');
    expect(window.getComputedStyle(screen.getByTestId('result-count')).fontFamily).toBe('Georgia');
    unmount();
    renderUi(<LibraryHeader {...base} isDesktop total={3} lib={lib()} panelOpen />, { config: { noun: NOUN, displayFont: 'Georgia' } });
    expect(weight()).toBe('600');
  });
});

describe('FiltersSheet', () => {
  it('footer says how many the filter shows, and closes', () => {
    const onClose = vi.fn();
    renderUi(<FiltersSheet open onClose={onClose} sections={[]} lib={lib()} facets={{ base: null, current: null }} sectionsOpen={{}} onToggleSection={() => {}} total={1} />);
    const show = screen.getByTestId('filters-sheet-show');
    expect(show).toHaveTextContent('Show 1 book');
    fireEvent.click(show);
    expect(onClose).toHaveBeenCalled();
  });
});

describe('SaveViewDialog', () => {
  it('suggests a name from the chips, hands the name to onSave, toasts and closes', async () => {
    const onSave = vi.fn().mockResolvedValue({});
    const onClose = vi.fn();
    renderUi(<SaveViewDialog open onClose={onClose} onSave={onSave} chips={CHIPS} fallbackName="Title" savedMessage={(n) => `Kept ${n}.`} />);
    const name = screen.getByLabelText('Name');
    expect(name).toHaveValue('Banks');
    expect(screen.getByText(/2 filters and the current sort\. Open it from the sidebar any time\./)).toBeInTheDocument();
    fireEvent.change(name, { target: { value: '  Culture  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onSave).toHaveBeenCalledWith('Culture');
    expect(await screen.findByText('Kept Culture.')).toBeInTheDocument();
  });

  it('a failed save stays open and says why', async () => {
    const onClose = vi.fn();
    renderUi(<SaveViewDialog open onClose={onClose} onSave={() => Promise.reject(new Error('Too many views'))} chips={[]} fallbackName="Title" />);
    expect(screen.getByLabelText('Name')).toHaveValue('Title');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Too many views')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('SavedViews', () => {
  const VIEWS = [
    { id: 'v1', name: 'Culture' },
    { id: 'v2', name: 'Unread' },
  ];

  it('links each view where the app says, marks the active one, and reports a failed delete inline', async () => {
    const onDelete = vi.fn().mockRejectedValue(new Error('nope'));
    renderUi(<SavedViews views={VIEWS} activeId="v2" hrefFor={(v) => `/?view=${v.id}`} onDelete={onDelete} />);
    expect(screen.getByRole('link', { name: 'Culture' })).toHaveAttribute('href', '/?view=v1');
    expect(screen.getByRole('link', { name: 'Unread' })).toHaveAttribute('aria-current', 'page');
    fireEvent.click(screen.getByRole('button', { name: 'Options for Culture' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete view' }));
    expect(onDelete).toHaveBeenCalledWith(VIEWS[0]);
    expect(await screen.findByRole('alert')).toHaveTextContent('“Culture” was not deleted.');
  });

  it('no views, nothing', () => {
    const { container } = renderUi(<SavedViews views={[]} hrefFor={() => '/'} onDelete={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
});
