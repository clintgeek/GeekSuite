import { describe, expect, it } from 'vitest';
import { addTags, normalizeTag } from '../../components/TagInput';
import { filterInputFromSearch, readLibraryState } from '../../utils/libraryFilter';

// The suite tag standard (2026-10-01, DOCS/TAG_STANDARD.md, @geeksuite/tags):
// lowercase kebab-case, `/` for nesting; ThingGeek keeps its 60-char cap.
describe('TagInput — tags are added in the standard spelling', () => {
  it('normalizes each tag as it is added', () => {
    expect(normalizeTag('Fly Rods')).toBe('fly-rods');
    expect(normalizeTag('#GeekSuite')).toBe('geek-suite');
    expect(normalizeTag('Garage/Top Shelf')).toBe('garage/top-shelf');
    expect(normalizeTag('&&')).toBe('');
  });

  it('caps at 60 without ending on a separator', () => {
    const t = normalizeTag(`${'a'.repeat(59)} b`);
    expect(t.length).toBeLessThanOrEqual(60);
    expect(t).not.toMatch(/[-/]$/);
  });

  it('comma-separated input; duplicates after normalizing are dropped', () => {
    expect(addTags(['fishing'], 'Fishing, Fly Rods, flyRods,  ,boat')).toEqual(['fishing', 'fly-rods', 'boat']);
  });

  it('existing legacy chips are folded too', () => {
    expect(addTags(['Fishing'], 'fishing')).toEqual(['fishing']);
  });
});

describe('library links read tags in the standard spelling', () => {
  it('?tag=Fishing selects the stored fishing', () => {
    expect(readLibraryState(new URLSearchParams('tag=Fishing&tag=fishing&tag=Fly%20Rods')).filter.tags).toEqual(['fishing', 'fly-rods']);
    expect(filterInputFromSearch('?tag=GeekSuite').tags).toEqual(['geek-suite']);
  });
});
