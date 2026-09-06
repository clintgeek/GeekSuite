import { describe, it, expect } from 'vitest';
import {
  DOC_CONTENT_MAX,
  SNAPSHOT_CONTENT_MAX,
  contentMaxFor,
  overSizeMessage,
  saveErrorMessage,
} from '../../utils/saveGuards';
import { NOTE_TYPES } from '../../components/notes/NoteTypeRouter';

/**
 * These two guards are what turned "the note silently stopped saving" into
 * something the writer can see and act on. Before the 2026-09-05 going-over,
 * `NoteEditorPage` set an error string on `saveStatus`, whose only consumer
 * (`NoteActions`) compares it against the literal `'Saved'` — so every save
 * error in this app was rendered nowhere at all.
 */

describe('contentMaxFor — mirrors the gateway ceilings', () => {
  // graphql/notegeek/validation.js: DOC_CONTENT_MAX / SNAPSHOT_CONTENT_MAX.
  it.each([
    [NOTE_TYPES.TEXT, DOC_CONTENT_MAX],
    [NOTE_TYPES.MARKDOWN, DOC_CONTENT_MAX],
    [NOTE_TYPES.CODE, DOC_CONTENT_MAX],
    [NOTE_TYPES.MINDMAP, SNAPSHOT_CONTENT_MAX],
    [NOTE_TYPES.HANDWRITTEN, SNAPSHOT_CONTENT_MAX],
  ])('%s → %i', (type, expected) => {
    expect(contentMaxFor(type)).toBe(expected);
  });

  it('holds an unknown type to the prose ceiling, like the gateway does', () => {
    expect(contentMaxFor(undefined)).toBe(DOC_CONTENT_MAX);
  });

  it('is exactly the numbers the gateway enforces', () => {
    expect(DOC_CONTENT_MAX).toBe(100_000);
    expect(SNAPSHOT_CONTENT_MAX).toBe(5_000_000);
  });
});

describe('overSizeMessage', () => {
  it('says nothing when the body fits, including exactly at the ceiling', () => {
    expect(overSizeMessage('x'.repeat(DOC_CONTENT_MAX), NOTE_TYPES.MARKDOWN)).toBeNull();
    expect(overSizeMessage('', NOTE_TYPES.TEXT)).toBeNull();
    expect(overSizeMessage(undefined, NOTE_TYPES.TEXT)).toBeNull();
  });

  it('names the numbers for prose, one character past the ceiling', () => {
    const msg = overSizeMessage('x'.repeat(DOC_CONTENT_MAX + 1), NOTE_TYPES.MARKDOWN);
    expect(msg).toMatch(/too long to save/);
    expect(msg).toMatch(/100,001/);
    expect(msg).toMatch(/100,000/);
  });

  it('speaks about strokes, not characters, for a sketch', () => {
    const msg = overSizeMessage('x'.repeat(SNAPSHOT_CONTENT_MAX + 1), NOTE_TYPES.HANDWRITTEN);
    expect(msg).toMatch(/sketch is too large/);
  });

  it('does not hold a sketch to the prose ceiling', () => {
    expect(overSizeMessage('x'.repeat(DOC_CONTENT_MAX + 1), NOTE_TYPES.HANDWRITTEN)).toBeNull();
  });
});

describe('saveErrorMessage', () => {
  it('digs the useful sentence out of the gateway’s "Invalid input"', () => {
    // graphql/shared/validation.js puts the real message in extensions.details
    // and leaves `message` as the flat, useless "Invalid input".
    const error = {
      message: 'Invalid input',
      graphQLErrors: [
        {
          message: 'Invalid input',
          extensions: {
            code: 'BAD_USER_INPUT',
            details: [{ path: 'content', message: 'String must contain at most 100000 character(s)' }],
          },
        },
      ],
    };
    expect(saveErrorMessage(error)).toBe('String must contain at most 100000 character(s)');
  });

  it('joins several field errors rather than showing one', () => {
    const error = {
      graphQLErrors: [
        {
          message: 'Invalid input',
          extensions: {
            details: [
              { path: 'title', message: 'too long' },
              { path: 'content', message: 'too long' },
            ],
          },
        },
      ],
    };
    expect(saveErrorMessage(error)).toBe('too long; too long');
  });

  it('falls back to the GraphQL message when there are no details', () => {
    expect(saveErrorMessage({ graphQLErrors: [{ message: 'Note not found' }] }))
      .toBe('Note not found');
  });

  it('says something honest about a network failure', () => {
    expect(saveErrorMessage({ networkError: new Error('Failed to fetch') }))
      .toMatch(/not saved yet/);
  });

  it('never returns undefined', () => {
    expect(saveErrorMessage(undefined)).toBe('Failed to save');
    expect(saveErrorMessage(new Error('boom'))).toBe('boom');
  });
});
