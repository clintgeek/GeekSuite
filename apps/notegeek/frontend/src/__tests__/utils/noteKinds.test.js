import { describe, it, expect } from 'vitest';
import { kindForPath, kindListQuery, kindRoots, isOneOnOnePath, oneOnOnesPath } from '../../utils/noteKinds';

describe('note kinds', () => {
  it('Notes leaves out the dailies, the meetings and the 1:1s, wherever 1:1s are kept', () => {
    expect(kindListQuery('notes', 'fd/1on1')).toEqual({ notUnder: ['daily', 'meeting', 'fd/1on1'] });
    expect(kindListQuery('notes', 'people')).toEqual({ notUnder: ['daily', 'meeting', 'people'] });
    expect(kindRoots('')).toEqual(['daily', 'meeting']);
  });

  it('a kind of its own lists its tag; Everything narrows nothing', () => {
    expect(kindListQuery('dailies', 'fd/1on1')).toEqual({ under: 'daily' });
    expect(kindListQuery('meetings', 'fd/1on1')).toEqual({ under: 'meeting' });
    expect(kindListQuery('everything', 'fd/1on1')).toEqual({});
  });

  it('knows a kind list from a note', () => {
    expect(kindForPath('/notes')).toBe('notes');
    expect(kindForPath('/notes/')).toBe('notes');
    expect(kindForPath('/meetings')).toBe('meetings');
    expect(kindForPath('/dailies')).toBe('dailies');
    expect(kindForPath('/everything')).toBe('everything');
    expect(kindForPath('/notes/abc')).toBeNull();
    expect(kindForPath('/notes/new')).toBeNull();
    expect(kindForPath('/tags/meeting')).toBeNull();
  });

  it('1:1s are the 1:1 tag and its people', () => {
    expect(oneOnOnesPath('fd/1on1')).toBe('/tags/fd%2F1on1');
    expect(isOneOnOnePath('/tags/fd%2F1on1', 'fd/1on1')).toBe(true);
    expect(isOneOnOnePath('/tags/fd%2F1on1%2Falex', 'fd/1on1')).toBe(true);
    expect(isOneOnOnePath('/tags/fd%2F1on1x', 'fd/1on1')).toBe(false);
    expect(isOneOnOnePath('/tags/fd', 'fd/1on1')).toBe(false);
    expect(isOneOnOnePath('/notes', 'fd/1on1')).toBe(false);
  });
});
