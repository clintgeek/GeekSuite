import { describe, expect, it } from 'vitest';
import { PASTE_LIST_MAX, parsePasteList } from '../../utils/pasteList';
import { pasteInputs } from '../../views/add/candidate';

describe('parsePasteList', () => {
  it('trims, collapses whitespace, strips list markers and skips blanks', () => {
    const { titles } = parsePasteList('  Hades \n\n- Celeste\n* Disco   Elysium\n1. Outer Wilds\n2) Tunic\n• Inscryption\n   \n');
    expect(titles).toEqual(['Hades', 'Celeste', 'Disco Elysium', 'Outer Wilds', 'Tunic', 'Inscryption']);
  });

  it('dedupes case-insensitively, keeping the first spelling', () => {
    const r = parsePasteList('Hades\nHADES\nhades \nCeleste\r\ncelESTE');
    expect(r.titles).toEqual(['Hades', 'Celeste']);
    expect(r.duplicates).toBe(3);
  });

  it(`caps at ${PASTE_LIST_MAX} and reports the overflow`, () => {
    const text = Array.from({ length: 205 }, (_, i) => `Game ${i + 1}`).join('\n');
    const r = parsePasteList(text);
    expect(r.titles).toHaveLength(200);
    expect(r.titles[199]).toBe('Game 200');
    expect(r.overflow).toBe(5);
  });

  it('keeps numbers that are part of a title', () => {
    expect(parsePasteList('1942\n2064: Read Only Memories\n7 Days to Die').titles).toEqual(['1942', '2064: Read Only Memories', '7 Days to Die']);
  });

  it('builds one GameInput per title with the chosen copy', () => {
    expect(pasteInputs(['Hades'], { platform: 'pc', format: 'digital', storefront: 'gog' })).toEqual([
      { title: 'Hades', source: 'paste-list', platformsAvailable: ['pc'], copies: [{ platform: 'pc', format: 'digital', storefront: 'gog' }] },
    ]);
    expect(pasteInputs(['Hades'], { platform: '', format: 'digital', storefront: 'gog' })[0].copies).toEqual([]);
  });
});
