import { describe, expect, it } from 'vitest';
import { attributeColumns, BOM, buildInsuranceCsv, csvCell, hasReceipt } from '../../utils/insuranceCsv';
import { date, makeRifle, makeThing } from '../fixtures';

function parse(text) {
  // Minimal RFC 4180 reader for assertions.
  const rows = [];
  let row = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\r' && text[i + 1] === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      i += 1;
    } else cell += c;
  }
  return rows;
}

describe('insurance CSV', () => {
  const wendy = makeThing({
    nextDue: date({ date: '2020-03-03T00:00:00.000Z', occursOn: '2027-03-03T00:00:00.000Z', recurEveryMonths: 12 }),
    documents: [{ __typename: 'ThingDocument', id: 'doc1', fileId: 'f1', role: 'receipt', title: 'Bass Pro receipt', url: '/api/files/f1', mime: 'application/pdf', size: 1000, originalName: 'r.pdf' }],
    notes: 'Spare key, "blue" float,\nin the tackle box',
  });
  const rifle = makeRifle();
  const text = buildInsuranceCsv([wendy, rifle]);
  const rows = parse(text.slice(1));
  const header = rows[0];
  const col = (r, name) => r[header.indexOf(name)];

  it('is UTF-8 with a BOM and CRLF rows', () => {
    expect(text[0]).toBe(BOM);
    expect(text.charCodeAt(0)).toBe(0xfeff);
    expect(text.endsWith('\r\n')).toBe(true);
    expect(rows).toHaveLength(3);
  });

  it('writes identifiers in full — never masked', () => {
    expect(col(rows[1], 'Hull number')).toBe('ABC1234567');
    expect(col(rows[2], 'Serial number')).toBe('XYZ9876543');
    expect(text).not.toContain('•');
  });

  it('merges attribute columns by label + unit, blank where a type lacks one', () => {
    expect(header.filter((h) => h === 'Manufacturer')).toHaveLength(1);
    expect(header).toContain('Length (ft)');
    expect(col(rows[1], 'Manufacturer')).toBe('Tracker');
    expect(col(rows[2], 'Manufacturer')).toBe('Ruger');
    expect(col(rows[2], 'Length (ft)')).toBe('');
    expect(attributeColumns([wendy, rifle]).map((c) => c.header)).toEqual(['Manufacturer', 'Length (ft)', 'Hull number', 'Model', 'Serial number']);
  });

  it('core fields: money as numbers, calendar dates as UTC days, receipt, counts', () => {
    expect(col(rows[1], 'Current value')).toBe('18500');
    expect(col(rows[1], 'Purchase price')).toBe('21000');
    expect(col(rows[1], 'Acquired')).toBe('2021-05-01');
    expect(col(rows[1], 'Place')).toBe('House › Garage › Shelf 2');
    expect(col(rows[1], 'Tags')).toBe('fishing; lake');
    expect(col(rows[1], 'Receipt on file')).toBe('Yes');
    expect(col(rows[2], 'Receipt on file')).toBe('No');
    expect(col(rows[1], 'Documents')).toBe('1');
    expect(col(rows[1], 'Next due date')).toBe('2027-03-03');
  });

  it('quotes commas, quotes and newlines', () => {
    expect(col(rows[1], 'Notes')).toBe('Spare key, "blue" float,\nin the tackle box');
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('plain')).toBe('plain');
    expect(csvCell(null)).toBe('');
  });

  it('a receipt photo counts too', () => {
    expect(hasReceipt({ photos: [{ role: 'receipt' }] })).toBe(true);
    expect(hasReceipt({ photos: [{ role: 'overview' }], documents: [{ role: 'manual' }] })).toBe(false);
  });
});
