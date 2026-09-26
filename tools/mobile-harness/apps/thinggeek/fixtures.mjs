// ThingGeek fixtures. A believable small household inventory, as a
// CONTAINMENT GRAPH (DOCS/THINGGEEK_PLAN.md "Containment"): everything is a
// thing, and a thing's parent says where it is.
//
//   House › Garage › Van › Jumper cables, Aftermarket stereo
//   House › Garage › Wendy (the boat) › Garmin fish finder, trolling motor
//   House › Garage › F-150 › circular saw
//   House › Garage › Shelf 2 › drill
//   House › Office › Gun safe › Ruger, Glock
//   House › Office › keyboard, camera, and the lens (an accessory of the camera)
//   Garage › Old tackle box (in the Trash) › Fishing lures (live: "inside
//   something in the Trash")
//
// Names, serials and values are realistic lengths: the two-line clamps, the
// masked "••••4567" and the tabular value column are the point. Dates are
// the gateway's answer (daysUntil/status/occursOn), fixed.
//
// Special modes, keyed on the page URL (the request's frame), so a scene can
// reach them with a plain deep link:
//   ?__fixture=empty      a brand-new household (starter types, nothing else)
//   ?__fixture=nonmember  every GraphQL op answers NOT_A_MEMBER
import { json, body, svg, sessionRoutes, graphqlRoute, corsHeaders } from '../../lib/net.mjs';

const T = (s) => `${s}T00:00:00.000Z`;
const DAY = 86400000;
const ago = (days) => new Date(Date.now() - days * DAY).toISOString();

// ── Types (the starter set, as the gateway seeds them) ──────────────────────
const F = (key, label, kind = 'text', extra = {}) => ({ __typename: 'ThingTypeField', key, label, kind, choices: [], unit: null, identifier: false, required: false, ...extra });
const TYPES = [
  { id: 't-location', key: 'location', name: 'Location', icon: 'Place', kind: 'location', fields: [] },
  { id: 't-storage', key: 'storage', name: 'Storage', icon: 'AllInbox', kind: 'container', fields: [F('brand', 'Brand'), F('model', 'Model'), F('serial', 'Serial number', 'text', { identifier: true })] },
  { id: 't-boat', key: 'boat', name: 'Boat', icon: 'DirectionsBoat', kind: 'container', fields: [F('manufacturer', 'Manufacturer'), F('model', 'Model'), F('year', 'Year', 'number'), F('lengthFt', 'Length', 'number', { unit: 'ft' }), F('engine', 'Engine'), F('hullNumber', 'Hull number', 'text', { identifier: true }), F('registrationNumber', 'Registration number', 'text', { identifier: true })] },
  { id: 't-vehicle', key: 'vehicle', name: 'Vehicle', icon: 'DirectionsCar', kind: 'container', fields: [F('make', 'Make'), F('model', 'Model'), F('year', 'Year', 'number'), F('vin', 'VIN', 'text', { identifier: true }), F('plate', 'Plate', 'text', { identifier: true }), F('mileage', 'Mileage', 'number', { unit: 'mi' })] },
  { id: 't-firearm', key: 'firearm', name: 'Firearm', icon: 'GpsFixed', kind: 'item', fields: [F('manufacturer', 'Manufacturer'), F('model', 'Model'), F('kind', 'Kind', 'choice', { choices: ['Handgun', 'Rifle', 'Shotgun', 'Other'] }), F('caliber', 'Caliber / gauge'), F('action', 'Action'), F('serial', 'Serial number', 'text', { identifier: true })] },
  { id: 't-tool', key: 'tool', name: 'Tool', icon: 'Handyman', kind: 'item', fields: [F('brand', 'Brand'), F('model', 'Model'), F('power', 'Power', 'choice', { choices: ['Corded', 'Battery', 'Manual', 'Gas'] }), F('serial', 'Serial number', 'text', { identifier: true })] },
  { id: 't-electronics', key: 'electronics', name: 'Electronics', icon: 'Devices', kind: 'item', fields: [F('brand', 'Brand'), F('model', 'Model'), F('serial', 'Serial number', 'text', { identifier: true })] },
  { id: 't-keyboard', key: 'keyboard', name: 'Keyboard', icon: 'Keyboard', kind: 'item', fields: [F('brand', 'Brand'), F('model', 'Model'), F('layout', 'Layout'), F('switches', 'Switches'), F('keycaps', 'Keycaps'), F('connection', 'Connection', 'choice', { choices: ['Wired', 'Wireless', 'Both'] })] },
  { id: 't-appliance', key: 'appliance', name: 'Appliance', icon: 'Kitchen', kind: 'item', fields: [F('brand', 'Brand'), F('model', 'Model'), F('serial', 'Serial number', 'text', { identifier: true })] },
  { id: 't-camera', key: 'camera', name: 'Camera', icon: 'PhotoCamera', kind: 'item', fields: [F('brand', 'Brand'), F('model', 'Model'), F('serial', 'Serial number', 'text', { identifier: true })] },
  { id: 't-general', key: 'general', name: 'General', icon: 'Inventory2', kind: 'item', fields: [] },
].map((t) => ({ __typename: 'ThingType', builtIn: true, thingCount: 0, ...t }));
const typeById = new Map(TYPES.map((t) => [t.id, t]));
const kindOf = (t) => typeById.get(t.typeId)?.kind ?? 'item';

// ── Files: /api/files/<fileId> and /api/files/<fileId>/thumb ────────────────
const FILES = {};
let fileSeq = 0;
function photo(role, art, caption = null) {
  fileSeq += 1;
  const fileId = `f${fileSeq}`;
  FILES[fileId] = art;
  return { __typename: 'ThingPhoto', id: `ph${fileSeq}`, fileId, role, caption, url: `/api/files/${fileId}`, thumbUrl: `/api/files/${fileId}/thumb`, width: 1600, height: 1200 };
}
function doc(role, title, originalName, size, mime = 'application/pdf') {
  fileSeq += 1;
  const fileId = `f${fileSeq}`;
  return { __typename: 'ThingDocument', id: `d${fileSeq}`, fileId, role, title, url: `/api/files/${fileId}`, mime, size, originalName };
}
const date = (id, kind, label, anchor, daysUntil, status, extra = {}) => ({
  __typename: 'ThingDate', id, kind, label, date: T(anchor), occursOn: T(extra.occursOn ?? anchor), recurEveryMonths: extra.recur ?? null, notes: extra.notes ?? null, daysUntil, status,
});

