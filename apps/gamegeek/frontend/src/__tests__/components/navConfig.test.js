import { describe, expect, it } from 'vitest';
import {
  APP_NAME,
  LIBRARY_NAV_ID,
  SETTINGS_NAV_ID,
  activeNavId,
  gamePath,
  isFabVisible,
  isLibraryPath,
  libraryPath,
  shelfNavId,
  titleFor,
} from '../../components/navConfig';

describe('navConfig', () => {
  it('maps each route to its title', () => {
    expect(titleFor('/')).toBe('Library');
    expect(titleFor('/game/abc')).toBe('Library');
    expect(titleFor('/add')).toBe('Library');
    expect(titleFor('/settings')).toBe('Settings');
    expect(titleFor('/nope')).toBe(APP_NAME);
  });

  it('keeps the library row lit under its overlays, and names shelves', () => {
    expect(activeNavId('/')).toBe(LIBRARY_NAV_ID);
    expect(activeNavId('/', '?shelf=all')).toBe(LIBRARY_NAV_ID);
    expect(activeNavId('/', '?shelf=backlog')).toBe(shelfNavId('backlog'));
    expect(activeNavId('/game/g1', '?shelf=playing&sort=title')).toBe('shelf:playing');
    expect(activeNavId('/add')).toBe(LIBRARY_NAV_ID);
    expect(activeNavId('/settings', '?shelf=backlog')).toBe(SETTINGS_NAV_ID);
    expect(activeNavId('/unknown')).toBeNull();
  });

  it('knows which paths are the library and where the FAB belongs', () => {
    expect(isLibraryPath('/')).toBe(true);
    expect(isLibraryPath('/game/x')).toBe(true);
    expect(isLibraryPath('/settings')).toBe(false);
    expect(isFabVisible('/')).toBe(true);
    expect(isFabVisible('/game/x')).toBe(false);
    expect(isFabVisible('/add')).toBe(false);
    expect(isFabVisible('/settings')).toBe(false);
  });

  it('carries the library query string through the detail path and back', () => {
    expect(gamePath('g 1', '?shelf=backlog')).toBe('/game/g%201?shelf=backlog');
    expect(libraryPath('?shelf=backlog')).toBe('/?shelf=backlog');
    expect(libraryPath('')).toBe('/');
  });
});
