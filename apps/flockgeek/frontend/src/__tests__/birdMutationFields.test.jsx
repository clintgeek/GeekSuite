/**
 * birdMutationFields.test.jsx
 *
 * Q59, the frontend half.
 *
 * BirdsPage's edit form collects sixteen fields; UPDATE_BIRD declared seven of
 * them, so Breed, Hatch Date, Species, Strain, Cross, Origin, Foundation
 * Stock, Temperament, Status Date and Status Reason were inputs the user could
 * change, save, and watch do nothing. Apollo reported success — GraphQL never
 * saw the values, because a document that does not declare a variable simply
 * does not send it.
 *
 * There is no way to catch that from a rendering test: both sides of a
 * rendering test are the client, which is exactly how
 * `QuickHarvestEntry.test.jsx` came to assert a `source` key that the server
 * had never once received. So this suite reads the DOCUMENTS — the parsed
 * `gql` ASTs — and holds them to the form's own field list.
 *
 * The other half of the pincer is in the gateway
 * (`flockgeekBirdFieldParity.test.js`), which drives the real resolver against
 * real Mongo. Neither is sufficient alone; `tools/gql-arg-audit.mjs` checks
 * the join across every tree in the suite.
 */

import { describe, it, expect } from 'vitest';
import { CREATE_BIRD, UPDATE_BIRD } from '../graphql/mutations';

/** The variables a document declares. */
const declaredVariables = (doc) =>
  doc.definitions[0].variableDefinitions.map((v) => v.variable.name.value).sort();

/** The arguments a document actually passes to its root mutation field. */
const passedArguments = (doc) => {
  const field = doc.definitions[0].selectionSet.selections[0];
  return field.arguments.map((a) => a.name.value).sort();
};

/**
 * Every key BirdsPage's edit form writes through `setEF(...)`, minus the two
 * that have nowhere to go.
 *
 * `sireId` and `damId` are rendered inputs with no home on the server:
 * `models/Bird.js` tracks lineage through `pairingId` ("all roosters/hens in
 * the pairing are considered potential parents") and neither the model nor the
 * `Bird` GraphQL type has a sire or dam field. They are reported, not wired —
 * wiring them would mean inventing a second lineage model.
 */
const EDIT_FORM_FIELDS = [
  'breed',
  'cross',
  'foundationStock',
  'hatchDate',
  'locationId',
  'name',
  'notes',
  'origin',
  'sex',
  'species',
  'status',
  'statusDate',
  'statusReason',
  'strain',
  'tagId',
  'temperamentScore',
];

describe('UPDATE_BIRD carries every field the edit form collects', () => {
  it('declares a variable for each of them, plus id', () => {
    expect(declaredVariables(UPDATE_BIRD)).toEqual([...EDIT_FORM_FIELDS, 'id'].sort());
  });

  it('passes every variable it declares — a declared-but-unpassed variable is dropped', () => {
    expect(passedArguments(UPDATE_BIRD)).toEqual(declaredVariables(UPDATE_BIRD));
  });

  it('names the ten fields Q59 restored', () => {
    const before = new Set(['id', 'tagId', 'name', 'sex', 'status', 'notes', 'locationId']);
    expect(declaredVariables(UPDATE_BIRD).filter((v) => !before.has(v))).toEqual([
      'breed',
      'cross',
      'foundationStock',
      'hatchDate',
      'origin',
      'species',
      'statusDate',
      'statusReason',
      'strain',
      'temperamentScore',
    ]);
  });
});

describe('CREATE_BIRD stays in step with UPDATE_BIRD', () => {
  it('declares the same field list, differing only by id', () => {
    expect(declaredVariables(CREATE_BIRD)).toEqual(
      declaredVariables(UPDATE_BIRD).filter((v) => v !== 'id')
    );
  });

  it('passes every variable it declares', () => {
    expect(passedArguments(CREATE_BIRD)).toEqual(declaredVariables(CREATE_BIRD));
  });

  it('requires only tagId', () => {
    const required = CREATE_BIRD.definitions[0].variableDefinitions
      .filter((v) => v.type.kind === 'NonNullType')
      .map((v) => v.variable.name.value);
    expect(required).toEqual(['tagId']);
  });
});

describe('the bird documents do not send anything the gateway has no home for', () => {
  it('neither document mentions sireId or damId', () => {
    for (const doc of [CREATE_BIRD, UPDATE_BIRD]) {
      const vars = declaredVariables(doc);
      expect(vars).not.toContain('sireId');
      expect(vars).not.toContain('damId');
    }
  });
});