// ── Things ──────────────────────────────────────────────────────────────────
const BLANK = { tags: [], attributes: {}, value: [null, null], acquired: [null, null, null], dates: [], photos: [], documents: [], rel: [] };
const loc = (id, name, parentId, createdDays, notes = null) => ({ ...BLANK, id, name, typeId: 't-location', parentId, notes, createdAt: ago(createdDays) });

const RAW = [
  loc('p-house', 'House', null, 60, '1412 Sycamore Ln'),
  loc('p-garage', 'Garage', 'p-house', 60),
  loc('p-shelf2', 'Shelf 2', 'p-garage', 59, 'Left wall, second from the floor'),
  loc('p-office', 'Office', 'p-house', 59),
  {
    ...BLANK, id: 'p-safe', name: 'Gun safe', typeId: 't-storage', parentId: 'p-office', tags: ['secure'],
    attributes: { brand: 'Liberty', model: 'Fatboy Jr. 48', serial: 'LB48-2291-7730' },
    value: [1650, '2026-01-10'], acquired: ['2018-03-02', 'Tractor Supply', 1799],
    photos: [photo('overview', 'safe')], documents: [doc('receipt', 'Tractor Supply receipt', 'liberty-safe-receipt.pdf', 120832)],
    notes: 'Combination is in the fireproof box, not here.', createdAt: ago(58),
  },
  {
    ...BLANK, id: 'th13', name: 'Van', typeId: 't-vehicle', parentId: 'p-garage', tags: ['work'],
    attributes: { make: 'Ford', model: 'Transit Connect XLT', year: 2018, vin: 'NM0GE9F28J1363412', plate: 'KM2 L9P', mileage: 88140 },
    value: [14200, '2026-06-01'], acquired: ['2020-08-14', 'CarMax', 17998],
    dates: [date('dt9', 'registration', 'Plates renewal', '2027-01-31', 127, 'later')],
    photos: [photo('overview', 'van')], documents: [doc('insurance', 'Insurance card', 'van-insurance-card.pdf', 90112)],
    notes: 'Roof rack bars are in the garage rafters.', createdAt: ago(50),
  },
  {
    ...BLANK, id: 'th14', name: 'Jumper cables', typeId: 't-tool', parentId: 'th13', tags: ['roadside'],
    attributes: { brand: 'Energizer', model: '1-gauge, 25 ft', power: 'Manual', serial: '' },
    value: [65, null], acquired: ['2021-12-03', 'AutoZone', 69.99],
    notes: 'Behind the passenger seat, in the red bag.', createdAt: ago(49),
  },
  {
    ...BLANK, id: 'th15', name: 'Aftermarket stereo', typeId: 't-electronics', parentId: 'th13', tags: ['audio'],
    attributes: { brand: 'Pioneer', model: 'DMH-W4660NEX', serial: 'SJKC012345UC' },
    value: [480, '2026-06-01'], acquired: ['2022-04-09', 'Crutchfield', 599.99],
    photos: [photo('overview', 'stereo')], documents: [doc('receipt', 'Crutchfield order', 'crutchfield-order-88213.pdf', 64512)], createdAt: ago(48),
  },
  {
    ...BLANK, id: 'th1', name: 'Wendy', typeId: 't-boat', parentId: 'p-garage', tags: ['fishing', 'lake'],
    attributes: { manufacturer: 'Tracker', model: 'Pro Team 175 TXW', year: 2019, lengthFt: 17.5, engine: 'Mercury 90 ELPT FourStroke', hullNumber: 'BUJ12345E919', registrationNumber: 'MO 4417 BK' },
    value: [18500, '2026-05-01'], acquired: ['2019-04-20', 'Bass Pro Shops, Springfield', 21995],
    dates: [
      date('dt1', 'registration', 'Boat registration', '2026-10-07', 12, 'soon'),
      date('dt2', 'maintenance', 'Winterize', '2024-11-01', 37, 'upcoming', { recur: 12, occursOn: '2026-11-01', notes: 'Fog the engine, stabilize the fuel, pull the drain plug.' }),
      date('dt3', 'insurance', 'Boat policy renews', '2021-03-15', 171, 'later', { recur: 12, occursOn: '2027-03-15' }),
    ],
    photos: [photo('overview', 'boat', 'At the ramp, Table Rock'), photo('id-plate', 'plate-boat', 'Capacity plate, transom'), photo('detail', 'console')],
    documents: [doc('registration', 'Missouri registration', 'mo-boat-registration-2025.pdf', 184320), doc('manual', 'Owner’s manual', 'tracker-pt175-manual.pdf', 8912896)],
    notes: 'Spare key is on the hook by the garage door. Trailer tires replaced 2024.',
    createdAt: ago(40),
  },
  {
    ...BLANK, id: 'th2', name: 'Garmin Striker 4', typeId: 't-electronics', parentId: 'th1', tags: ['fishing'],
    attributes: { brand: 'Garmin', model: 'Striker 4 (010-01550-00)', serial: '4P1234567' },
    value: [120, '2026-05-01'], acquired: ['2019-05-02', 'Amazon', 119.99],
    photos: [photo('overview', 'finder')], createdAt: ago(38),
  },
  {
    ...BLANK, id: 'th3', name: 'Minn Kota Endura C2 trolling motor', typeId: 't-electronics', parentId: 'th1', tags: ['fishing'],
    attributes: { brand: 'Minn Kota', model: 'Endura C2 40', serial: '' },
    value: [230, null], acquired: ['2019-05-10', 'Academy Sports', 249.99], createdAt: ago(37),
  },
  {
    ...BLANK, id: 'th4', name: '2021 Ford F-150 XLT', typeId: 't-vehicle', parentId: 'p-garage', tags: ['towing'],
    attributes: { make: 'Ford', model: 'F-150 XLT SuperCrew', year: 2021, vin: '1FTFW1E85MFA12345', plate: 'ZX4 R7T', mileage: 48210 },
    value: [34500, '2026-08-15'], acquired: ['2021-06-12', 'Lou Fusz Ford', 47250],
    dates: [date('dt5', 'registration', 'Plates renewal', '2026-09-22', -3, 'overdue'), date('dt6', 'insurance', 'Auto policy', '2023-12-01', 67, 'upcoming', { recur: 6, occursOn: '2026-12-01' })],
    photos: [photo('overview', 'truck')], documents: [doc('receipt', 'Bill of sale', 'f150-bill-of-sale.pdf', 402432), doc('insurance', 'Insurance card', 'state-farm-card.pdf', 96256)],
    createdAt: ago(30),
  },
  {
    ...BLANK, id: 'th5', name: 'Ruger 10/22 Carbine', typeId: 't-firearm', parentId: 'p-safe', tags: ['hunting'],
    attributes: { manufacturer: 'Ruger', model: '10/22 Carbine (1103)', kind: 'Rifle', caliber: '.22 LR', action: 'Semi-automatic', serial: '0012-34567' },
    value: [320, '2026-01-10'], acquired: ['2015-11-27', 'Cabela’s', 279],
    photos: [photo('overview', 'rifle'), photo('id-plate', 'plate-rifle', 'Receiver, left side')], documents: [doc('receipt', 'Cabela’s receipt', 'cabelas-1022.pdf', 88064)],
    createdAt: ago(20),
  },
  {
    ...BLANK, id: 'th6', name: 'Glock 19 Gen 5', typeId: 't-firearm', parentId: 'p-safe',
    attributes: { manufacturer: 'Glock', model: '19 Gen 5 MOS', kind: 'Handgun', caliber: '9mm', action: 'Striker-fired', serial: 'BXYZ123' },
    value: [550, null], acquired: ['2022-02-14', null, null],
    photos: [photo('overview', 'pistol')], createdAt: ago(18),
  },
  {
    ...BLANK, id: 'th7', name: 'DeWalt 20V MAX drill/driver', typeId: 't-tool', parentId: 'p-shelf2', tags: ['shop'],
    attributes: { brand: 'DeWalt', model: 'DCD791D2', power: 'Battery', serial: '' },
    acquired: ['2023-07-04', 'Home Depot', 179],
    dates: [date('dt7', 'warranty', '3-year limited warranty', '2027-02-10', 138, 'later')],
    photos: [photo('overview', 'drill')], createdAt: ago(12),
  },
  {
    ...BLANK, id: 'th8', name: 'Milwaukee M18 Fuel circular saw', typeId: 't-tool', parentId: 'th4', tags: ['shop', 'jobsite'],
    attributes: { brand: 'Milwaukee', model: '2732-20', power: 'Battery', serial: 'J41A2023001234' },
    value: [199, '2025-11-01'], acquired: ['2023-03-18', 'Home Depot', 229],
    documents: [doc('receipt', 'Home Depot receipt', 'hd-receipt-0318.jpg', 1310720, 'image/jpeg')], createdAt: ago(10),
  },
  {
    ...BLANK, id: 'th9', name: 'Keychron Q1 Pro', typeId: 't-keyboard', parentId: 'p-office', tags: ['desk'],
    attributes: { brand: 'Keychron', model: 'Q1 Pro', layout: '75% ANSI', switches: 'Gateron Jupiter Brown', keycaps: 'KAT Milkshake PBT', connection: 'Both' },
    value: [199, '2026-02-01'], acquired: ['2024-01-15', 'keychron.com', 219],
    photos: [photo('overview', 'keyboard')], documents: [doc('receipt', null, 'keychron-order-48213.pdf', 51200)], createdAt: ago(6),
  },
  {
    ...BLANK, id: 'th10', name: 'Sony α7 III', typeId: 't-camera', parentId: 'p-office', tags: ['photo'],
    attributes: { brand: 'Sony', model: 'ILCE-7M3', serial: '4512345' },
    value: [1100, '2026-03-01'], acquired: ['2019-12-20', 'B&H Photo', 1998],
    dates: [date('dt8', 'warranty', 'B&H extended warranty', '2026-10-19', 24, 'soon')],
    photos: [photo('overview', 'camera')], createdAt: ago(2),
  },
  {
    // Lives in the office drawer; belongs with the camera wherever it is.
    ...BLANK, id: 'th16', name: 'Sony FE 50mm f/1.8 lens', typeId: 't-camera', parentId: 'p-office', tags: ['photo'],
    attributes: { brand: 'Sony', model: 'SEL50F18F', serial: '1893344' },
    value: [180, '2026-03-01'], acquired: ['2020-02-02', 'B&H Photo', 248],
    rel: [['accessory-of', 'th10']], createdAt: ago(1),
  },
  {
    // Live, inside a tackle box that is in the Trash.
    ...BLANK, id: 'th17', name: 'Fishing lures', typeId: 't-general', parentId: 'th18', tags: ['fishing'],
    notes: 'Rapalas and a few jigs.', createdAt: ago(90),
  },
];

