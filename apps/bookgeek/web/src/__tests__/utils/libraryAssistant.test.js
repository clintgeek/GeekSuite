import { describe, it, expect } from 'vitest';
import {
  mergeTagList,
  metadataDraftProvenanceLine,
  whatNextProvenanceLine,
} from '../../utils/libraryAssistant';

describe('mergeTagList', () => {
  it('appends drafted tags to what the field already holds', () => {
    expect(mergeTagList('science fiction, mystery', ['near-future'])).toBe(
      'science fiction, mystery, near-future'
    );
  });

  it('never duplicates a tag the field already has, whatever its case', () => {
    expect(mergeTagList('Science Fiction', ['science fiction', 'mystery'])).toBe(
      'Science Fiction, mystery'
    );
  });

  it('handles an empty field, an empty draft, and junk in either', () => {
    expect(mergeTagList('', ['memoir'])).toBe('memoir');
    expect(mergeTagList('memoir', [])).toBe('memoir');
    expect(mergeTagList(null, null)).toBe('');
    expect(mergeTagList(' a , , b ', ['  ', 'c', 42])).toBe('a, b, c');
  });
});

describe('provenance lines', () => {
  it('names the model when a model answered', () => {
    expect(whatNextProvenanceLine({ source: 'model', model: 'llama' })).toBe('Drafted by llama');
    expect(metadataDraftProvenanceLine({ source: 'model', model: 'llama' })).toBe(
      'AI-drafted by llama — review before saving'
    );
  });

  it('says plainly when no model was consulted', () => {
    expect(whatNextProvenanceLine({ source: 'fallback', reason: 'disabled' })).toBe(
      'No model — ranked from your own ratings'
    );
    expect(whatNextProvenanceLine({ source: 'fallback', reason: 'cap' })).toBe(
      'Daily AI limit reached — ranked from your own ratings'
    );
    expect(metadataDraftProvenanceLine({ source: 'fallback', reason: 'unavailable' })).toBe(
      "No model — tags from this author's other books, no description"
    );
  });

  it('is null before anything has been drafted, so no line is rendered', () => {
    expect(whatNextProvenanceLine(null)).toBeNull();
    expect(metadataDraftProvenanceLine(undefined)).toBeNull();
  });

  it('degrades gracefully when the model name is missing', () => {
    expect(whatNextProvenanceLine({ source: 'model' })).toBe("Drafted by the suite's model");
  });
});
