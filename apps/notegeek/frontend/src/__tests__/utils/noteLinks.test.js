import { describe, it, expect } from 'vitest';
import {
  containsNoteLink,
  insertLink,
  noteHref,
  noteLinkMarkup,
  supportsLinkInsertion,
} from '../../utils/noteLinks';

/**
 * The link convention, pinned.
 *
 * A related-note chip has to write markup the note's own editor will render.
 * Getting this wrong is invisible in a markdown note (you see the brackets)
 * and destructive in a mind map (you corrupt the snapshot), so both halves are
 * tested: what gets written, and where it is allowed to be written at all.
 */
describe('supportsLinkInsertion', () => {
  it('allows the three prose types and refuses the two snapshot types', () => {
    expect(supportsLinkInsertion('text')).toBe(true);
    expect(supportsLinkInsertion('markdown')).toBe(true);
    expect(supportsLinkInsertion('code')).toBe(true);
    // These store a serialized editor snapshot in `content`; splicing markup
    // into that JSON destroys the note.
    expect(supportsLinkInsertion('mindmap')).toBe(false);
    expect(supportsLinkInsertion('handwritten')).toBe(false);
  });
});

describe('noteLinkMarkup', () => {
  it('writes markdown for markdown and code notes', () => {
    expect(noteLinkMarkup('markdown', { id: 'abc', title: 'nginx layout' })).toBe(
      '[nginx layout](/notes/abc)'
    );
    expect(noteLinkMarkup('code', { id: 'abc', title: 'nginx layout' })).toBe(
      '[nginx layout](/notes/abc)'
    );
  });

  it('writes an anchor for a rich-text note, whose body IS html', () => {
    expect(noteLinkMarkup('text', { id: 'abc', title: 'nginx & co' })).toBe(
      '<a href="/notes/abc">nginx &amp; co</a>'
    );
  });

  it('escapes brackets in a title so the markdown link does not break', () => {
    expect(noteLinkMarkup('markdown', { id: '1', title: 'Re: [draft] plans' })).toBe(
      '[Re: \\[draft\\] plans](/notes/1)'
    );
  });

  it('never produces an empty label', () => {
    expect(noteLinkMarkup('markdown', { id: '1', title: '   ' })).toBe('[Untitled note](/notes/1)');
  });

  it('routes to the same path the rest of the app links to', () => {
    expect(noteHref('abc')).toBe('/notes/abc');
  });
});

describe('insertLink', () => {
  it('splices at the caret, spacing only where spacing is missing', () => {
    expect(insertLink('one two', '[L](/notes/1)', { caret: 3, noteType: 'markdown' })).toBe(
      'one [L](/notes/1) two'
    );
    expect(insertLink('onetwo', '[L](/notes/1)', { caret: 3, noteType: 'markdown' })).toBe(
      'one [L](/notes/1) two'
    );
  });

  it('appends on its own line when there is no caret', () => {
    expect(insertLink('body text\n\n', '[L](/notes/1)', { noteType: 'markdown' })).toBe(
      'body text\n\n[L](/notes/1)'
    );
    expect(insertLink('', '[L](/notes/1)', { noteType: 'markdown' })).toBe('[L](/notes/1)');
  });

  it('ignores an out-of-range caret rather than truncating the body', () => {
    expect(insertLink('short', '[L](/notes/1)', { caret: 999, noteType: 'markdown' })).toBe(
      'short\n\n[L](/notes/1)'
    );
    expect(insertLink('short', '[L](/notes/1)', { caret: -1, noteType: 'markdown' })).toBe(
      'short\n\n[L](/notes/1)'
    );
  });

  it('appends a paragraph for a rich-text body, caret or not', () => {
    // A textarea offset means nothing inside a ProseMirror document's HTML, so
    // it is deliberately ignored rather than used to cut a tag in half.
    expect(insertLink('<p>hi</p>', '<a href="/notes/1">L</a>', { caret: 4, noteType: 'text' })).toBe(
      '<p>hi</p><p><a href="/notes/1">L</a></p>'
    );
  });
});

describe('containsNoteLink', () => {
  it('stops a second tap from duplicating a link', () => {
    expect(containsNoteLink('see [L](/notes/abc) above', 'abc')).toBe(true);
    expect(containsNoteLink('see [L](/notes/abc) above', 'xyz')).toBe(false);
    expect(containsNoteLink('', 'abc')).toBe(false);
  });
});
