import { describe, it, expect } from 'vitest';
import { navSectionsFor, pageTitle, storyIdFrom } from '../../components/navConfig';

// UX review 2026-11-18, StoryGeek #7: "Characters" led to a placeholder.
describe('navConfig — This Tale', () => {
  it('offers the table and no dead-end Characters row', () => {
    const sections = navSectionsFor('/play/abc');
    const thisTale = sections.find((s) => s.label === 'This Tale');
    expect(thisTale.items.map((i) => i.label)).toEqual(['At the Table']);
    expect(sections.flatMap((s) => s.items).some((i) => /character/i.test(i.label))).toBe(false);
    expect(thisTale.items[0].to).toBe('/play/abc');
  });

  it('still reads the tale from an old /characters link', () => {
    expect(storyIdFrom('/characters/abc')).toBe('abc');
    expect(pageTitle('/play/abc')).toBe('At the Table');
  });
});
