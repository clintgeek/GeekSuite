import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import FilterSheet from '../../components/FilterSheet';
import LibraryToolbar from '../../components/LibraryToolbar';
import {
  DEFAULT_LIBRARY,
  activeFilterCount,
  buildGamesVariables,
  readLibraryParams,
  writeLibraryParams,
} from '../../utils/librarySort';
import { renderWithProviders } from '../testUtils';

const vars = (search) => buildGamesVariables(readLibraryParams(new URLSearchParams(search)));

describe('library query state', () => {
  it('the plain library asks for page 1, title ascending, nothing else', () => {
    expect(vars('')).toEqual({ page: 1, limit: 48, sort: 'title', sortDir: 'asc' });
  });

  it('sends only what narrows', () => {
    expect(vars('?shelf=backlog&q=%20zelda%20&platform=switch&owned=true&sort=hoursPlayed&dir=desc')).toEqual({
      page: 1, limit: 48, q: 'zelda', shelf: 'backlog', platform: 'switch', owned: 'true', sort: 'hoursPlayed', sortDir: 'desc',
    });
    expect(vars('?shelf=all&owned=all')).toEqual({ page: 1, limit: 48, sort: 'title', sortDir: 'asc' });
    expect(vars('?shelf=unshelved')).toMatchObject({ shelf: 'unshelved' });
  });

  it('ignores unknown sorts and gives each sort its natural direction', () => {
    expect(vars('?sort=bogus')).toMatchObject({ sort: 'title', sortDir: 'asc' });
    expect(vars('?sort=rating')).toMatchObject({ sort: 'rating', sortDir: 'desc' });
  });

  it('a new sort resets the direction; defaults leave the URL', () => {
    const p = writeLibraryParams(new URLSearchParams('?sort=title&dir=desc&shelf=playing'), { sort: 'lastPlayed' });
    expect(p.get('sort')).toBe('lastPlayed');
    expect(p.get('dir')).toBeNull(); // desc is lastPlayed's default
    expect(p.get('shelf')).toBe('playing');
    const back = writeLibraryParams(p, { sort: 'title', shelf: 'all' });
    expect(back.toString()).toBe('');
  });

  it('counts narrowing filters', () => {
    expect(activeFilterCount(DEFAULT_LIBRARY)).toBe(0);
    expect(activeFilterCount({ ...DEFAULT_LIBRARY, platform: 'pc', owned: 'false' })).toBe(2);
  });
});

describe('sort and filter controls → variables', () => {
  function drive(patchFrom) {
    let params = new URLSearchParams('');
    const onPatch = vi.fn((p) => {
      params = writeLibraryParams(params, p);
    });
    patchFrom(onPatch);
    return () => buildGamesVariables(readLibraryParams(params));
  }

  it('the sheet’s sort, direction, platform and ownership land in the query', () => {
    let current;
    const read = drive((onPatch) => {
      renderWithProviders(
        <FilterSheet
          open
          onClose={() => {}}
          total={12}
          state={DEFAULT_LIBRARY}
          platforms={[{ shelf: 'switch', count: 3 }, { shelf: 'pc', count: 9 }]}
          onPatch={onPatch}
          onReset={() => {}}
        />
      );
      fireEvent.click(screen.getByRole('button', { name: 'Hours played' }));
      fireEvent.click(screen.getByRole('button', { name: /^Switch/ }));
      fireEvent.click(screen.getByRole('button', { name: 'Owned' }));
    });
    current = read();
    expect(current).toEqual({ page: 1, limit: 48, sort: 'hoursPlayed', sortDir: 'desc', platform: 'switch', owned: 'true' });
  });

  it('removing a toolbar chip clears just that filter', () => {
    const onPatch = vi.fn();
    renderWithProviders(
      <LibraryToolbar
        total={3}
        state={{ ...DEFAULT_LIBRARY, platform: 'switch', q: 'mario' }}
        filterCount={1}
        onOpenSheet={() => {}}
        onPatch={onPatch}
        view="grid"
        onToggleView={() => {}}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Remove On Switch' }));
    expect(onPatch).toHaveBeenCalledWith({ platform: '' });
    fireEvent.click(screen.getByRole('button', { name: 'Remove Search: mario' }));
    expect(onPatch).toHaveBeenCalledWith({ q: '' });
  });
});
