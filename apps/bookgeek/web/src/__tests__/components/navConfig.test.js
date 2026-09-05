import { describe, it, expect } from 'vitest';
import { activeNavId, isFabHidden, shelfCount, shelfNavId, viewTitle } from '../../components/navConfig';
import { SHELF_SUMMARY } from '../fixtures';

describe('viewTitle', () => {
  it('names the library and settings views', () => {
    expect(viewTitle('library')).toBe('Library');
    expect(viewTitle('profile')).toBe('Settings');
  });

  it('falls back to the app name for an unknown view', () => {
    expect(viewTitle('nonsense')).toBe('BookGeek');
  });
});

describe('activeNavId', () => {
  it('is the settings row in the profile view', () => {
    expect(activeNavId({ activeView: 'profile', shelfFilter: 'reading' })).toBe('settings');
  });

  it('is the library row with no shelf filter (or "all")', () => {
    expect(activeNavId({ activeView: 'library', shelfFilter: null })).toBe('library');
    expect(activeNavId({ activeView: 'library', shelfFilter: 'all' })).toBe('library');
  });

  it('is the shelf row while browsing one shelf', () => {
    expect(activeNavId({ activeView: 'library', shelfFilter: 'reading' })).toBe(shelfNavId('reading'));
  });
});

describe('shelfCount', () => {
  it('returns null with no summary loaded yet', () => {
    expect(shelfCount(null, 'reading')).toBeNull();
  });

  it('reads the total for "all"', () => {
    expect(shelfCount(SHELF_SUMMARY, 'all')).toBe(223);
  });

  it("reads a specific shelf's count", () => {
    expect(shelfCount(SHELF_SUMMARY, 'reading')).toBe(2);
  });

  it('returns null for a shelf missing from the summary', () => {
    expect(shelfCount(SHELF_SUMMARY, 'nonexistent-shelf')).toBeNull();
  });
});

describe('isFabHidden', () => {
  it('hides off the library view', () => {
    expect(isFabHidden({ activeView: 'profile', selectMode: false, basketBookIds: [] })).toBe(true);
  });

  it('hides in select mode', () => {
    expect(isFabHidden({ activeView: 'library', selectMode: true, basketBookIds: [] })).toBe(true);
  });

  it('hides with anything already in the device basket', () => {
    expect(isFabHidden({ activeView: 'library', selectMode: false, basketBookIds: ['b1'] })).toBe(true);
  });

  it('shows on the library view, not selecting, empty basket', () => {
    expect(isFabHidden({ activeView: 'library', selectMode: false, basketBookIds: [] })).toBe(false);
  });
});
