import { describe, it, expect } from 'vitest';
import {
  canFoldInto,
  droppedLine,
  foldInputFromShare,
  foldTargetsFrom,
  opPreviewMarkdown,
  previewSegments,
  toOperationInput,
} from '../../utils/foldIn';

describe('toOperationInput', () => {
  it('sends back only what the gateway takes — never its own annotations', () => {
    const op = {
      __typename: 'FoldInOperation', id: 'op1', type: 'append_to_list', anchor: 'Red widow', items: ['Brown widow'],
      why: 'list of widows', location: 'List under "## Widow spiders"', start: 10, end: 10, text: '- Brown widow',
      heading: null, markdown: null,
    };
    expect(toOperationInput(op)).toEqual({ type: 'append_to_list', anchor: 'Red widow', items: ['Brown widow'], why: 'list of widows' });
  });

  it('keeps new_section at the end explicit', () => {
    expect(toOperationInput({ type: 'new_section', heading: 'Sources', afterHeading: null, markdown: '' })).toMatchObject({ afterHeading: null });
  });
});

describe('previewSegments', () => {
  it('marks inserts and removals at the gateway offsets and keeps the rest', () => {
    const src = 'A\n- one\n\nB old text\n';
    const segs = previewSegments(src, [
      { start: 8, end: 8, text: '- two' },
      { start: 11, end: 19, text: 'new text' },
    ]);
    expect(segs).toEqual([
      { kind: 'same', text: 'A\n- one\n' },
      { kind: 'ins', text: '- two\n' },
      { kind: 'same', text: '\nB ' },
      { kind: 'del', text: 'old text' },
      { kind: 'ins', text: 'new text' },
      { kind: 'same', text: '\n' },
    ]);
  });

  it('drops an overlapping or out-of-range op rather than inventing text', () => {
    const segs = previewSegments('abcdef', [{ start: 1, end: 4, text: 'X' }, { start: 2, end: 3, text: 'Y' }, { start: 99, end: 99, text: 'Z' }]);
    expect(segs).toEqual([
      { kind: 'same', text: 'a' },
      { kind: 'del', text: 'bcd' },
      { kind: 'ins', text: 'X' },
      { kind: 'same', text: 'ef' },
    ]);
  });
});

describe('foldInputFromShare', () => {
  it('joins title, text and link without saying the title twice', () => {
    expect(foldInputFromShare({ title: 'Brown widow', text: 'Brown widow found in garage', url: 'https://x.test/a' }))
      .toBe('Brown widow found in garage\n\nhttps://x.test/a');
    expect(foldInputFromShare({ title: 'Article', text: 'quote', url: '' })).toBe('Article\n\nquote');
  });
});

describe('foldTargetsFrom', () => {
  it('offers Markdown notes only, in search order, deduped, skipping locked ones', () => {
    const rows = [
      { _id: 'a', title: 'Old rich note', type: 'text' },
      { _id: 'b', title: 'Spiders', type: 'markdown', matchedBy: 'both', why: 'widows' },
      { _id: 'b', title: 'Spiders', type: 'markdown' },
      { _id: 'c', title: 'Secret', type: 'markdown', isLocked: true },
      { _id: 'd', title: 'Garden', type: 'markdown' },
      { _id: 'e', title: 'Sketch', type: 'handwritten' },
    ];
    expect(foldTargetsFrom(rows).map((r) => r.id)).toEqual(['b', 'd']);
  });
});

describe('small words', () => {
  it('discloses dropped suggestions honestly', () => {
    expect(droppedLine(0)).toBeNull();
    expect(droppedLine(1)).toBe("1 suggestion didn't match the note and was left out.");
    expect(droppedLine(2)).toBe("2 suggestions didn't match the note and were left out.");
  });

  it('shows a lone table row under its header', () => {
    const md = opPreviewMarkdown({ type: 'add_table_row', tableHeaderRow: '| Name | Size |', text: '| Peacock | 4 mm |' });
    expect(md).toBe('| Name | Size |\n| --- | --- |\n| Peacock | 4 mm |');
  });

  it('only markdown, unlocked notes can be folded into', () => {
    expect(canFoldInto({ type: 'markdown' })).toBe(true);
    expect(canFoldInto({ type: 'text' })).toBe(false);
    expect(canFoldInto({ type: 'markdown', isLocked: true })).toBe(false);
  });
});
