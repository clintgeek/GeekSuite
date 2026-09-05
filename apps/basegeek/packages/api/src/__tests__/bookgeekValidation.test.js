/**
 * bookgeekValidation.test.js
 *
 * Covers the zod input-validation gate in front of bookgeek's eight gateway
 * mutations (`DOCS/TODO_ORDER.md` #22 — the last of the four gateway
 * modules; bujogeek got it in `3265b1c`, notegeek and flockgeek in
 * `e23559c`):
 *   1. Every mutation family accepts its normal input and rejects an unknown
 *      key (at both the outer-args level and, where a mutation nests its
 *      payload under `input`, inside that object too), an out-of-bounds
 *      value and an out-of-range number.
 *   2. Every rejection carries the same shape: a GraphQLError with
 *      `extensions.code = 'BAD_USER_INPUT'` and a `details` array.
 *   3. Books and shelves are a SHARED household library — no owner key
 *      exists in any of these mutations' arguments, so there is nothing to
 *      strip before validation (unlike bujogeek/notegeek/flockgeek, which
 *      defensively drop a payload `ownerId`/`userId`).
 *   4. Ids stay bounded strings, never ObjectId shapes — `updateBook` and
 *      `deleteBook` still degrade a malformed id to `null`/
 *      `{success:false}` the way `bookgeekOwnership.test.js` expects, and
 *      `removeBookShelf`'s id deliberately accepts `''` the way
 *      `bookgeekProfile.test.js`'s "a built-in shelf can never be removed"
 *      case expects.
 *   5. `publishedDate` is a calendar day (normalizes to UTC midnight);
 *      `dateStarted`/`dateFinished` are instants (time-of-day preserved).
 *   6. Fields the resolver already validates itself (`deviceWord`,
 *      `kindleEmail`, a filter's `name`, a shelf's `label`) still reach the
 *      resolver on a blank or semantically-invalid value — this layer only
 *      bounds their length, so `bookgeekProfile.test.js`'s own message
 *      assertions are untouched.
 *
 * This is a pure unit suite: no Mongo, no resolvers — just the schemas.
 */

import { GraphQLError } from 'graphql';
import {
  validateInput,
  createBookArgsSchema,
  updateBookArgsSchema,
  deleteBookArgsSchema,
  saveBookProfileArgsSchema,
  saveLibraryFilterArgsSchema,
  deleteLibraryFilterArgsSchema,
  addBookShelfArgsSchema,
  removeBookShelfArgsSchema,
} from '../graphql/bookgeek/validation.js';

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
    const validate = validateInput(deleteBookArgsSchema);
    const err = expectBadInput(() => validate({ id: '' }));
    expect(err.extensions.details[0]).toHaveProperty('path');
    expect(err.extensions.details[0]).toHaveProperty('message');
    expect(err.extensions.http.status).toBe(400);
  });

  test('valid input passes through unchanged (no injected keys)', () => {
    const validate = validateInput(deleteLibraryFilterArgsSchema);
    expect(validate({ id: 'f1' })).toEqual({ id: 'f1' });
  });
});

describe('createBook', () => {
  const validate = validateInput(createBookArgsSchema);

  test('accepts a normal create', () => {
    const out = validate({
      input: { title: 'Dune', authors: ['Frank Herbert'], isbn: '9780441013593', shelf: 'want-to-read', owned: true },
    });
    expect(out.input.title).toBe('Dune');
    expect(out.input.authors).toEqual(['Frank Herbert']);
  });

  test('accepts the minimal payload — only title is required', () => {
    expect(validate({ input: { title: 'Neuromancer' } }).input).toEqual({ title: 'Neuromancer' });
  });

  test('rejects a missing or blank title', () => {
    expectBadInput(() => validate({ input: {} }));
    expectBadInput(() => validate({ input: { title: '' } }));
    expectBadInput(() => validate({ input: { title: '   ' } }));
  });

  test('rejects an over-long title and an over-long author', () => {
    expectBadInput(() => validate({ input: { title: 'a'.repeat(501) } }));
    expectBadInput(() => validate({ input: { title: 'x', authors: ['a'.repeat(501)] } }));
  });

  test('rejects more than 50 authors', () => {
    expectBadInput(() =>
      validate({ input: { title: 'x', authors: Array.from({ length: 51 }, (_, i) => `A${i}`) } })
    );
  });

  test('rejects an unknown key at the outer level and inside input', () => {
    expectBadInput(() => validate({ input: { title: 'x' }, extra: true }));
    expectBadInput(() => validate({ input: { title: 'x', ownerId: ID } }));
    expectBadInput(() => validate({ input: { title: 'x', userId: ID } }));
  });
});

