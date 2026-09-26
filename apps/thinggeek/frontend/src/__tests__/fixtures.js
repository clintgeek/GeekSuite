// A small, realistic household: House › Garage › Shelf 2, Wendy the boat
// equipped with a Garmin Striker 4, a rifle with a serial, a keyboard.
const T = (s) => `${s}T00:00:00.000Z`;

export const field = (key, label, kind = 'text', over = {}) => ({
  __typename: 'ThingTypeField', key, label, kind, choices: [], unit: null, identifier: false, required: false, ...over,
});

export const TYPES = [
  {
    __typename: 'ThingType', id: 'ty-boat', key: 'boat', name: 'Boat', icon: 'DirectionsBoat', builtIn: true, thingCount: 1,
    fields: [field('manufacturer', 'Manufacturer'), field('lengthFt', 'Length', 'number', { unit: 'ft' }), field('hullNumber', 'Hull number', 'text', { identifier: true })],
  },
  {
    __typename: 'ThingType', id: 'ty-firearm', key: 'firearm', name: 'Firearm', icon: 'GpsFixed', builtIn: true, thingCount: 1,
    fields: [field('manufacturer', 'Manufacturer'), field('model', 'Model'), field('serial', 'Serial number', 'text', { identifier: true })],
  },
  { __typename: 'ThingType', id: 'ty-keyboard', key: 'keyboard', name: 'Keyboard', icon: 'Keyboard', builtIn: true, thingCount: 1, fields: [field('switches', 'Switches')] },
  { __typename: 'ThingType', id: 'ty-general', key: 'general', name: 'General', icon: 'Inventory2', builtIn: true, thingCount: 0, fields: [] },
];

const pathOf = (...names) => names.map(([id, name]) => ({ __typename: 'Place', id, name }));

export const PLACES = [
  { __typename: 'Place', id: 'pl-house', name: 'House', parentId: null, notes: null, directCount: 1, totalCount: 5, path: pathOf(['pl-house', 'House']) },
  { __typename: 'Place', id: 'pl-garage', name: 'Garage', parentId: 'pl-house', notes: null, directCount: 2, totalCount: 4, path: pathOf(['pl-house', 'House'], ['pl-garage', 'Garage']) },
  { __typename: 'Place', id: 'pl-shelf', name: 'Shelf 2', parentId: 'pl-garage', notes: null, directCount: 2, totalCount: 2, path: pathOf(['pl-house', 'House'], ['pl-garage', 'Garage'], ['pl-shelf', 'Shelf 2']) },
  { __typename: 'Place', id: 'pl-truck', name: 'Truck', parentId: null, notes: null, directCount: 0, totalCount: 0, path: pathOf(['pl-truck', 'Truck']) },
];

export const placeRef = (id) => {
  const p = PLACES.find((x) => x.id === id);
  return { __typename: 'Place', id: p.id, name: p.name, parentId: p.parentId, path: p.path };
};

export const typeRef = (id) => {
  const t = TYPES.find((x) => x.id === id);
  return { __typename: 'ThingType', id: t.id, key: t.key, name: t.name, icon: t.icon };
};

export const date = (over = {}) => ({
  __typename: 'ThingDate', id: 'd1', kind: 'registration', label: null, date: T('2026-10-07'), occursOn: T('2026-10-07'),
  recurEveryMonths: null, notes: null, daysUntil: 12, status: 'soon', ...over,
});

const attr = (key, label, value, over = {}) => ({ __typename: 'ThingAttribute', key, label, kind: 'text', unit: null, identifier: false, value, ...over });

export function makeThing(over = {}) {
  return {
    __typename: 'Thing',
    id: 't-wendy',
    name: 'Wendy',
    tags: ['fishing', 'lake'],
    missing: ['receipt'],
    createdAt: '2026-09-01T15:00:00.000Z',
    updatedAt: '2026-09-20T15:00:00.000Z',
    type: typeRef('ty-boat'),
    place: placeRef('pl-shelf'),
    coverPhoto: null,
    nextDue: date(),
    value: { __typename: 'ThingValue', amount: 18500, currency: 'USD', asOf: T('2026-01-15') },
    acquired: { __typename: 'ThingAcquired', date: T('2021-05-01'), from: 'Bass Pro Shops', price: { __typename: 'ThingMoney', amount: 21000, currency: 'USD' } },
    attributes: { manufacturer: 'Tracker', lengthFt: 18, hullNumber: 'ABC1234567' },
    notes: 'Spare key is in the tackle box.',
    deletedAt: null,
    fields: [
      attr('manufacturer', 'Manufacturer', 'Tracker'),
      attr('lengthFt', 'Length', 18, { kind: 'number', unit: 'ft' }),
      attr('hullNumber', 'Hull number', 'ABC1234567', { identifier: true }),
    ],
    dates: [date()],
    photos: [],
    documents: [],
    relationships: [
      {
        __typename: 'ThingRelationship', id: 'r1', kind: 'equipped-with', direction: 'out',
        thing: { __typename: 'ThingSummary', id: 't-garmin', name: 'Garmin Striker 4', coverThumbUrl: null, type: { __typename: 'ThingType', id: 'ty-general', name: 'General', icon: 'Inventory2' } },
      },
    ],
    ...over,
  };
}

export function makeRifle(over = {}) {
  return makeThing({
    id: 't-rifle',
    name: 'Ruger 10/22',
    tags: ['hunting'],
    type: typeRef('ty-firearm'),
    place: placeRef('pl-house'),
    nextDue: null,
    dates: [],
    relationships: [],
    attributes: { manufacturer: 'Ruger', model: '10/22', serial: 'XYZ9876543' },
    fields: [
      attr('manufacturer', 'Manufacturer', 'Ruger'),
      attr('model', 'Model', '10/22'),
      attr('serial', 'Serial number', 'XYZ9876543', { identifier: true }),
    ],
    ...over,
  });
}