const TRASHED_RAW = [
  { ...BLANK, id: 'th11', name: 'Old Humminbird PiranhaMax', typeId: 't-electronics', parentId: null, tags: ['fishing'], attributes: { brand: 'Humminbird', model: 'PiranhaMax 4', serial: '' }, createdAt: ago(300), deletedAt: ago(10) },
  { ...BLANK, id: 'th12', name: 'Broken shop vac', typeId: 't-appliance', parentId: 'p-shelf2', tags: ['shop'], attributes: { brand: 'Craftsman', model: 'CMXEVBE17250', serial: '' }, createdAt: ago(200), deletedAt: ago(27) },
  { ...BLANK, id: 'th18', name: 'Old tackle box', typeId: 't-storage', parentId: 'p-garage', tags: ['fishing'], attributes: { brand: 'Plano', model: '7771', serial: '' }, createdAt: ago(400), deletedAt: ago(4) },
];

let WORLD = RAW;
let TRASH = TRASHED_RAW;
const byIdAll = () => new Map([...WORLD, ...TRASH].map((t) => [t.id, t]));

// ── Containment, the way the gateway derives it ─────────────────────────────
/** Root → parent crumbs (through things in the Trash, flagged). */
function pathOf(t) {
  const all = byIdAll();
  const out = [];
  const seen = new Set();
  let cur = t.parentId ? all.get(t.parentId) : null;
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    out.unshift({ __typename: 'ThingSummary', id: cur.id, name: cur.name, kind: kindOf(cur), inTrash: Boolean(cur.deletedAt) });
    cur = cur.parentId ? all.get(cur.parentId) : null;
  }
  return out;
}
/** Every ancestor id (for within / in: and the Where facet). */
const ancestorIds = (t) => pathOf(t).map((p) => p.id);
const liveChildren = (id) => WORLD.filter((x) => x.parentId === id);
const insideCount = (id) => WORLD.filter((x) => kindOf(x) !== 'location' && ancestorIds(x).includes(id)).length;

