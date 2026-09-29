import { describe, it, expect } from 'vitest';
import { toggleWrap, toggleLinePrefix, insertLink } from '../../utils/markdownFormat';

describe('toggleWrap', () => {
  it('wraps the selection and keeps it selected', () => {
    expect(toggleWrap('a word here', 2, 6, '**')).toEqual({ text: 'a **word** here', start: 4, end: 8 });
  });
  it('unwraps when the markers sit just outside the selection', () => {
    expect(toggleWrap('a **word** here', 4, 8, '**')).toEqual({ text: 'a word here', start: 2, end: 6 });
  });
  it('unwraps when the selection includes the markers', () => {
    expect(toggleWrap('a **word** here', 2, 10, '**')).toEqual({ text: 'a word here', start: 2, end: 6 });
  });
  it('inserts an empty pair with the caret between', () => {
    expect(toggleWrap('ab', 1, 1, '_')).toEqual({ text: 'a__b', start: 2, end: 2 });
  });
});

describe('toggleLinePrefix', () => {
  it('adds a bullet to the caret line and keeps the caret with its text', () => {
    expect(toggleLinePrefix('one\ntwo', 5, 5, '- ')).toEqual({ text: 'one\n- two', start: 7, end: 7 });
  });
  it('takes the prefix off when every line has it', () => {
    const r = toggleLinePrefix('- a\n- b', 0, 7, '- ');
    expect(r.text).toBe('a\nb');
  });
  it('turns a bullet into a checklist item instead of stacking prefixes', () => {
    expect(toggleLinePrefix('- milk', 3, 3, '- [ ] ').text).toBe('- [ ] milk');
  });
  it('numbers a numbered list', () => {
    expect(toggleLinePrefix('a\nb\nc', 0, 5, '1. ').text).toBe('1. a\n2. b\n3. c');
  });
  it('replaces one heading level with another', () => {
    expect(toggleLinePrefix('# Title', 2, 2, '## ').text).toBe('## Title');
  });
  it('works on the first line of the note', () => {
    expect(toggleLinePrefix('first\nsecond', 0, 0, '> ').text).toBe('> first\nsecond');
  });
});

describe('insertLink', () => {
  it('makes the selection the label and puts the caret in the url', () => {
    expect(insertLink('see docs now', 4, 8)).toEqual({ text: 'see [docs]() now', start: 11, end: 11 });
  });
  it('with no selection, puts the caret in the label', () => {
    expect(insertLink('x', 1, 1)).toEqual({ text: 'x[]()', start: 2, end: 2 });
  });
});
