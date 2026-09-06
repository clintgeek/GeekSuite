/**
 * notegeekValidation.test.js
 *
 * Covers the zod input-validation gate in front of notegeek's eight gateway
 * mutations (`DOCS/TODO_ORDER.md` #22 — the same layer bujogeek got in
 * `3265b1c`):
 *   1. Every mutation family accepts its normal input and rejects unknown
 *      keys, out-of-bounds strings/arrays and off-enum values.
 *   2. Every rejection carries the same shape: a GraphQLError with
 *      `extensions.code = 'BAD_USER_INPUT'` and a `details` array.
 *   3. `content` has two ceilings, chosen from the note's own `type`: prose
 *      (text/markdown/code) stops at 100 000 characters, a serialized editor
 *      snapshot (mindmap/handwritten) gets 5 000 000 — a tldraw sketch is not
 *      a document and clears the prose cap without trying.
 *   4. Ids stay bounded strings, never ObjectId shapes, so a malformed id
 *      still reaches the resolver and still reads as "Note not found" the way
 *      `notegeekOwnership.test.js` expects.
 *
 * NoteGeek takes no date arguments at all — `createdAt`/`updatedAt` are
 * mongoose-managed — so there is no calendar-vs-instant case to assert here;
 * that distinction is exercised in the bujogeek and flockgeek suites.
 *
 * This is a pure unit suite: no Mongo, no resolvers — just the schemas.
 */

import { GraphQLError } from 'graphql';
import {
  validateInput,
  createNoteArgsSchema,
  updateNoteArgsSchema,
  deleteNoteArgsSchema,
  renameTagArgsSchema,
  deleteTagArgsSchema,
  createFolderArgsSchema,
  updateFolderArgsSchema,
  deleteFolderArgsSchema,
} from '../graphql/notegeek/validation.js';

/** Assert a call throws the shared gateway validation error shape. */
function expectBadInput(fn) {
  let caught;
  try {
    fn();
  } catch (err) {
    caught = err;
  }
  expect(caught).toBeInstanceOf(GraphQLError);
  expect(caught.extensions.code).toBe('BAD_USER_INPUT');
  expect(Array.isArray(caught.extensions.details)).toBe(true);
  expect(caught.extensions.details.length).toBeGreaterThan(0);
  return caught;
}

const ID = '507f1f77bcf86cd799439011';

describe('validateInput — shared error shape', () => {
  test('a rejection is a GraphQLError with extensions.code and details', () => {
    const validate = validateInput(deleteTagArgsSchema);
    const err = expectBadInput(() => validate({ tag: '' }));
    expect(err.extensions.details[0]).toHaveProperty('path');
    expect(err.extensions.details[0]).toHaveProperty('message');
    expect(err.extensions.http.status).toBe(400);
  });

  test('valid input passes through unchanged (no injected keys)', () => {
    const validate = validateInput(deleteNoteArgsSchema);
    expect(validate({ id: ID })).toEqual({ id: ID });
  });
});

describe('createNote', () => {
  const validate = validateInput(createNoteArgsSchema);

  test('accepts a normal create', () => {
    const out = validate({
      title: 'Shopping',
      content: '# eggs\n- a dozen',
      type: 'markdown',
      tags: ['home', 'food'],
    });
    expect(out.title).toBe('Shopping');
    expect(out.content).toBe('# eggs\n- a dozen');
    expect(out.tags).toEqual(['home', 'food']);
  });

  test('accepts the empty title QuickCaptureHome sends', () => {
    expect(validate({ title: '', content: 'captured', type: 'text' }).title).toBe('');
  });

  test('rejects an unknown key — including a payload userId', () => {
    expectBadInput(() => validate({ content: 'x', userId: ID }));
    expectBadInput(() => validate({ content: 'x', folderId: ID }));
  });

  test('rejects an off-enum note type', () => {
    const err = expectBadInput(() => validate({ content: 'x', type: 'spreadsheet' }));
    expect(err.extensions.details[0].path).toBe('type');
  });

  /**
   * BURN_REVIEW_2 #5. `Note.type` is `String!` and `notes: [Note!]!`, so one
   * null-typed row nulls the entire list for that user; and `sanitize.js`
   * decides from this field whether a body is HTML, so a stored null made a
   * later typeless update store markup unsanitized. Optional, never null.
   */
  test('rejects an explicit type: null — optional is not nullable', () => {
    const err = expectBadInput(() => validate({ content: 'x', type: null }));
    expect(err.extensions.details[0].path).toBe('type');
  });

  test('omitting type entirely is still fine — createNote falls back to the model default', () => {
    expect(validate({ content: 'x' })).toEqual({ content: 'x' });
    expect(validate({ content: 'x' }).type).toBeUndefined();
  });

  test('rejects empty content — Note.content is required in the model', () => {
    expectBadInput(() => validate({ content: '' }));
  });

  test('rejects a title, tag list or tag over its bound', () => {
    expectBadInput(() => validate({ content: 'x', title: 'a'.repeat(501) }));
    expectBadInput(() => validate({ content: 'x', tags: Array.from({ length: 51 }, () => 't') }));
    expectBadInput(() => validate({ content: 'x', tags: ['a'.repeat(101)] }));
  });

  test('content is NOT trimmed — a document body keeps its own whitespace', () => {
    expect(validate({ content: '  spaced  \n' }).content).toBe('  spaced  \n');
  });
});

