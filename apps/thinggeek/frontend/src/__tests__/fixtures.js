// A small, realistic household: House › Garage › Shelf 2 (locations), the
// Van in the Garage holding the jumper cables, Wendy the boat in the Garage
// with a Garmin Striker 4 as an accessory, a rifle with a serial, a keyboard.
const T = (s) => `${s}T00:00:00.000Z`;

export const field = (key, label, kind = 'text', over = {}) => ({
  __typename: 'ThingTypeField', key, label, kind, choices: [], unit: null, identifier: false, required: false, ...over,
});

export const TYPES = [
  { __typename: 'ThingType', id: 'ty-location', key: 'location', name: 'Location', icon: 'Place', kind: 'location', builtIn: true, thingCount: 3, fields: [] },
  {
    __typename: 'ThingType', id: 'ty-vehicle', key: 'vehicle', name: 'Vehicle', icon: 'DirectionsCar', kind: 'container', builtIn: true, thingCount: 1,
    fields: [field('make', 'Make'), field('vin', 'VIN', 'text', { identifier: true })],
  },
  {
    __typename: 'ThingType', id: 'ty-boat', key: 'boat', name: 'Boat', icon: 'DirectionsBoat', kind: 'container', builtIn: true, thingCount: 1,
    fields: [field('manufacturer', 'Manufacturer'), field('lengthFt', 'Length', 'number', { unit: 'ft' }), field('hullNumber', 'Hull number', 'text', { identifier: true })],
  },
  {
    __typename: 'ThingType', id: 'ty-firearm', key: 'firearm', name: 'Firearm', icon: 'GpsFixed', kind: 'item', builtIn: true, thingCount: 1,
    fields: [field('manufacturer', 'Manufacturer'), field('model', 'Model'), field('serial', 'Serial number', 'text', { identifier: true })],
  },
  { __typename: 'ThingType', id: 'ty-keyboard', key: 'keyboard', name: 'Keyboard', icon: 'Keyboard', kind: 'item', builtIn: true, thingCount: 1, fields: [field('switches', 'Switches')] },
  { __typename: 'ThingType', id: 'ty-tool', key: 'tool', name: 'Tool', icon: 'Handyman', kind: 'item', builtIn: true, thingCount: 1, fields: [] },
  { __typename: 'ThingType', id: 'ty-general', key: 'general', name: 'General', icon: 'Inventory2', kind: 'item', builtIn: true, thingCount: 0, fields: [] },
];

const nodeType = (id) => {
  const t = TYPES.find((x) => x.id === id);
  return { __typename: 'ThingType', id: t.id, name: t.name, icon: t.icon };
};
const node = (id, name, parentId, typeId, over = {}) => ({
  __typename: 'ThingNode', id, name, parentId, parentInTrash: false, kind: TYPES.find((t) => t.id === typeId).kind, childCount: 0, itemCount: 0, type: nodeType(typeId), ...over,
});

/** `thingTree`: every live thing as a node. */
export const NODES = [
  node('n-house', 'House', null, 'ty-location', { childCount: 2, itemCount: 5 }),
  node('n-garage', 'Garage', 'n-house', 'ty-location', { childCount: 3, itemCount: 4 }),
  node('n-shelf', 'Shelf 2', 'n-garage', 'ty-location'),
  node('n-van', 'Van', 'n-garage', 'ty-vehicle', { childCount: 1, itemCount: 1 }),
  node('t-cables', 'Jumper cables', 'n-van', 'ty-tool'),
  node('t-wendy', 'Wendy', 'n-garage', 'ty-boat'),
  node('t-rifle', 'Ruger 10/22', 'n-house', 'ty-firearm'),
  node('t-keyboard', 'Keyboard', null, 'ty-keyboard'),
];

/** A thing's `path`: root → parent crumbs, from node ids. */
export const crumbs = (...ids) =>
  ids.map((id) => {
    const n = NODES.find((x) => x.id === id);
    return { __typename: 'ThingSummary', id: n.id, name: n.name, kind: n.kind, inTrash: false };
  });

export const typeRef = (id) => {
  const t = TYPES.find((x) => x.id === id);
  return { __typename: 'ThingType', id: t.id, key: t.key, name: t.name, icon: t.icon, kind: t.kind };
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
    kind: 'container',
    parentId: 'n-garage',
    path: crumbs('n-house', 'n-garage'),
    contentsCount: 0,
    contents: [],
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
        __typename: 'ThingRelationship', id: 'r1', kind: 'accessory-of', direction: 'in',
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
    kind: 'item',
    parentId: 'n-house',
    path: crumbs('n-house'),
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
