/**
 * Pins the going-over 2026-09-05 fix to
 * `PUT /api/characters/story/:storyId/character/:characterName`.
 *
 * The route merged with `{ ...story.characters[idx], ...req.body }`. A
 * Mongoose subdocument's own enumerable properties are its internals
 * (`$__`, `_doc`, `__parentArray`, `__index`, `$__parent`) — the schema
 * fields are prototype getters over `_doc` — so the cast on assignment kept
 * nothing but what the body supplied. Rename a character's `currentState`
 * and its `name`, `description`, `inventory`, `knowledge` and `relationships`
 * were all erased; `name` and `description` are `required`, so the save that
 * followed threw and the route answered 500. Either way the edit was
 * destructive.
 *
 * This runs against the **real** embedded `characterSchema` from
 * `models/Story.js` — no mocks, no Mongo connection (constructing and
 * validating a document needs neither), so it cannot pass on a fixture that
 * happens to be a plain object. `charactersValidation.test.js`'s doubles are
 * plain objects, which is exactly why that suite stayed green through the bug.
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import Story from '../models/Story.js';
import { mergeSubdocument } from '../utils/mergeSubdocument.js';

function storyWithAldric() {
  return new Story({
    userId: 'user-1',
    title: 'Test Story',
    genre: 'Fantasy',
    worldState: { setting: 'A cold keep', currentSituation: 'Waiting' },
    characters: [
      {
        name: 'Aldric',
        description: 'A knight of the old order',
        personality: 'gruff',
        status: 'alive',
        locationName: 'Keep',
        inventory: [{ name: 'Sword', quantity: 1 }],
        skills: [{ name: 'Swordplay', level: 4 }],
      },
    ],
  });
}

describe('mergeSubdocument — the character PUT merge', () => {
  test('a one-field update leaves every other field intact', () => {
    const story = storyWithAldric();
    story.characters[0] = mergeSubdocument(story.characters[0], {
      currentState: 'wounded',
    });

    const c = story.characters[0];
    assert.equal(c.name, 'Aldric');
    assert.equal(c.description, 'A knight of the old order');
    assert.equal(c.personality, 'gruff');
    assert.equal(c.status, 'alive');
    assert.equal(c.locationName, 'Keep');
    assert.equal(c.currentState, 'wounded');
    assert.equal(c.inventory.length, 1);
    assert.equal(c.inventory[0].name, 'Sword');
    assert.equal(c.skills[0].level, 4);
  });

  test('the merged document still validates (name/description are required)', () => {
    const story = storyWithAldric();
    story.characters[0] = mergeSubdocument(story.characters[0], {
      currentState: 'wounded',
    });
    assert.equal(story.validateSync(['characters']), undefined);
  });

  test('the element keeps its _id, so it is an edit and not a replacement', () => {
    const story = storyWithAldric();
    const originalId = String(story.characters[0]._id);
    story.characters[0] = mergeSubdocument(story.characters[0], {
      personality: 'weary',
    });
    assert.equal(String(story.characters[0]._id), originalId);
  });

  test('supplied fields win over existing ones', () => {
    const story = storyWithAldric();
    story.characters[0] = mergeSubdocument(story.characters[0], {
      personality: 'weary',
      status: 'missing',
    });
    assert.equal(story.characters[0].personality, 'weary');
    assert.equal(story.characters[0].status, 'missing');
  });

  test('an array in the body replaces that array wholesale (PUT semantics)', () => {
    const story = storyWithAldric();
    story.characters[0] = mergeSubdocument(story.characters[0], {
      inventory: [{ name: 'Shield', quantity: 1 }],
    });
    assert.equal(story.characters[0].inventory.length, 1);
    assert.equal(story.characters[0].inventory[0].name, 'Shield');
    // …and nothing outside `inventory` moved.
    assert.equal(story.characters[0].name, 'Aldric');
  });

  test('an empty body is a no-op rather than a wipe', () => {
    const story = storyWithAldric();
    story.characters[0] = mergeSubdocument(story.characters[0], {});
    assert.equal(story.characters[0].name, 'Aldric');
    assert.equal(story.characters[0].description, 'A knight of the old order');
  });

  test('the naive spread this replaced really did destroy the record', () => {
    // The control: proves the fix is load-bearing rather than decorative.
    const story = storyWithAldric();
    story.characters[0] = { ...story.characters[0], currentState: 'wounded' };
    assert.equal(story.characters[0].name, undefined);
    assert.equal(story.characters[0].description, undefined);
    assert.notEqual(
      story.validateSync(['characters']),
      undefined,
      'the naive merge leaves a document that cannot be saved'
    );
  });

  test('passes a plain object through unchanged (test fixtures are not documents)', () => {
    const merged = mergeSubdocument(
      { name: 'Aldric', description: 'A knight' },
      { personality: 'gruff' }
    );
    assert.deepEqual(merged, {
      name: 'Aldric',
      description: 'A knight',
      personality: 'gruff',
    });
  });

  test('tolerates a missing existing value', () => {
    assert.deepEqual(mergeSubdocument(null, { name: 'X' }), { name: 'X' });
    assert.deepEqual(mergeSubdocument(undefined), {});
  });
});
