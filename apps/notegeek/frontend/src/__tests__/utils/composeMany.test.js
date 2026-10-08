/**
 * Compose from several notes — the client's rules (DOCS/COMPOSE_MANY_AND_ARCHIVE_SPEC.md
 * U3, U4, C3): the new note's title, the order the notes go in, and how the
 * notes left out are named.
 */
import { describe, it, expect } from 'vitest';
import { composedTitle, oldestFirst, skipSummary, skipHint } from '../../utils/composeMany';
import { composeSkipReason } from '../../hooks/useNoteSelection';

describe('composedTitle (U4)', () => {
  it('is the first level-one heading', () => {
    expect(composedTitle('Intro line\n\n# Garden plan\n\n## Beds\n\n# Later')).toBe('Garden plan');
  });

  it('is "Composed note" when there is no level-one heading', () => {
    expect(composedTitle('## Only a sub-heading\n\ntext')).toBe('Composed note');
    expect(composedTitle('')).toBe('Composed note');
  });

  it('ignores a heading inside a code fence', () => {
    expect(composedTitle('```sh\n# not a title\n```\n\n# Real title')).toBe('Real title');
  });

  it('drops closing hashes and caps at 500 characters', () => {
    expect(composedTitle('# Roof ##')).toBe('Roof');
    expect(composedTitle(`# ${'x'.repeat(600)}`)).toHaveLength(500);
  });
});

describe('oldestFirst (C3)', () => {
  it('orders by createdAt, oldest first, without touching the input', () => {
    const notes = [
      { id: 'b', createdAt: '2026-10-02T00:00:00Z' },
      { id: 'a', createdAt: '2026-09-01T00:00:00Z' },
      { id: 'c', createdAt: '2026-10-05T00:00:00Z' },
    ];
    expect(oldestFirst(notes).map((n) => n.id)).toEqual(['a', 'b', 'c']);
    expect(notes[0].id).toBe('b');
  });
});

describe('skipSummary (U3)', () => {
  it('names each note left out and why, in the spec\'s words', () => {
    const byId = new Map([['s4', { id: 's4', type: 'handwritten', title: 'Sketch 4' }]]);
    expect(skipSummary([
      { id: 'g', title: 'Garden plan', reason: 'locked' },
      { id: 's4', title: 'Sketch 4', reason: 'unsupported_type' },
    ], byId)).toBe('2 notes left out: Garden plan (locked), Sketch 4 (a sketch)');
  });

  it('calls a mind map a mind map, and says empty / not found', () => {
    const byId = new Map([['m', { id: 'm', type: 'mindmap' }]]);
    expect(skipSummary([
      { id: 'm', title: 'Apps', reason: 'unsupported_type' },
      { id: 'e', title: '', reason: 'empty' },
      { id: 'x', title: 'Gone', reason: 'not_found' },
    ], byId)).toBe('3 notes left out: Apps (a mind map), Untitled (empty), Gone (not found)');
  });

  it('is empty when nothing was left out', () => {
    expect(skipSummary([])).toBe('');
    expect(skipSummary(undefined)).toBe('');
  });
});

describe('what the action bar counts as skipped (U2)', () => {
  it('counts sketches, mind maps and locked or encrypted notes', () => {
    expect(composeSkipReason({ type: 'handwritten' })).toBe('unsupported_type');
    expect(composeSkipReason({ type: 'mindmap' })).toBe('unsupported_type');
    expect(composeSkipReason({ type: 'markdown', isLocked: true })).toBe('locked');
    expect(composeSkipReason({ type: 'text', isEncrypted: true })).toBe('locked');
  });

  it('does not count prose: markdown, rich text, code, the legacy null type', () => {
    for (const type of ['markdown', 'text', 'code', null, undefined]) {
      expect(composeSkipReason({ type })).toBe(null);
    }
  });

  it('says how many in the hint', () => {
    expect(skipHint(0)).toBe('');
    expect(skipHint(1)).toMatch(/^1 will be skipped/);
  });
});