// ── Rendering a thing the way the gateway does ─────────────────────────────
function summary(t) {
  const cover = t.photos.find((p) => p.role === 'overview') ?? t.photos[0];
  const type = typeById.get(t.typeId);
  return { __typename: 'ThingSummary', id: t.id, name: t.name, kind: kindOf(t), inTrash: false, coverThumbUrl: cover?.thumbUrl ?? null, type: type ? { __typename: 'ThingType', id: type.id, name: type.name, icon: type.icon } : null };
}

function missingOf(t, type) {
  if ((type?.kind ?? 'item') === 'location') return [];
  const ident = (type?.fields ?? []).filter((f) => f.identifier).map((f) => f.key);
  const out = [];
  if (!t.photos.length) out.push('photo');
  if (ident.length && !t.photos.some((p) => p.role === 'id-plate')) out.push('id-plate');
  if (!t.photos.some((p) => p.role === 'receipt') && !t.documents.some((d) => d.role === 'receipt')) out.push('receipt');
  if (ident.length && ident.some((k) => !t.attributes[k])) out.push('serial');
  if (t.value[0] == null) out.push('value');
  return out;
}

function render(t, { withContents = false } = {}) {
  const type = typeById.get(t.typeId) ?? null;
  const cover = t.photos.find((p) => p.role === 'overview') ?? t.photos[0] ?? null;
  const out = t.rel.map(([kind, other], i) => ({ __typename: 'ThingRelationship', id: `${t.id}-r${i}`, kind, direction: 'out', thing: summary(WORLD.find((x) => x.id === other)) }));
  const inbound = WORLD.flatMap((o) => o.rel.filter(([, target]) => target === t.id).map(([kind], i) => ({ __typename: 'ThingRelationship', id: `${o.id}-in-${t.id}-${i}`, kind, direction: 'in', thing: summary(o) })));
  const dates = t.dates.filter(Boolean);
  const nextDue = [...dates].sort((a, b) => a.daysUntil - b.daysUntil).find((d) => d.status !== 'later') ?? [...dates].sort((a, b) => a.daysUntil - b.daysUntil)[0] ?? null;
  const rank = { location: 0, container: 1, item: 2 };
  const contents = liveChildren(t.id).sort((a, b) => rank[kindOf(a)] - rank[kindOf(b)] || a.name.localeCompare(b.name));
  return {
    __typename: 'Thing',
    id: t.id,
    name: t.name,
    tags: t.tags,
    missing: missingOf(t, type),
    createdAt: t.createdAt,
    updatedAt: t.createdAt,
    deletedAt: t.deletedAt ?? null,
    kind: kindOf(t),
    parentId: t.parentId ?? null,
    type: type ? { __typename: 'ThingType', id: type.id, key: type.key, name: type.name, icon: type.icon, kind: type.kind } : null,
    path: pathOf(t),
    coverPhoto: cover,
    nextDue,
    value: { __typename: 'ThingValue', amount: t.value[0], currency: 'USD', asOf: t.value[1] ? T(t.value[1]) : null },
    acquired: { __typename: 'ThingAcquired', date: t.acquired[0] ? T(t.acquired[0]) : null, from: t.acquired[1], price: { __typename: 'ThingMoney', amount: t.acquired[2], currency: 'USD' } },
    attributes: t.attributes,
    notes: t.notes ?? null,
    fields: (type?.fields ?? []).map((f) => ({ __typename: 'ThingAttribute', key: f.key, label: f.label, kind: f.kind, unit: f.unit, identifier: f.identifier, value: t.attributes[f.key] ?? null })),
    dates,
    photos: t.photos,
    documents: t.documents,
    relationships: [...out, ...inbound],
    contentsCount: contents.length,
    ...(withContents ? { contents: contents.map((c) => render(c)) } : {}),
  };
}

/** `thingTree`: every live thing as a node, depth-first, siblings by name. */
function tree() {
  const all = byIdAll();
  return WORLD.map((t) => {
    const type = typeById.get(t.typeId);
    const parent = t.parentId ? all.get(t.parentId) : null;
    return {
      __typename: 'ThingNode',
      id: t.id,
      name: t.name,
      parentId: t.parentId ?? null,
      parentInTrash: Boolean(parent?.deletedAt),
      kind: kindOf(t),
      childCount: liveChildren(t.id).length,
      itemCount: insideCount(t.id),
      type: type ? { __typename: 'ThingType', id: type.id, name: type.name, icon: type.icon } : null,
    };
  });
}

