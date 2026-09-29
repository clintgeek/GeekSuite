import { describe, it, expect } from 'vitest';
import { buildNoteFromShareParams } from '../../utils/shareTarget';

describe('buildNoteFromShareParams', () => {
  it('returns null when nothing usable was shared', () => {
    expect(buildNoteFromShareParams({})).toBeNull();
    expect(buildNoteFromShareParams({ title: '  ', text: '', url: '' })).toBeNull();
    expect(buildNoteFromShareParams()).toBeNull();
  });

  it('uses the shared title, and puts the text in the body', () => {
    const result = buildNoteFromShareParams({ title: 'Recipe idea', text: 'Try miso butter on the salmon' });
    expect(result.title).toBe('Recipe idea');
    expect(result.content).toBe('Try miso butter on the salmon');
  });

  it('falls back to the first line of the text as the title when none was shared', () => {
    const result = buildNoteFromShareParams({ text: 'Weekend plan\nFarmers market, then the trail' });
    expect(result.title).toBe('Weekend plan');
    expect(result.content).toBe('Farmers market, then the trail');
  });

  it('appends the url as a markdown link', () => {
    const result = buildNoteFromShareParams({ title: 'Read later', url: 'https://example.com/article' });
    expect(result.title).toBe('Read later');
    expect(result.content).toBe('[https://example.com/article](https://example.com/article)');
  });

  it('combines text and url with a blank line between them', () => {
    const result = buildNoteFromShareParams({
      title: 'Gift idea',
      text: 'She mentioned this on her list',
      url: 'https://example.com/gift',
    });
    expect(result.content).toBe(
      'She mentioned this on her list\n\n[https://example.com/gift](https://example.com/gift)'
    );
  });

  it('a url-only share has no title and the link as the body', () => {
    const result = buildNoteFromShareParams({ url: 'https://example.com/x' });
    expect(result.title).toBeNull();
    expect(result.content).toBe('[https://example.com/x](https://example.com/x)');
  });

  it('a title-only share still gets a non-empty body (the title itself)', () => {
    const result = buildNoteFromShareParams({ title: 'Just a title, nothing else' });
    expect(result.title).toBe('Just a title, nothing else');
    expect(result.content).toBe('Just a title, nothing else');
  });

  it('trims whitespace around every field', () => {
    const result = buildNoteFromShareParams({ title: '  Padded  ', text: '  body text  ' });
    expect(result.title).toBe('Padded');
    expect(result.content).toBe('body text');
  });

  it('a single-line text with no title uses that line as the title and duplicates it as the body when nothing remains', () => {
    const result = buildNoteFromShareParams({ text: 'One line only' });
    expect(result.title).toBe('One line only');
    expect(result.content).toBe('One line only');
  });
});
