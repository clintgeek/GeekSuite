/**
 * flockgeekValidation.test.js
 *
 * Covers the zod input-validation gate in front of flockgeek's sixteen gateway
 * mutations (`DOCS/TODO_ORDER.md` #22 — the same layer bujogeek got in
 * `3265b1c`):
 *   1. Every mutation family accepts its normal input and rejects unknown
 *      keys, out-of-bounds values and off-enum values.
 *   2. Every rejection carries the same shape: a GraphQLError with
 *      `extensions.code = 'BAD_USER_INPUT'` and a `details` array.
 *   3. Every date field is a CALENDAR day and normalizes to UTC midnight.
 *      Nothing FlockGeek records happens at a time of day, and `4856227`
 *      already fixed the read side to use the calendar accessor; this is the
 *      write side of the same contract.
 *   4. Ids stay bounded strings, never ObjectId shapes, so a malformed id
 *      still reaches the resolver and still reads as "<Label> not found" /
 *      "Invalid ID format" the way `flockgeekOwnership.test.js` expects. An
 *      optional reference also still accepts `''`, which `assertOwned` reads
 *      as "no reference at all".
 *
 * This is a pure unit suite: no Mongo, no resolvers — just the schemas.
 */

import { GraphQLError } from 'graphql';
import {
  validateInput,
  createBirdArgsSchema,
  updateBirdArgsSchema,
  createFlockGroupArgsSchema,
  updateFlockGroupArgsSchema,
  createFlockLocationArgsSchema,
  updateFlockLocationArgsSchema,
  recordEggProductionArgsSchema,
  updateEggProductionArgsSchema,
  createPairingArgsSchema,
  updatePairingArgsSchema,
  recordHatchEventArgsSchema,
  updateHatchEventArgsSchema,
  createMeatRunArgsSchema,
  updateMeatRunArgsSchema,
  addHealthRecordArgsSchema,
  deleteFlockEntityArgsSchema,
} from '../graphql/flockgeek/validation.js';

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
const ID2 = '507f1f77bcf86cd799439012';

describe('validateInput — shared error shape', () => {
  test('a rejection is a GraphQLError with extensions.code and details', () => {
    const validate = validateInput(createBirdArgsSchema);
    const err = expectBadInput(() => validate({ tagId: '' }));
    expect(err.extensions.details[0]).toHaveProperty('path');
    expect(err.extensions.details[0]).toHaveProperty('message');
    expect(err.extensions.http.status).toBe(400);
  });
});

describe('every date argument is a calendar day', () => {
  const cases = [
    ['createBird.hatchDate', createBirdArgsSchema, { tagId: 'A-1' }, 'hatchDate'],
    ['createFlockGroup.startDate', createFlockGroupArgsSchema, { name: 'Brood' }, 'startDate'],
    ['createFlockGroup.endDate', createFlockGroupArgsSchema, { name: 'Brood', startDate: '2026-01-01' }, 'endDate'],
    ['recordEggProduction.date', recordEggProductionArgsSchema, { eggsCount: 6 }, 'date'],
    ['createPairing.pairingDate', createPairingArgsSchema, { name: 'Blue pen' }, 'pairingDate'],
    ['recordHatchEvent.setDate', recordHatchEventArgsSchema, { eggsSet: 12 }, 'setDate'],
    ['recordHatchEvent.hatchDate', recordHatchEventArgsSchema, { eggsSet: 12, setDate: '2026-03-01' }, 'hatchDate'],
    ['createMeatRun.startDate', createMeatRunArgsSchema, { pairingId: ID, startCount: 20 }, 'startDate'],
    ['updateMeatRun.harvestDate', updateMeatRunArgsSchema, { id: ID }, 'harvestDate'],
    ['addHealthRecord.eventDate', addHealthRecordArgsSchema, { birdId: ID, type: 'checkup' }, 'eventDate'],
    ['updateHatchEvent.setDate', updateHatchEventArgsSchema, { id: ID }, 'setDate'],
    ['updateEggProduction.date', updateEggProductionArgsSchema, { id: ID }, 'date'],
    ['updateFlockGroup.startDate', updateFlockGroupArgsSchema, { id: ID }, 'startDate'],
    ['updatePairing.pairingDate', updatePairingArgsSchema, { id: ID }, 'pairingDate'],
  ];

  test.each(cases)('%s normalizes to UTC midnight', (_label, schema, base, field) => {
    const validate = validateInput(schema);

    // The bare day the frontend's <input type="date"> sends.
    const fromDay = validate({ ...base, [field]: '2026-03-15' });
    expect(fromDay[field].toISOString()).toBe('2026-03-15T00:00:00.000Z');

    // A full instant from some other client is collapsed to its UTC day,
    // instead of being stored at 09:00Z and read back as the 14th west of UTC.
    const fromInstant = validate({ ...base, [field]: '2026-03-15T09:30:00.000Z' });
    expect(fromInstant[field].toISOString()).toBe('2026-03-15T00:00:00.000Z');

    // A Date object works the same way.
    const fromDate = validate({ ...base, [field]: new Date('2026-03-15T23:59:59.000Z') });
    expect(fromDate[field].toISOString()).toBe('2026-03-15T00:00:00.000Z');
  });

  test('an unparseable or out-of-range day is rejected', () => {
    const validate = validateInput(recordHatchEventArgsSchema);
    expectBadInput(() => validate({ eggsSet: 12, setDate: 'yesterday-ish' }));
    expectBadInput(() => validate({ eggsSet: 12, setDate: '1970-01-01' }));
    expectBadInput(() => validate({ eggsSet: 12, setDate: '2099-01-01' }));
  });

  test('a required day cannot be omitted', () => {
    expectBadInput(() => validateInput(recordHatchEventArgsSchema)({ eggsSet: 12 }));
    expectBadInput(() => validateInput(recordEggProductionArgsSchema)({ eggsCount: 6 }));
    expectBadInput(() => validateInput(createFlockGroupArgsSchema)({ name: 'Brood' }));
  });
});

