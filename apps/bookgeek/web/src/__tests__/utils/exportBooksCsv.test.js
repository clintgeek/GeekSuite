/**
 * CSV export — the escaping cases that break naive implementations.
 *
 * Book metadata is close to the worst input a CSV writer sees: titles with
 * commas, reviews with newlines and quotes, author lists that are themselves
 * comma-separated, and a lot of text imported from Goodreads and Calibre
 * rather than typed here.
 */
import { describe, it, expect } from 'vitest';
import {
  buildBooksCsv,
  booksCsvFilename,
  csvField,
  csvValue,
  bookToRow,
  BOOK_CSV_COLUMNS,
} from '../../utils/exportBooksCsv.js';

const COLS = [
  { key: 'title', label: 'Title' },
  { key: 'authors', label: 'Authors' },
];

const lines = (csv) => csv.split('\r\n');

describe('csvValue', () => {
  it('renders an empty cell for null and undefined, not the word', () => {
    // String(null) === 'null' is what a naive export ships.
    expect(csvValue(null)).toBe('');
    expect(csvValue(undefined)).toBe('');
  });

  it('keeps a false rather than treating it as empty', () => {
    // `owned: false` is a real answer; a falsiness check would lose it.
    expect(csvValue(false)).toBe('No');
    expect(csvValue(true)).toBe('Yes');
  });

  it('keeps a zero', () => {
    expect(csvValue(0)).toBe('0');
  });

  it('joins arrays with semicolons, since commas are the delimiter', () => {
    expect(csvValue(['Pratchett', 'Gaiman'])).toBe('Pratchett; Gaiman');
  });

  it('drops holes in an array rather than writing empty segments', () => {
    expect(csvValue(['Pratchett', null, 'Gaiman'])).toBe('Pratchett; Gaiman');
  });
});

describe('csvField escaping', () => {
  it('quotes a value containing a comma', () => {
    expect(csvField('Eats, Shoots & Leaves')).toBe('"Eats, Shoots & Leaves"');
  });

  it('quotes and doubles an inner double quote', () => {
    expect(csvField('The "Good" Parts')).toBe('"The ""Good"" Parts"');
  });

  it('quotes a value containing a newline', () => {
    // A multi-line review must not become two CSV rows.
    expect(csvField('line one\nline two')).toBe('"line one\nline two"');
    expect(csvField('line one\r\nline two')).toBe('"line one\r\nline two"');
  });

  it('leaves an ordinary value unquoted', () => {
    expect(csvField('Small Gods')).toBe('Small Gods');
  });

  it('leaves an empty value as an empty cell', () => {
    expect(csvField('')).toBe('');
    expect(csvField(null)).toBe('');
  });
});

describe('csvField defuses spreadsheet formulas', () => {
  // A cell opening with any of these is executed by Excel and Sheets. Much of
  // this library was imported rather than typed, so the text is not all
  // self-authored.
  it.each([
    ['=1+1', "'=1+1"],
    ['+44 Books', "'+44 Books"],
    ['-Dashes', "'-Dashes"],
    ['@handle', "'@handle"],
  ])('prefixes %s', (input, expected) => {
    expect(csvField(input)).toBe(expected);
  });

  it('defuses inside the quotes when the value also needs quoting', () => {
    // Both rules have to apply, and in this order.
    expect(csvField('=HYPERLINK("x"),y')).toBe('"\'=HYPERLINK(""x""),y"');
  });

  it('does not touch a hyphen that is not leading', () => {
    expect(csvField('Cat-in-the-Hat')).toBe('Cat-in-the-Hat');
  });

  it('does not touch a negative number rendered mid-cell', () => {
    expect(csvField('Book 2 - The Sequel')).toBe('Book 2 - The Sequel');
  });
});

describe('bookToRow', () => {
  it('splits series into name and index so the index stays sortable', () => {
    const row = bookToRow({ title: 'Mort', series: { name: 'Discworld', index: 4 } });
    expect(row.seriesName).toBe('Discworld');
    expect(row.seriesIndex).toBe(4);
  });

  it('survives a book with no series', () => {
    const row = bookToRow({ title: 'Good Omens' });
    expect(row.seriesName).toBe('');
    expect(row.seriesIndex).toBe('');
  });

  it('survives an empty book', () => {
    expect(() => bookToRow()).not.toThrow();
  });
});