describe('updateBook', () => {
  const validate = validateInput(updateBookArgsSchema);

  test('accepts a normal patch', () => {
    const out = validate({ id: ID, input: { shelf: 'reading', rating: 5, tags: ['scifi', 'favorite'] } });
    expect(out).toEqual({ id: ID, input: { shelf: 'reading', rating: 5, tags: ['scifi', 'favorite'] } });
  });

  test('a malformed id still reaches the resolver — bounded string only', () => {
    // No format check here; `bookgeekOwnership.test.js` asserts `validObjectId`
    // in the resolver turns this into a `null` return, not a thrown error.
    expect(validate({ id: 'garbage', input: { title: 'x' } }).id).toBe('garbage');
  });

  test('rejects a missing or over-long id', () => {
    expectBadInput(() => validate({ id: '', input: {} }));
    expectBadInput(() => validate({ id: 'a'.repeat(257), input: {} }));
  });

  test('rejects an out-of-range rating and readingProgress', () => {
    expectBadInput(() => validate({ id: ID, input: { rating: -1 } }));
    expectBadInput(() => validate({ id: ID, input: { rating: 5.5 } }));
    expectBadInput(() => validate({ id: ID, input: { readingProgress: -1 } }));
    expectBadInput(() => validate({ id: ID, input: { readingProgress: 101 } }));
    expectBadInput(() => validate({ id: ID, input: { readingProgress: 50.5 } }));
  });

  test('accepts the model’s bounds at the edges', () => {
    expect(validate({ id: ID, input: { rating: 0 } }).input.rating).toBe(0);
    expect(validate({ id: ID, input: { rating: 5 } }).input.rating).toBe(5);
    expect(validate({ id: ID, input: { readingProgress: 0 } }).input.readingProgress).toBe(0);
    expect(validate({ id: ID, input: { readingProgress: 100 } }).input.readingProgress).toBe(100);
  });

  test('rejects an over-long review, tag and over-large tag array', () => {
    expectBadInput(() => validate({ id: ID, input: { review: 'r'.repeat(20_001) } }));
    expectBadInput(() => validate({ id: ID, input: { tags: ['t'.repeat(101)] } }));
    expectBadInput(() => validate({ id: ID, input: { tags: Array.from({ length: 51 }, (_, i) => `t${i}`) } }));
  });

  test('accepts the review ceiling exactly', () => {
    expect(validate({ id: ID, input: { review: 'r'.repeat(20_000) } }).input.review).toHaveLength(20_000);
  });

  test('rejects an unknown key inside input, including a payload ownerId', () => {
    expectBadInput(() => validate({ id: ID, input: { deletedAt: new Date() } }));
    expectBadInput(() => validate({ id: ID, input: { ownerId: ID } }));
  });

  test('publishedDate is a CALENDAR day — normalizes to UTC midnight', () => {
    expect(validate({ id: ID, input: { publishedDate: '2026-03-15' } }).input.publishedDate.toISOString()).toBe(
      '2026-03-15T00:00:00.000Z'
    );
    // A full instant from some other client collapses to its UTC day.
    expect(
      validate({ id: ID, input: { publishedDate: '2026-03-15T09:30:00.000Z' } }).input.publishedDate.toISOString()
    ).toBe('2026-03-15T00:00:00.000Z');
  });

  test('dateStarted / dateFinished are INSTANTS — time-of-day preserved', () => {
    const out = validate({
      id: ID,
      input: { dateStarted: '2026-03-15T09:30:00.000Z', dateFinished: '2026-03-20T22:00:00.000Z' },
    });
    expect(out.input.dateStarted.toISOString()).toBe('2026-03-15T09:30:00.000Z');
    expect(out.input.dateFinished.toISOString()).toBe('2026-03-20T22:00:00.000Z');
  });

  test('an unparseable or out-of-range date is rejected', () => {
    expectBadInput(() => validate({ id: ID, input: { publishedDate: 'not-a-date' } }));
    expectBadInput(() => validate({ id: ID, input: { dateStarted: '1970-01-01' } }));
    expectBadInput(() => validate({ id: ID, input: { dateStarted: '2099-01-01' } }));
  });
});

describe('deleteBook', () => {
  const validate = validateInput(deleteBookArgsSchema);

  test('accepts an id with and without deleteFiles', () => {
    expect(validate({ id: ID })).toEqual({ id: ID });
    expect(validate({ id: ID, deleteFiles: true })).toEqual({ id: ID, deleteFiles: true });
  });

  test('a malformed id still reaches the resolver', () => {
    expect(validate({ id: 'garbage' }).id).toBe('garbage');
  });

  test('rejects a missing id and an unknown key', () => {
    expectBadInput(() => validate({}));
    expectBadInput(() => validate({ id: ID, force: true }));
  });
});