describe('createNote / updateNote — the two content ceilings', () => {
  const create = validateInput(createNoteArgsSchema);
  const update = validateInput(updateNoteArgsSchema);

  const prose = 'x'.repeat(100_001);
  const snapshot = 'x'.repeat(100_001);

  test('prose types stop at 100 000 characters', () => {
    for (const type of ['text', 'markdown', 'code']) {
      const err = expectBadInput(() => create({ content: prose, type }));
      expect(err.extensions.details[0].path).toBe('content');
    }
    // …and a create with no type at all is a `text` note by model default.
    expectBadInput(() => create({ content: prose }));
  });

  test('a snapshot type gets the larger ceiling', () => {
    for (const type of ['mindmap', 'handwritten']) {
      expect(create({ content: snapshot, type }).content).toHaveLength(100_001);
    }
  });

  test('even a snapshot has a ceiling', () => {
    expectBadInput(() => create({ content: 'x'.repeat(5_000_001), type: 'handwritten' }));
  });

  test('an update that omits type gets the generous ceiling — the server cannot know the stored type', () => {
    expect(update({ id: ID, content: snapshot }).content).toHaveLength(100_001);
    expectBadInput(() => update({ id: ID, content: prose, type: 'markdown' }));
  });
});

describe('updateNote', () => {
  const validate = validateInput(updateNoteArgsSchema);

  test('accepts a normal update', () => {
    const out = validate({ id: ID, title: 'Renamed', content: 'body', type: 'text', tags: [] });
    expect(out).toEqual({ id: ID, title: 'Renamed', content: 'body', type: 'text', tags: [] });
  });

  test('allows content to be blanked — the editor saves a titled note with an empty body', () => {
    expect(validate({ id: ID, title: 'Just a title', content: '' }).content).toBe('');
  });

  test('rejects an explicit type: null, and accepts an update that omits type', () => {
    const err = expectBadInput(() => validate({ id: ID, content: 'x', type: null }));
    expect(err.extensions.details[0].path).toBe('type');
    expect(validate({ id: ID, content: 'x' })).toEqual({ id: ID, content: 'x' });
  });

  test('rejects an unknown key and a missing id', () => {
    expectBadInput(() => validate({ id: ID, isLocked: true }));
    expectBadInput(() => validate({ content: 'x' }));
  });

  test('an id is a bounded string, not an ObjectId — a malformed id is the resolver’s problem', () => {
    // Passes validation on purpose: the resolver answers "Note not found",
    // which notegeekOwnership.test.js asserts.
    expect(validate({ id: 'not-an-object-id', content: 'x' }).id).toBe('not-an-object-id');
    expectBadInput(() => validate({ id: '', content: 'x' }));
    expectBadInput(() => validate({ id: 'x'.repeat(257), content: 'x' }));
  });
});

describe('deleteNote', () => {
  const validate = validateInput(deleteNoteArgsSchema);

  test('accepts an id and rejects anything else', () => {
    expect(validate({ id: ID })).toEqual({ id: ID });
    expectBadInput(() => validate({}));
    expectBadInput(() => validate({ id: ID, force: true }));
  });
});

describe('renameTag / deleteTag', () => {
  const rename = validateInput(renameTagArgsSchema);
  const remove = validateInput(deleteTagArgsSchema);

  test('accept a normal rename and delete', () => {
    expect(rename({ oldTag: 'work', newTag: 'job' })).toEqual({ oldTag: 'work', newTag: 'job' });
    expect(remove({ tag: 'work' })).toEqual({ tag: 'work' });
  });

  test('reject empty, over-long and unknown keys', () => {
    expectBadInput(() => rename({ oldTag: '', newTag: 'job' }));
    expectBadInput(() => rename({ oldTag: 'work', newTag: 'a'.repeat(101) }));
    expectBadInput(() => rename({ oldTag: 'work', newTag: 'job', userId: ID }));
    expectBadInput(() => remove({ tag: 'a'.repeat(101) }));
  });

  test('tags are trimmed', () => {
    expect(remove({ tag: '  work  ' }).tag).toBe('work');
  });
});

describe('createFolder / updateFolder / deleteFolder', () => {
  const create = validateInput(createFolderArgsSchema);
  const update = validateInput(updateFolderArgsSchema);
  const remove = validateInput(deleteFolderArgsSchema);

  test('accept normal input', () => {
    expect(create({ name: 'Recipes', parentId: ID, icon: 'folder', color: '#7C8194' })).toEqual({
      name: 'Recipes',
      parentId: ID,
      icon: 'folder',
      color: '#7C8194',
    });
    expect(update({ id: ID, name: 'Renamed', parentId: null })).toEqual({
      id: ID,
      name: 'Renamed',
      parentId: null,
    });
    expect(remove({ id: ID, deleteNotes: true })).toEqual({ id: ID, deleteNotes: true });
  });

  test('reject an empty or over-long name', () => {
    expectBadInput(() => create({ name: '' }));
    expectBadInput(() => create({ name: 'a'.repeat(201) }));
    expectBadInput(() => update({ id: ID, name: '' }));
  });

  test('reject an over-long icon or colour', () => {
    expectBadInput(() => create({ name: 'x', icon: 'i'.repeat(65) }));
    expectBadInput(() => create({ name: 'x', color: '#'.repeat(33) }));
  });

  test('reject unknown keys', () => {
    expectBadInput(() => create({ name: 'x', userId: ID }));
    expectBadInput(() => update({ id: ID, ownerId: ID }));
    expectBadInput(() => remove({ id: ID, cascade: true }));
  });
});
