import { describe, it, expect } from 'vitest';
import parseTaskInput, { parseTaskInputDetailed } from '../../utils/parseTaskInput';
import { normalizePinned } from '../../hooks/usePinnedTags';
import { hasTag, tagCounts } from '../../utils/penViews';

// The suite tag standard (2026-10-01, DOCS/TAG_STANDARD.md, @geeksuite/tags):
// lowercase kebab-case, `/` for nesting. The add box reads `#tags` with the
// suite's one reader; what is saved is normalized.
const NOW = new Date(2026, 9, 1, 10, 0, 0);
const parse = (s) => parseTaskInput(s, { now: NOW });
const spansOf = (s, kind) => parseTaskInputDetailed(s, { now: NOW }).spans
  .filter((sp) => sp.kind === kind)
  .map((sp) => s.slice(sp.start, sp.end));

describe('#tags in the add box', () => {
  it('#GeekSuite saves geek-suite; the underline sits under what was typed', () => {
    const line = 'Ship release #GeekSuite tomorrow';
    expect(parse(line).tags).toEqual(['geek-suite']);
    expect(parse(line).content).toBe('Ship release');
    expect(spansOf(line, 'tag')).toEqual(['#GeekSuite']);
  });

  it('accepts / nesting, and never half-reads it as a /date', () => {
    const r = parse('Fix door #home/garage /tomorrow');
    expect(r.tags).toEqual(['home/garage']);
    expect(r.dueDate).toBeInstanceOf(Date);
    expect(r.content).toBe('Fix door');
    expect(spansOf('Fix door #home/garage /tomorrow', 'tag')).toEqual(['#home/garage']);
  });

  it('camelCase, snake_case and case variants are one tag', () => {
    expect(parse('a #offTicket #off_ticket #OffTicket').tags).toEqual(['off-ticket']);
  });

  it('a trailing slash and sentence punctuation are not part of the tag', () => {
    expect(parse('call #work/ now').tags).toEqual(['work']);
    expect(parse('call bob #work.').tags).toEqual(['work']);
  });

  it('is not fooled by C#, a#b or #1', () => {
    const r = parse('learn C# and a#b for bug #1');
    expect(r.tags).toBeUndefined();
    expect(r.content).toBe('learn C# and a#b for bug #1');
  });

  it('all-hex words are tags here (no colours in a task line)', () => {
    expect(parse('buy milk #cafe #add').tags).toEqual(['cafe', 'add']);
  });

  it('(private) and the other modifiers are unaffected', () => {
    const line = 'Fire Jane #HR (private) !high (weekly) /friday';
    const r = parse(line);
    expect(r.private).toBe(true);
    expect(r.priority).toBe(1);
    expect(r.recurrenceRule).toMatch(/FREQ=WEEKLY/);
    expect(r.tags).toEqual(['hr']);
    expect(r.content).toBe('Fire Jane');
    expect(spansOf(line, 'private')).toEqual(['(private)']);
    expect(spansOf(line, 'tag')).toEqual(['#HR']);
  });

  it('a tag right after (private) still starts at a boundary', () => {
    expect(parse('x (private)#hr').tags).toEqual(['hr']);
  });
});

describe('pins and filters in the standard spelling', () => {
  it('normalizePinned folds legacy pins and keeps 12', () => {
    expect(normalizePinned(['#geekSuite', 'geek-suite', 'Work', ' work ', '', null])).toEqual(['geek-suite', 'work']);
    expect(normalizePinned(Array.from({ length: 20 }, (_, i) => `t${i}`))).toHaveLength(12);
    expect(normalizePinned('nope')).toEqual([]);
  });

  it('hasTag matches a legacy task tag by its standard spelling', () => {
    expect(hasTag({ tags: ['geekSuite'] }, 'geek-suite')).toBe(true);
    expect(hasTag({ tags: ['geek-suite'] }, 'GeekSuite')).toBe(true);
    expect(hasTag({ tags: ['geek-suiteboat'] }, 'geek-suite')).toBe(false);
  });

  it('tagCounts folds spellings', () => {
    expect(tagCounts([{ tags: ['geekSuite'] }, { tags: ['geek-suite', 'work'] }])).toEqual(['geek-suite', 'work']);
  });
});