// ── Filtering, faithful enough that the counts are the grid's counts ───────
const dueBuckets = (t) => {
  const ds = t.dates.filter(Boolean);
  const out = new Set();
  for (const d of ds) {
    if (d.status === 'overdue') out.add('overdue');
    else {
      if (d.daysUntil <= 30) out.add('30d');
      if (d.daysUntil <= 90) out.add('90d');
      if (d.daysUntil <= 97) out.add('year');
    }
  }
  return [...out];
};
const VALUES = {
  types: (t) => [t.typeId],
  tags: (t) => t.tags,
  within: (t) => ancestorIds(t),
  kinds: (t) => [kindOf(t)],
  due: dueBuckets,
  missing: (t) => missingOf(t, typeById.get(t.typeId)),
};
function matches(t, f = {}, skip = null) {
  const has = (key, wanted, all = false) => {
    if (skip === key || !wanted?.length) return true;
    const vals = VALUES[key](t);
    return all ? wanted.every((w) => vals.includes(w)) : wanted.some((w) => vals.includes(w));
  };
  // Locations are not inventory unless asked for (the gateway's default).
  if (skip !== 'kinds' && !f.kinds?.length && kindOf(t) === 'location') return false;
  if (f.q) {
    const words = String(f.q).toLowerCase().split(/\s+/).filter((w) => !w.includes(':'));
    const hay = [t.name, t.notes, ...t.tags, ...Object.values(t.attributes)].join(' ').toLowerCase();
    if (!words.every((w) => hay.includes(w))) return false;
    const inTokens = [...String(f.q).matchAll(/in:(\S+)/gi)].map((m) => m[1].toLowerCase());
    if (inTokens.length && !inTokens.some((v) => pathOf(t).some((p) => p.name.toLowerCase() === v || p.id === v))) return false;
  }
  if (!has('types', f.types) || !has('tags', f.tags, f.tagMatch === 'all') || !has('within', f.within) || !has('kinds', f.kinds) || !has('due', f.due) || !has('missing', f.missing)) return false;
  if (skip !== 'hasPhotos' && f.hasPhotos != null && Boolean(t.photos.length) !== f.hasPhotos) return false;
  if (skip !== 'hasDocuments' && f.hasDocuments != null && Boolean(t.documents.length) !== f.hasDocuments) return false;
  const year = t.acquired[0] ? Number(t.acquired[0].slice(0, 4)) : null;
  if (skip !== 'year' && (f.acquiredYearMin != null || f.acquiredYearMax != null)) {
    if (year == null || (f.acquiredYearMin != null && year < f.acquiredYearMin) || (f.acquiredYearMax != null && year > f.acquiredYearMax)) return false;
  }
  if (f.valueMin != null || f.valueMax != null) {
    const v = t.value[0];
    if (v == null || (f.valueMin != null && v < f.valueMin) || (f.valueMax != null && v > f.valueMax)) return false;
  }
  return true;
}

const SORTERS = {
  name: (a, b) => a.name.localeCompare(b.name),
  recentlyAdded: (a, b) => a.createdAt.localeCompare(b.createdAt),
  acquired: (a, b) => String(a.acquired[0] || '').localeCompare(String(b.acquired[0] || '')),
  value: (a, b) => (a.value[0] ?? -1) - (b.value[0] ?? -1),
  nextDue: (a, b) => (render(a).nextDue?.daysUntil ?? 1e9) - (render(b).nextDue?.daysUntil ?? 1e9),
};

function tally(key, f) {
  const counts = new Map();
  for (const t of WORLD) if (matches(t, f, key)) for (const v of new Set(VALUES[key](t))) counts.set(v, (counts.get(v) || 0) + 1);
  return [...counts].map(([value, count]) => ({ __typename: 'ThingFacetValue', value, count }));
}
function facets(f = {}) {
  const years = new Map();
  for (const t of WORLD) if (matches(t, f, 'year') && t.acquired[0]) years.set(Number(t.acquired[0].slice(0, 4)), (years.get(Number(t.acquired[0].slice(0, 4))) || 0) + 1);
  // Where: only live locations and containers are offered.
  const offered = new Set(WORLD.filter((t) => kindOf(t) !== 'item').map((t) => t.id));
  return {
    __typename: 'ThingFacets',
    total: WORLD.filter((t) => matches(t, f)).length,
    types: tally('types', f),
    tags: tally('tags', f),
    where: tally('within', f).filter((r) => offered.has(r.value)),
    kinds: ['location', 'container', 'item'].map((value) => ({ __typename: 'ThingFacetValue', value, count: WORLD.filter((t) => matches(t, f, 'kinds') && kindOf(t) === value).length })),
    due: ['overdue', '30d', '90d', 'year'].map((value) => ({ __typename: 'ThingFacetValue', value, count: WORLD.filter((t) => matches(t, f, 'due') && dueBuckets(t).includes(value)).length })),
    missing: ['photo', 'id-plate', 'receipt', 'serial', 'value'].map((value) => ({ __typename: 'ThingFacetValue', value, count: WORLD.filter((t) => matches(t, f, 'missing') && VALUES.missing(t).includes(value)).length })),
    acquiredYears: [...years].sort((a, b) => a[0] - b[0]).map(([year, count]) => ({ __typename: 'ThingYearBucket', year, count })),
    hasPhotos: WORLD.filter((t) => matches(t, f, 'hasPhotos') && t.photos.length).length,
    hasDocuments: WORLD.filter((t) => matches(t, f, 'hasDocuments') && t.documents.length).length,
  };
}

function types() {
  return TYPES.map((t) => ({ ...t, thingCount: WORLD.filter((x) => x.typeId === t.id).length }));
}