describe('buildBooksCsv', () => {
  it('writes a header row even when nothing matched', () => {
    // A header-only file tells the user the export ran and the filter was
    // empty — better than a zero-byte download.
    const csv = buildBooksCsv([], { columns: COLS });
    expect(csv).toBe('Title,Authors');
  });

  it('uses CRLF line endings', () => {
    const csv = buildBooksCsv([{ title: 'Mort', authors: ['Pratchett'] }], { columns: COLS });
    expect(csv).toContain('\r\n');
    expect(csv).toBe('Title,Authors\r\nMort,Pratchett');
  });

  it('keeps a multi-line review inside one row', () => {
    const csv = buildBooksCsv(
      [{ title: 'Mort', authors: ['a\nb'] }],
      { columns: COLS }
    );
    // Two CRLF-separated records: the header and the one book.
    expect(lines(csv)).toHaveLength(2);
  });

  it('preserves the order it is given', () => {
    // The caller is responsible for matching on-screen order; this must not
    // re-sort behind its back.
    const csv = buildBooksCsv(
      [{ title: 'Zebra' }, { title: 'Apple' }],
      { columns: [{ key: 'title', label: 'Title' }] }
    );
    expect(lines(csv)).toEqual(['Title', 'Zebra', 'Apple']);
  });

  it('handles a non-array defensively', () => {
    expect(buildBooksCsv(null, { columns: COLS })).toBe('Title,Authors');
    expect(buildBooksCsv(undefined, { columns: COLS })).toBe('Title,Authors');
  });

  it('writes every declared column for a real-shaped book', () => {
    const book = {
      id: 'b1',
      title: 'Small Gods',
      authors: ['Terry Pratchett'],
      series: { name: 'Discworld', index: 13 },
      isbn: '0575042176',
      owned: true,
      rating: 5,
      tags: ['fantasy', 'satire'],
      shelf: 'read',
    };
    const csv = buildBooksCsv([book]);
    const [header, row] = lines(csv);
    expect(header.split(',')).toHaveLength(BOOK_CSV_COLUMNS.length);
    expect(row).toContain('Small Gods');
    expect(row).toContain('Terry Pratchett');
    expect(row).toContain('Discworld');
    expect(row).toContain('fantasy; satire');
    expect(row).toContain('Yes'); // owned
  });

  it('does not emit the strings null or undefined for missing fields', () => {
    const csv = buildBooksCsv([{ title: 'Sparse' }]);
    expect(csv).not.toMatch(/\bnull\b/);
    expect(csv).not.toMatch(/\bundefined\b/);
  });
});

describe('booksCsvFilename', () => {
  const when = new Date(2026, 8, 20); // 2026-09-20 local

  it('names a plain export by the app and the local day', () => {
    expect(booksCsvFilename({}, when)).toBe('bookgeek-2026-09-20.csv');
  });

  it('folds the active filters into the name', () => {
    // Two exports minutes apart must be tellable apart in a downloads folder.
    expect(booksCsvFilename({ shelf: 'reading' }, when)).toBe('bookgeek-reading-2026-09-20.csv');
    expect(booksCsvFilename({ tag: 'sci-fi' }, when)).toBe('bookgeek-tag-sci-fi-2026-09-20.csv');
  });

  it('ignores the "all" shelf, which is not a filter', () => {
    expect(booksCsvFilename({ shelf: 'all' }, when)).toBe('bookgeek-2026-09-20.csv');
  });

  it('slugifies a filter containing spaces and punctuation', () => {
    const name = booksCsvFilename({ author: 'Terry Pratchett' }, when);
    expect(name).toBe('bookgeek-by-terry-pratchett-2026-09-20.csv');
    expect(name).not.toMatch(/[^a-z0-9.-]/);
  });

  it('cannot produce a path separator from a filter value', () => {
    // A tag is user text and ends up in a filename.
    const name = booksCsvFilename({ tag: '../../etc/passwd' }, when);
    expect(name).not.toContain('/');
    expect(name).not.toContain('..');
  });

  it('caps a very long filter so the name stays usable', () => {
    const name = booksCsvFilename({ q: 'x'.repeat(300) }, when);
    expect(name.length).toBeLessThan(110);
    expect(name.endsWith('.csv')).toBe(true);
  });
});