describe('saveBookProfile', () => {
  const validate = validateInput(saveBookProfileArgsSchema);

  test('accepts kindleEmail and deviceWord', () => {
    const out = validate({ input: { kindleEmail: '  chef@kindle.com  ', deviceWord: ' Mustang ' } });
    expect(out.input.kindleEmail).toBe('  chef@kindle.com  ');
    expect(out.input.deviceWord).toBe(' Mustang ');
  });

  test('a whitespace-only deviceWord still passes through — the resolver clears it', () => {
    expect(validate({ input: { deviceWord: '   ' } }).input.deviceWord).toBe('   ');
  });

  test('a short or malformed deviceWord still passes through — the resolver rejects it with its own message', () => {
    expect(validate({ input: { deviceWord: '9lives' } }).input.deviceWord).toBe('9lives');
    expect(validate({ input: { deviceWord: 'ab' } }).input.deviceWord).toBe('ab');
  });

  test('rejects an over-long kindleEmail or deviceWord and an unknown key', () => {
    expectBadInput(() => validate({ input: { kindleEmail: 'a'.repeat(321) } }));
    expectBadInput(() => validate({ input: { deviceWord: 'a'.repeat(65) } }));
    expectBadInput(() => validate({ input: { userId: ID } }));
  });
});

describe('saveLibraryFilter', () => {
  const validate = validateInput(saveLibraryFilterArgsSchema);

  test('accepts a normal filter', () => {
    const out = validate({
      input: { name: 'Unread sci-fi', shelfFilter: 'unread', tagFilter: 'science fiction', ownedFilter: 'owned' },
    });
    expect(out.input.name).toBe('Unread sci-fi');
  });

  test('a blank name still passes through — the resolver rejects it with its own message', () => {
    expect(validate({ input: { name: '   ' } }).input.name).toBe('   ');
  });

  test('a nonsense ownedFilter still passes through — the resolver normalizes it to "all"', () => {
    expect(validate({ input: { name: 'x', ownedFilter: 'nonsense' } }).input.ownedFilter).toBe('nonsense');
  });

  test('rejects a missing name, an over-long field and an unknown key', () => {
    expectBadInput(() => validate({ input: {} }));
    expectBadInput(() => validate({ input: { name: 'x', searchQuery: 's'.repeat(501) } }));
    expectBadInput(() => validate({ input: { name: 'x', extra: 'nope' } }));
  });
});

describe('deleteLibraryFilter', () => {
  const validate = validateInput(deleteLibraryFilterArgsSchema);

  test('accepts a generated filter id', () => {
    expect(validate({ id: 'abc123-xyz' })).toEqual({ id: 'abc123-xyz' });
  });

  test('rejects a missing/blank id and an unknown key', () => {
    expectBadInput(() => validate({}));
    expectBadInput(() => validate({ id: '' }));
    expectBadInput(() => validate({ id: 'f1', userId: ID }));
  });
});

describe('addBookShelf', () => {
  const validate = validateInput(addBookShelfArgsSchema);

  test('accepts a normal label', () => {
    expect(validate({ label: 'Comfort Reads' })).toEqual({ label: 'Comfort Reads' });
  });

  test('a blank, long-but-under-100-char or punctuation-only label still passes through — the resolver\'s own checks fire', () => {
    expect(validate({ label: '   ' }).label).toBe('   ');
    expect(validate({ label: 'x'.repeat(41) }).label).toHaveLength(41);
    expect(validate({ label: '!!!' }).label).toBe('!!!');
  });

  test('rejects a label over the 100-char ceiling and an unknown key', () => {
    expectBadInput(() => validate({ label: 'x'.repeat(101) }));
    expectBadInput(() => validate({ label: 'x', userId: ID }));
  });
});

describe('removeBookShelf', () => {
  const validate = validateInput(removeBookShelfArgsSchema);

  test('accepts a custom shelf id', () => {
    expect(validate({ id: 'custom-cookbooks' })).toEqual({ id: 'custom-cookbooks' });
  });

  test('accepts "" — a built-in shelf id the resolver itself rejects', () => {
    expect(validate({ id: '' })).toEqual({ id: '' });
  });

  test('rejects a missing id, an over-long id and an unknown key', () => {
    expectBadInput(() => validate({}));
    expectBadInput(() => validate({ id: 'a'.repeat(257) }));
    expectBadInput(() => validate({ id: 'custom-x', force: true }));
  });
});