function page(items, v) {
  const limit = v.limit || 48;
  const pageNum = v.page || 1;
  const slice = items.slice((pageNum - 1) * limit, pageNum * limit);
  return { __typename: 'ThingPage', things: slice.map((t) => render(t)), total: items.length, page: pageNum, pages: Math.max(1, Math.ceil(items.length / limit)) };
}

function list(v) {
  let items = WORLD.filter((t) => matches(t, v.filter || {}));
  items = [...items].sort(SORTERS[v.sort] || SORTERS.name);
  if (v.sortDir === 'desc') items.reverse();
  return items;
}

let savedFilters = [
  { __typename: 'ThingSavedFilter', id: 'v1', name: 'Firearms', filter: { types: ['t-firearm'] }, sortBy: 'name', sortDir: 'asc' },
  { __typename: 'ThingSavedFilter', id: 'v2', name: 'Fishing gear', filter: { tags: ['fishing'] }, sortBy: 'value', sortDir: 'desc' },
];

const VOCAB = {
  __typename: 'ThingVocabulary',
  fieldKinds: ['text', 'number', 'date', 'choice', 'money', 'url', 'boolean'],
  dateKinds: ['warranty', 'registration', 'insurance', 'license', 'maintenance', 'other'],
  photoRoles: ['overview', 'id-plate', 'receipt', 'detail', 'other'],
  documentRoles: ['receipt', 'manual', 'warranty', 'registration', 'insurance', 'other'],
  relationshipKinds: ['accessory-of'],
  thingKinds: ['location', 'container', 'item'],
  missingKeys: ['photo', 'id-plate', 'receipt', 'serial', 'value'],
  trashDays: 30,
};

const inventory = () => WORLD.filter((t) => kindOf(t) !== 'location');

function attention() {
  const rendered = inventory().map((t) => render(t));
  const count = (k) => rendered.filter((t) => t.missing.includes(k)).length;
  return {
    __typename: 'ThingAttention',
    overdue: rendered.filter((t) => t.nextDue?.status === 'overdue'),
    dueSoon: rendered.filter((t) => t.nextDue && t.nextDue.status !== 'overdue' && t.nextDue.daysUntil <= 30),
    missingIdPlate: count('id-plate'),
    missingReceipt: count('receipt'),
    missingSerial: count('serial'),
    missingValue: count('value'),
    missingPhoto: count('photo'),
  };
}

function totals(f = {}) {
  const items = WORLD.filter((t) => matches(t, f) && kindOf(t) !== 'location').map((t) => render(t));
  return {
    __typename: 'ThingInsuranceTotals',
    count: items.length,
    totalValue: items.reduce((n, t) => n + (t.value.amount || 0), 0),
    currency: 'USD',
    withSerial: items.filter((t) => t.fields.some((x) => x.identifier) && !t.missing.includes('serial')).length,
    withReceipt: items.filter((t) => !t.missing.includes('receipt')).length,
    withPhoto: items.filter((t) => t.photos.length).length,
  };
}

const find = (id) => WORLD.find((t) => t.id === id) ?? WORLD.find((t) => t.id === 'th1');

export const OPS = {
  GetThings: (v) => ({ things: page(list(v), v) }),
  GetReportThings: (v) => ({ things: page(list(v), v) }),
  SearchThings: (v) => ({ things: { __typename: 'ThingPage', total: list(v).length, things: list(v).slice(0, v.limit || 12).map((t) => { const r = render(t); return { __typename: 'Thing', id: r.id, name: r.name, type: r.type, coverPhoto: r.coverPhoto }; }) } }),
  GetThingFacets: (v) => ({ thingFacets: facets(v.filter || {}) }),
  GetThing: (v) => ({ thing: WORLD.some((t) => t.id === v.id) ? render(find(v.id), { withContents: true }) : null }),
  GetThingTypes: () => ({ thingTypes: types() }),
  GetThingTree: () => ({ thingTree: tree() }),
  GetThingAttention: () => ({ thingAttention: attention() }),
  GetThingProfile: () => ({ thingProfile: { __typename: 'ThingProfile', savedFilters } }),
  GetThingVocabulary: { thingVocabulary: VOCAB },
  GetTrashedThings: () => ({ trashedThings: TRASH.map((t) => render(t)) }),
  GetThingInsuranceTotals: (v) => ({ thingInsuranceTotals: totals(v.filter || {}) }),
  CreateThing: (v) => ({ createThing: render({ ...BLANK, id: 'th-new', name: v.input?.name || 'New thing', typeId: v.input?.typeId || 't-general', parentId: v.input?.parentId || null, tags: v.input?.tags || [], createdAt: new Date().toISOString() }) }),
  UpdateThing: (v) => ({ updateThing: render({ ...find(v.id), ...(v.input && 'parentId' in v.input ? { parentId: v.input.parentId } : {}) }) }),
  DeleteThing: { deleteThing: { __typename: 'DeleteResponse', success: true, message: null } },
  RestoreThing: (v) => ({ restoreThing: render(TRASH.find((t) => t.id === v.id) ?? TRASH[0]) }),
  CreateThingType: (v) => ({ createThingType: { ...TYPES[TYPES.length - 1], id: 't-new', key: 'new', name: v.input?.name || 'New', kind: v.input?.kind || 'item', builtIn: false, fields: [] } }),
  UpdateThingType: (v) => ({ updateThingType: types().find((t) => t.id === v.id) ?? TYPES[0] }),
  DeleteThingType: { deleteThingType: { __typename: 'DeleteResponse', success: true, message: null } },
  SaveThingFilter: (v) => {
    savedFilters = [...savedFilters, { __typename: 'ThingSavedFilter', id: `v${savedFilters.length + 1}`, filter: null, sortBy: null, sortDir: null, ...v.input }];
    return { saveThingFilter: { __typename: 'ThingProfile', savedFilters } };
  },
  DeleteThingFilter: (v) => {
    savedFilters = savedFilters.filter((x) => x.id !== v.id);
    return { deleteThingFilter: { __typename: 'ThingProfile', savedFilters } };
  },
};