describe('createBird / updateBird', () => {
  const create = validateInput(createBirdArgsSchema);
  const update = validateInput(updateBirdArgsSchema);

  test('accept normal input', () => {
    const out = create({
      tagId: 'A-104',
      name: 'Henrietta',
      sex: 'hen',
      breed: 'Orpington',
      status: 'active',
      origin: 'own_egg',
      hatchDate: '2025-04-02',
      notes: 'broody',
    });
    expect(out.tagId).toBe('A-104');
    expect(out.hatchDate.toISOString()).toBe('2025-04-02T00:00:00.000Z');

    expect(update({ id: ID, name: 'Renamed', locationId: ID2 })).toEqual({
      id: ID,
      name: 'Renamed',
      locationId: ID2,
    });
  });

  test('reject off-enum sex, status and origin', () => {
    expectBadInput(() => create({ tagId: 'A-1', sex: 'chicken' }));
    expectBadInput(() => create({ tagId: 'A-1', status: 'dead' }));
    expectBadInput(() => create({ tagId: 'A-1', origin: 'stork' }));
    // `findOneAndUpdate` runs with runValidators off, so this used to sail
    // straight past the model enum and into the database.
    expectBadInput(() => update({ id: ID, status: 'meat_run' }));
  });

  test('accepts the model’s odd status spelling', () => {
    expect(create({ tagId: 'A-1', status: 'meat run' }).status).toBe('meat run');
  });

  test('reject a missing or over-long tagId and an over-long name', () => {
    expectBadInput(() => create({}));
    expectBadInput(() => create({ tagId: 'a'.repeat(101) }));
    expectBadInput(() => create({ tagId: 'A-1', name: 'a'.repeat(201) }));
    expectBadInput(() => create({ tagId: 'A-1', notes: 'n'.repeat(5001) }));
  });

  test('reject unknown keys — including a payload ownerId', () => {
    expectBadInput(() => create({ tagId: 'A-1', ownerId: ID }));
    expectBadInput(() => update({ id: ID, deletedAt: new Date() }));
  });

  test('an optional reference accepts "" — assertOwned reads it as "none"', () => {
    expect(update({ id: ID, locationId: '' }).locationId).toBe('');
    expect(update({ id: ID, locationId: null }).locationId).toBeNull();
  });
});

