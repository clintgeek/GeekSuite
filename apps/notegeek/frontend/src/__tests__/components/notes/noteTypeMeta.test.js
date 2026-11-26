import { describe, it, expect } from 'vitest';
import { NOTE_TYPE_ORDER, normalizeNoteType, noteTypeMeta, newNotePath } from '../../../components/notes/noteTypeMeta';

describe('normalizeNoteType', () => {
  it('keeps handwritten, and reads everything else as markdown', () => {
    expect(normalizeNoteType('handwritten')).toBe('handwritten');
    expect(normalizeNoteType('markdown')).toBe('markdown');
    for (const old of ['text', 'code', 'mindmap', 'richtext', '', null, undefined]) {
      expect(normalizeNoteType(old)).toBe('markdown');
    }
  });

  it('gives a removed type the Markdown glyph and name', () => {
    expect(noteTypeMeta('mindmap')).toBe(noteTypeMeta('markdown'));
  });

  it('offers two types', () => {
    expect(NOTE_TYPE_ORDER).toEqual(['markdown', 'handwritten']);
    expect(newNotePath('markdown')).toBe('/notes/new');
  });
});