// A brand-new household: the starter types, no things, no views.
const EMPTY_FACETS = { __typename: 'ThingFacets', total: 0, types: [], tags: [], where: [], kinds: [], due: [], missing: [], acquiredYears: [], hasPhotos: 0, hasDocuments: 0 };
export const EMPTY_OPS = {
  ...OPS,
  GetThings: () => ({ things: { __typename: 'ThingPage', things: [], total: 0, page: 1, pages: 1 } }),
  GetThingFacets: () => ({ thingFacets: EMPTY_FACETS }),
  GetThingTypes: () => ({ thingTypes: TYPES }),
  GetThingTree: () => ({ thingTree: [] }),
  GetThingAttention: () => ({ thingAttention: { __typename: 'ThingAttention', overdue: [], dueSoon: [], missingIdPlate: 0, missingReceipt: 0, missingSerial: 0, missingValue: 0, missingPhoto: 0 } }),
  GetThingProfile: () => ({ thingProfile: { __typename: 'ThingProfile', savedFilters: [] } }),
};

// ── Photo art: stand-ins that read as photographs at a glance ───────────────
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
function scene(sky, ground, shape) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1200" viewBox="0 0 1600 1200">` +
    `<defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sky[0]}"/><stop offset="1" stop-color="${sky[1]}"/></linearGradient>` +
    `<radialGradient id="l" cx=".7" cy=".2" r=".7"><stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>` +
    `<linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${ground[0]}"/><stop offset="1" stop-color="${ground[1]}"/></linearGradient>` +
    `<radialGradient id="v" cx=".5" cy=".5" r=".75"><stop offset=".6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".45"/></radialGradient></defs>` +
    `<rect width="1600" height="1200" fill="url(#s)"/><rect width="1600" height="1200" fill="url(#l)"/>` +
    `<rect y="780" width="1600" height="420" fill="url(#g)"/>${shape}<rect width="1600" height="1200" fill="url(#v)"/></svg>`;
}
function plate(lines, metal = ['#C9CCD1', '#8D9199']) {
  const text = lines.map((l, i) => `<text x="330" y="${470 + i * 92}" font-family="DejaVu Sans Mono, monospace" font-size="54" fill="#2A2C30" letter-spacing="4">${esc(l)}</text>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1200" viewBox="0 0 1600 1200"><defs><linearGradient id="m" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${metal[0]}"/><stop offset="1" stop-color="${metal[1]}"/></linearGradient></defs>` +
    `<rect width="1600" height="1200" fill="#2B2A27"/><rect x="250" y="300" width="1100" height="600" rx="36" fill="url(#m)" stroke="#6E7178" stroke-width="6"/>` +
    `<circle cx="310" cy="360" r="18" fill="#6E7178"/><circle cx="1290" cy="360" r="18" fill="#6E7178"/><circle cx="310" cy="840" r="18" fill="#6E7178"/><circle cx="1290" cy="840" r="18" fill="#6E7178"/>${text}</svg>`;
}
const ART = {
  boat: scene(['#9CC3DA', '#DCE9EF'], ['#3F6E86', '#23475A'], '<path d="M300 760 L1350 760 L1230 900 L420 900 Z" fill="#E9EDF0"/><path d="M420 900 L1230 900 L1210 930 L440 930 Z" fill="#1F3B57"/><path d="M620 760 L760 620 L1000 620 L1060 760 Z" fill="#2C3E50"/><rect x="760" y="640" width="200" height="60" rx="10" fill="#8FB3C9"/><path d="M300 760 L1350 760 L1340 790 L310 790 Z" fill="#B3272D"/>'),
  console: scene(['#403C36', '#26231F'], ['#1C1A17', '#12110F'], '<rect x="420" y="420" width="760" height="420" rx="30" fill="#2E2B27" stroke="#55504A" stroke-width="8"/><circle cx="620" cy="620" r="110" fill="#11100E" stroke="#8A837A" stroke-width="10"/><circle cx="980" cy="620" r="110" fill="#11100E" stroke="#8A837A" stroke-width="10"/><path d="M620 620 L690 560" stroke="#E0B34A" stroke-width="10"/><path d="M980 620 L920 540" stroke="#E0B34A" stroke-width="10"/>'),
  finder: scene(['#2E3A44', '#161D23'], ['#101418', '#0A0D10'], '<rect x="540" y="330" width="520" height="440" rx="36" fill="#1B1F24" stroke="#3B434C" stroke-width="10"/><rect x="580" y="370" width="440" height="300" rx="10" fill="#0E3F66"/><path d="M580 560 C 680 520, 760 610, 860 560 S 1000 600, 1020 570 L1020 670 L580 670 Z" fill="#E28F2A" opacity=".85"/><rect x="600" y="700" width="400" height="40" rx="10" fill="#2A3139"/>'),
  truck: scene(['#AFC6D9', '#E4ECF2'], ['#77736B', '#4F4B45'], '<path d="M260 820 L260 640 L620 640 L720 520 L1000 520 L1080 640 L1340 650 L1340 820 Z" fill="#3E5F7A"/><path d="M745 545 L985 545 L1045 635 L700 635 Z" fill="#B9D0E0"/><circle cx="480" cy="840" r="100" fill="#1D1D1D"/><circle cx="480" cy="840" r="45" fill="#8C8C8C"/><circle cx="1140" cy="840" r="100" fill="#1D1D1D"/><circle cx="1140" cy="840" r="45" fill="#8C8C8C"/><rect x="1300" y="700" width="50" height="36" fill="#F2D06B"/>'),
  rifle: scene(['#5A4B3A', '#3A3026'], ['#2A231B', '#1E1914'], '<path d="M220 600 L1180 580 L1380 600 L1380 630 L1180 640 L760 650 L700 720 L560 720 L600 650 L220 640 Z" fill="#6B4A2E"/><rect x="760" y="560" width="620" height="34" rx="12" fill="#2B2B2B"/><rect x="820" y="520" width="240" height="30" rx="12" fill="#1C1C1C"/>'),
  pistol: scene(['#3C3F44', '#24262A'], ['#1B1C1F', '#111214'], '<path d="M560 500 L1080 500 L1080 590 L820 590 L790 780 L650 780 L680 590 L560 590 Z" fill="#222326" stroke="#4A4C50" stroke-width="6"/><rect x="580" y="520" width="480" height="18" fill="#3A3C40"/>'),
  drill: scene(['#E7D9A8', '#F4EDD2'], ['#9C8F74', '#7A6F59'], '<path d="M560 460 L1060 460 L1060 600 L860 600 L840 820 L700 820 L720 600 L560 600 Z" fill="#E8B92E"/><rect x="1060" y="505" width="170" height="50" fill="#4A4A4A"/><rect x="660" y="820" width="220" height="110" rx="14" fill="#1E1E1E"/><rect x="560" y="470" width="140" height="120" fill="#1E1E1E"/>'),
  keyboard: scene(['#D9D4CC', '#EFEBE4'], ['#B9B2A6', '#9E978A'], `<rect x="300" y="480" width="1000" height="360" rx="30" fill="#3A3F46"/>${Array.from({ length: 5 }, (_, r) => Array.from({ length: 14 }, (_, c) => `<rect x="${335 + c * 68}" y="${510 + r * 64}" width="58" height="54" rx="8" fill="${(r + c) % 7 === 0 ? '#F2B8C6' : '#F4EFE6'}"/>`).join('')).join('')}`),
  camera: scene(['#2B2926', '#1A1917'], ['#141311', '#0D0C0B'], '<rect x="470" y="470" width="660" height="400" rx="40" fill="#1D1D1F" stroke="#3A3A3D" stroke-width="8"/><circle cx="800" cy="680" r="170" fill="#111" stroke="#5A5A5E" stroke-width="16"/><circle cx="800" cy="680" r="90" fill="#243447"/><rect x="520" y="420" width="190" height="70" rx="14" fill="#1D1D1F"/>'),
  safe: scene(['#3A3D40', '#24272A'], ['#1B1D1F', '#121314'], '<rect x="560" y="300" width="480" height="640" rx="24" fill="#2F3B33" stroke="#56645A" stroke-width="10"/><circle cx="800" cy="560" r="80" fill="#1A201C" stroke="#B9A56A" stroke-width="10"/><path d="M800 560 L850 520" stroke="#B9A56A" stroke-width="10"/><rect x="930" y="520" width="60" height="140" rx="12" fill="#B9A56A"/>'),
  van: scene(['#B7CCDB', '#E6EEF3'], ['#6F6B63', '#4B4843'], '<path d="M240 820 L240 560 Q260 500 330 500 L1060 500 L1260 640 L1360 660 L1360 820 Z" fill="#E7E9EB"/><path d="M1070 520 L1240 640 L1070 640 Z" fill="#9FB8CA"/><rect x="330" y="540" width="620" height="120" rx="10" fill="#C9D2D8"/><circle cx="470" cy="840" r="95" fill="#1D1D1D"/><circle cx="470" cy="840" r="42" fill="#8C8C8C"/><circle cx="1160" cy="840" r="95" fill="#1D1D1D"/><circle cx="1160" cy="840" r="42" fill="#8C8C8C"/>'),
  stereo: scene(['#23262B', '#15171A'], ['#101113', '#0A0B0C'], '<rect x="420" y="460" width="760" height="300" rx="24" fill="#16181B" stroke="#3E434A" stroke-width="8"/><rect x="470" y="500" width="520" height="220" rx="8" fill="#0E3F66"/><rect x="500" y="540" width="200" height="140" rx="8" fill="#E28F2A" opacity=".8"/><circle cx="1090" cy="610" r="60" fill="#2A2E33" stroke="#6B7178" stroke-width="6"/>'),
  'plate-boat': plate(['TRACKER MARINE', 'HIN BUJ12345E919', 'MAX HP 90  PERSONS 4', 'MAX WT 1050 LB']),
  'plate-rifle': plate(['STURM RUGER & CO', 'MODEL 10/22 CARBINE', 'SERIAL 0012-34567', 'CAL .22 LR'], ['#3A3A3A', '#1F1F1F']).replace(/fill="#2A2C30"/g, 'fill="#D9D9D9"'),
};

export async function routes(ctx) {
  await sessionRoutes(ctx);
  await ctx.route(/\/api\/files\/([^/?]+)/, (r) => {
    const id = /\/api\/files\/([^/?]+)/.exec(r.request().url())[1];
    const art = ART[FILES[id]];
    if (!art) return body(r, { status: 404, contentType: 'application/json', body: '{"error":"not found"}' });
    return svg(r, art);
  });
  await ctx.route(/\/api\/things\/[^/]+\/files/, (r) => json(r, { file: { id: 'f-up' }, entry: { id: 'ph-up' }, deduped: false }, 201));
  await graphqlRoute(ctx, (op, vars, r) => {
    let pageUrl = '';
    try {
      pageUrl = r.request().frame().url();
    } catch {
      pageUrl = '';
    }
    const ops = pageUrl.includes('__fixture=empty') ? EMPTY_OPS : OPS;
    const entry = ops[op];
    return typeof entry === 'function' ? entry(vars, r) : entry;
  });
  // Registered AFTER the stub so it runs first (newest-first); falls through otherwise.
  await ctx.route('**/graphql', (r) => {
    if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 204, headers: corsHeaders(r), body: '' });
    const pageUrl = (() => {
      try {
        return r.request().frame().url();
      } catch {
        return '';
      }
    })();
    if (pageUrl.includes('__fixture=nonmember')) {
      return json(r, { data: null, errors: [{ message: 'ThingGeek is only open to members of this household.', extensions: { code: 'NOT_A_MEMBER' } }] });
    }
    return r.fallback();
  });
}