describe('createFlockGroup / updateFlockGroup', () => {
  const create = validateInput(createFlockGroupArgsSchema);
  const update = validateInput(updateFlockGroupArgsSchema);

  test('accept normal input', () => {
    const out = create({
      name: 'Spring brood',
      purpose: 'layer_flock',
      type: 'brood',
      startDate: '2026-04-01',
      endDate: '2026-10-01',
      description: 'first hatch',
    });
    expect(out.startDate.toISOString()).toBe('2026-04-01T00:00:00.000Z');
    expect(out.endDate.toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect(update({ id: ID, name: 'Renamed' })).toEqual({ id: ID, name: 'Renamed' });
  });

  test('reject an empty/over-long name, over-long description and unknown keys', () => {
    expectBadInput(() => create({ name: '', startDate: '2026-04-01' }));
    expectBadInput(() => create({ name: 'a'.repeat(201), startDate: '2026-04-01' }));
    expectBadInput(() => create({ name: 'x', startDate: '2026-04-01', description: 'd'.repeat(2001) }));
    expectBadInput(() => create({ name: 'x', startDate: '2026-04-01', hatchEventId: ID }));
  });
});

describe('createFlockLocation / updateFlockLocation', () => {
  const create = validateInput(createFlockLocationArgsSchema);
  const update = validateInput(updateFlockLocationArgsSchema);

  test('accept normal input', () => {
    expect(create({ name: 'Coop A', type: 'coop', capacity: 24 })).toEqual({
      name: 'Coop A',
      type: 'coop',
      capacity: 24,
    });
    expect(update({ id: ID, isActive: false }).isActive).toBe(false);
  });

  test('reject an off-enum type', () => {
    const err = expectBadInput(() => create({ name: 'Coop A', type: 'barn' }));
    expect(err.extensions.details[0].path).toBe('type');
    expectBadInput(() => update({ id: ID, type: 'barn' }));
  });

  test('type is required on create but optional on update', () => {
    expectBadInput(() => create({ name: 'Coop A' }));
    expect(update({ id: ID, name: 'Coop A' })).toEqual({ id: ID, name: 'Coop A' });
  });

  test('reject a negative, fractional or absurd capacity', () => {
    expectBadInput(() => create({ name: 'x', type: 'coop', capacity: -1 }));
    expectBadInput(() => create({ name: 'x', type: 'coop', capacity: 1.5 }));
    expectBadInput(() => create({ name: 'x', type: 'coop', capacity: 1_000_001 }));
  });
});

describe('recordEggProduction / updateEggProduction', () => {
  const record = validateInput(recordEggProductionArgsSchema);
  const update = validateInput(updateEggProductionArgsSchema);

  test('accepts a normal harvest entry', () => {
    const out = record({
      date: '2026-05-02',
      eggsCount: 7,
      daysObserved: 1,
      locationId: ID,
      eggSize: 'large',
      eggColor: 'brown',
      avgEggWeightGrams: 58.5,
      notes: 'one cracked',
    });
    expect(out.date.toISOString()).toBe('2026-05-02T00:00:00.000Z');
    expect(out.eggsCount).toBe(7);
  });

  test('rejects an off-enum egg size', () => {
    expectBadInput(() => record({ date: '2026-05-02', eggsCount: 1, eggSize: 'ginormous' }));
  });

  test('rejects a negative, fractional or missing egg count', () => {
    expectBadInput(() => record({ date: '2026-05-02', eggsCount: -1 }));
    expectBadInput(() => record({ date: '2026-05-02', eggsCount: 2.5 }));
    expectBadInput(() => record({ date: '2026-05-02' }));
    expectBadInput(() => update({ id: ID, eggsCount: -1 }));
  });

  test('rejects unknown keys and an over-long colour', () => {
    expectBadInput(() => record({ date: '2026-05-02', eggsCount: 1, source: 'automatic' }));
    expectBadInput(() => record({ date: '2026-05-02', eggsCount: 1, eggColor: 'c'.repeat(33) }));
  });
});

describe('createPairing / updatePairing', () => {
  const create = validateInput(createPairingArgsSchema);
  const update = validateInput(updatePairingArgsSchema);

  test('accept normal input', () => {
    const out = create({
      name: 'Blue pen',
      roosterIds: [ID],
      henIds: [ID2],
      pairingDate: '2026-02-14',
      active: true,
    });
    expect(out.roosterIds).toEqual([ID]);
    expect(out.pairingDate.toISOString()).toBe('2026-02-14T00:00:00.000Z');
    expect(update({ id: ID, active: false })).toEqual({ id: ID, active: false });
  });

  test('reject an over-long id list, an empty id inside one, and unknown keys', () => {
    expectBadInput(() => create({ name: 'x', roosterIds: Array.from({ length: 501 }, () => ID) }));
    expectBadInput(() => create({ name: 'x', henIds: [''] }));
    expectBadInput(() => create({ name: 'x', seasonYear: 2026 }));
  });

  test('reject an empty name', () => {
    expectBadInput(() => create({ name: '' }));
    expectBadInput(() => update({ id: ID, name: '' }));
  });
});

describe('recordHatchEvent / updateHatchEvent', () => {
  const record = validateInput(recordHatchEventArgsSchema);
  const update = validateInput(updateHatchEventArgsSchema);

  test('accept normal input', () => {
    const out = record({ setDate: '2026-03-01', hatchDate: '2026-03-22', eggsSet: 24, notes: 'ok' });
    expect(out.setDate.toISOString()).toBe('2026-03-01T00:00:00.000Z');
    expect(out.hatchDate.toISOString()).toBe('2026-03-22T00:00:00.000Z');

    expect(update({ id: ID, eggsFertile: 20, chicksHatched: 18, pullets: 9, cockerels: 9 })).toEqual({
      id: ID,
      eggsFertile: 20,
      chicksHatched: 18,
      pullets: 9,
      cockerels: 9,
    });
  });

  test('reject negative or fractional counts and unknown keys', () => {
    expectBadInput(() => record({ setDate: '2026-03-01', eggsSet: -1 }));
    expectBadInput(() => update({ id: ID, chicksHatched: 1.5 }));
    expectBadInput(() => update({ id: ID, mortalityByDay: [{ day: 1, count: 1 }] }));
  });
});

describe('createMeatRun / updateMeatRun', () => {
  const create = validateInput(createMeatRunArgsSchema);
  const update = validateInput(updateMeatRunArgsSchema);

  test('accept normal input', () => {
    const out = create({ pairingId: ID, hatchEventId: ID2, startDate: '2026-04-01', startCount: 40 });
    expect(out.startDate.toISOString()).toBe('2026-04-01T00:00:00.000Z');
    expect(update({ id: ID, status: 'harvested', harvestCount: 38, avgWeightGrams: 1850 }).status).toBe(
      'harvested'
    );
  });

  test('rejects an off-enum status — this one used to reach the database', () => {
    const err = expectBadInput(() => update({ id: ID, status: 'done' }));
    expect(err.extensions.details[0].path).toBe('status');
  });

  test('a required reference cannot be empty, an optional one can', () => {
    expectBadInput(() => create({ pairingId: '', startDate: '2026-04-01', startCount: 1 }));
    expect(create({ pairingId: ID, hatchEventId: '', startDate: '2026-04-01', startCount: 1 }).hatchEventId).toBe('');
  });

  test('rejects unknown keys and bad counts', () => {
    expectBadInput(() => create({ pairingId: ID, startDate: '2026-04-01', startCount: 1, feedCostCents: 500 }));
    expectBadInput(() => update({ id: ID, mortalityCount: -3 }));
  });
});

describe('addHealthRecord', () => {
  const validate = validateInput(addHealthRecordArgsSchema);

  test('accepts a normal record', () => {
    const out = validate({
      birdId: ID,
      eventDate: '2026-06-01',
      type: 'treatment',
      diagnosis: 'scaly leg mite',
      treatment: 'vaseline',
      outcome: 'recovered',
    });
    expect(out.eventDate.toISOString()).toBe('2026-06-01T00:00:00.000Z');
  });

  test('rejects an off-enum type or outcome', () => {
    expectBadInput(() => validate({ birdId: ID, eventDate: '2026-06-01', type: 'haircut' }));
    expectBadInput(() =>
      validate({ birdId: ID, eventDate: '2026-06-01', type: 'checkup', outcome: 'fine' })
    );
  });

  test('rejects a missing birdId, an over-long free-text field and unknown keys', () => {
    expectBadInput(() => validate({ eventDate: '2026-06-01', type: 'checkup' }));
    expectBadInput(() =>
      validate({ birdId: ID, eventDate: '2026-06-01', type: 'checkup', diagnosis: 'd'.repeat(2001) })
    );
    expectBadInput(() =>
      validate({ birdId: ID, eventDate: '2026-06-01', type: 'checkup', costCents: 100 })
    );
  });
});

describe('deleteFlockEntity', () => {
  const validate = validateInput(deleteFlockEntityArgsSchema);

  test('accepts every type the frontend sends', () => {
    for (const type of ['bird', 'eggproduction', 'group', 'location', 'hatch_event', 'pairing']) {
      expect(validate({ type, id: ID })).toEqual({ type, id: ID });
    }
  });

  test('an unsupported type is left to the resolver’s own message, not enum-rejected', () => {
    expect(validate({ type: 'birdnote', id: ID }).type).toBe('birdnote');
  });

  test('rejects an empty type, an empty id and unknown keys', () => {
    expectBadInput(() => validate({ type: '', id: ID }));
    expectBadInput(() => validate({ type: 'bird', id: '' }));
    expectBadInput(() => validate({ type: 'bird', id: ID, hard: true }));
  });
});
