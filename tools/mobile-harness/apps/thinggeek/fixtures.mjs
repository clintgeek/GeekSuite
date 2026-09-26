// ThingGeek fixtures. A believable small household inventory — Wendy the
// Tracker boat (equipped with a Garmin fish finder and a trolling motor), a
// truck, two firearms with serials, shop tools, a keyboard, a camera — in a
// place tree of House › Garage › Shelf 2, House › Office, House › Gun safe
// and the Truck. Names, serials and values are realistic lengths: the two-
// line clamps, the masked "••••4567" and the tabular value column are the
// point. Dates are the gateway's answer (daysUntil/status/occursOn), fixed.
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
  { id: 't-boat', key: 'boat', name: 'Boat', icon: 'DirectionsBoat', fields: [F('manufacturer', 'Manufacturer'), F('model', 'Model'), F('year', 'Year', 'number'), F('lengthFt', 'Length', 'number', { unit: 'ft' }), F('engine', 'Engine'), F('hullNumber', 'Hull number', 'text', { identifier: true }), F('registrationNumber', 'Registration number', 'text', { identifier: true })] },
  { id: 't-vehicle', key: 'vehicle', name: 'Vehicle', icon: 'DirectionsCar', fields: [F('make', 'Make'), F('model', 'Model'), F('year', 'Year', 'number'), F('vin', 'VIN', 'text', { identifier: true }), F('plate', 'Plate', 'text', { identifier: true }), F('mileage', 'Mileage', 'number', { unit: 'mi' })] },
  { id: 't-firearm', key: 'firearm', name: 'Firearm', icon: 'GpsFixed', fields: [F('manufacturer', 'Manufacturer'), F('model', 'Model'), F('kind', 'Kind', 'choice', { choices: ['Handgun', 'Rifle', 'Shotgun', 'Other'] }), F('caliber', 'Caliber / gauge'), F('action', 'Action'), F('serial', 'Serial number', 'text', { identifier: true })] },
  { id: 't-tool', key: 'tool', name: 'Tool', icon: 'Handyman', fields: [F('brand', 'Brand'), F('model', 'Model'), F('power', 'Power', 'choice', { choices: ['Corded', 'Battery', 'Manual', 'Gas'] }), F('serial', 'Serial number', 'text', { identifier: true })] },
  { id: 't-electronics', key: 'electronics', name: 'Electronics', icon: 'Devices', fields: [F('brand', 'Brand'), F('model', 'Model'), F('serial', 'Serial number', 'text', { identifier: true })] },
  { id: 't-keyboard', key: 'keyboard', name: 'Keyboard', icon: 'Keyboard', fields: [F('brand', 'Brand'), F('model', 'Model'), F('layout', 'Layout'), F('switches', 'Switches'), F('keycaps', 'Keycaps'), F('connection', 'Connection', 'choice', { choices: ['Wired', 'Wireless', 'Both'] })] },
  { id: 't-appliance', key: 'appliance', name: 'Appliance', icon: 'Kitchen', fields: [F('brand', 'Brand'), F('model', 'Model'), F('serial', 'Serial number', 'text', { identifier: true })] },
  { id: 't-camera', key: 'camera', name: 'Camera', icon: 'PhotoCamera', fields: [F('brand', 'Brand'), F('model', 'Model'), F('serial', 'Serial number', 'text', { identifier: true })] },
  { id: 't-general', key: 'general', name: 'General', icon: 'Inventory2', fields: [] },
].map((t) => ({ __typename: 'ThingType', builtIn: true, thingCount: 0, ...t }));
const typeById = new Map(TYPES.map((t) => [t.id, t]));

// ── Places ──────────────────────────────────────────────────────────────────
const PLACE_ROWS = [
  ['p-house', 'House', null],
  ['p-garage', 'Garage', 'p-house'],
  ['p-shelf2', 'Shelf 2', 'p-garage'],
  ['p-office', 'Office', 'p-house'],
  ['p-safe', 'Gun safe', 'p-house'],
  ['p-truck', 'Truck', null],
];
const placeRow = new Map(PLACE_ROWS.map(([id, name, parentId]) => [id, { id, name, parentId }]));
const pathOf = (id) => {
  const out = [];
  let cur = placeRow.get(id);
  while (cur) {
    out.unshift({ __typename: 'Place', id: cur.id, name: cur.name });
    cur = cur.parentId ? placeRow.get(cur.parentId) : null;
  }
  return out;
};
const descendants = (id) => {
  const out = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const [pid, , parent] of PLACE_ROWS) if (parent && out.has(parent) && !out.has(pid)) { out.add(pid); grew = true; }
  }
  return out;
};
const placeRef = (id) => (id ? { __typename: 'Place', id, name: placeRow.get(id).name, parentId: placeRow.get(id).parentId, path: pathOf(id) } : null);

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
const RAW = [
  {
    id: 'th1', name: 'Wendy', typeId: 't-boat', placeId: 'p-garage', tags: ['fishing', 'lake'],
    attributes: { manufacturer: 'Tracker', model: 'Pro Team 175 TXW', year: 2019, lengthFt: 17.5, engine: 'Mercury 90 ELPT FourStroke', hullNumber: 'BUJ12345E919', registrationNumber: 'MO 4417 BK' },
    value: [18500, '2026-05-01'], acquired: ['2019-04-20', 'Bass Pro Shops, Springfield', 21995],
    dates: [
      date('dt1', 'registration', 'Boat registration', '2026-10-07', 12, 'soon'),
      date('dt2', 'maintenance', 'Winterize', '2024-11-01', 37, 'upcoming', { recur: 12, occursOn: '2026-11-01', notes: 'Fog the engine, stabilize the fuel, pull the drain plug.' }),
      date('dt3', 'insurance', 'Boat policy renews', '2021-03-15', 171, 'later', { recur: 12, occursOn: '2027-03-15' }),
    ],
    photos: [photo('overview', 'boat', 'At the ramp, Table Rock'), photo('id-plate', 'plate-boat', 'Capacity plate, transom'), photo('detail', 'console')],
    documents: [doc('registration', 'Missouri registration', 'mo-boat-registration-2025.pdf', 184320), doc('manual', 'Owner’s manual', 'tracker-pt175-manual.pdf', 8912896)],
    rel: [['equipped-with', 'th2'], ['equipped-with', 'th3']],
    notes: 'Spare key is on the hook by the garage door. Trailer tires replaced 2024.',
    createdAt: ago(40),
  },
  {
    id: 'th2', name: 'Garmin Striker 4', typeId: 't-electronics', placeId: 'p-garage', tags: ['fishing'],
    attributes: { brand: 'Garmin', model: 'Striker 4 (010-01550-00)', serial: '4P1234567' },
    value: [120, '2026-05-01'], acquired: ['2019-05-02', 'Amazon', 119.99],
    dates: [],
    photos: [photo('overview', 'finder')], documents: [], rel: [], createdAt: ago(38),
  },
  {
    id: 'th3', name: 'Minn Kota Endura C2 trolling motor', typeId: 't-electronics', placeId: 'p-garage', tags: ['fishing'],
    attributes: { brand: 'Minn Kota', model: 'Endura C2 40', serial: '' },
    value: [230, null], acquired: ['2019-05-10', 'Academy Sports', 249.99],
    dates: [], photos: [], documents: [], rel: [], createdAt: ago(37),
  },
  {
    id: 'th4', name: '2021 Ford F-150 XLT', typeId: 't-vehicle', placeId: 'p-garage', tags: ['towing'],
    attributes: { make: 'Ford', model: 'F-150 XLT SuperCrew', year: 2021, vin: '1FTFW1E85MFA12345', plate: 'ZX4 R7T', mileage: 48210 },
    value: [34500, '2026-08-15'], acquired: ['2021-06-12', 'Lou Fusz Ford', 47250],
    dates: [date('dt5', 'registration', 'Plates renewal', '2026-09-22', -3, 'overdue'), date('dt6', 'insurance', 'Auto policy', '2023-12-01', 67, 'upcoming', { recur: 6, occursOn: '2026-12-01' })],
    photos: [photo('overview', 'truck')], documents: [doc('receipt', 'Bill of sale', 'f150-bill-of-sale.pdf', 402432), doc('insurance', 'Insurance card', 'state-farm-card.pdf', 96256)],
    rel: [], createdAt: ago(30),
  },
  {
    id: 'th5', name: 'Ruger 10/22 Carbine', typeId: 't-firearm', placeId: 'p-safe', tags: ['hunting'],
    attributes: { manufacturer: 'Ruger', model: '10/22 Carbine (1103)', kind: 'Rifle', caliber: '.22 LR', action: 'Semi-automatic', serial: '0012-34567' },
    value: [320, '2026-01-10'], acquired: ['2015-11-27', 'Cabela’s', 279],
    dates: [], photos: [photo('overview', 'rifle'), photo('id-plate', 'plate-rifle', 'Receiver, left side')], documents: [doc('receipt', 'Cabela’s receipt', 'cabelas-1022.pdf', 88064)],
    rel: [], createdAt: ago(20),
  },
  {
    id: 'th6', name: 'Glock 19 Gen 5', typeId: 't-firearm', placeId: 'p-safe', tags: [],
    attributes: { manufacturer: 'Glock', model: '19 Gen 5 MOS', kind: 'Handgun', caliber: '9mm', action: 'Striker-fired', serial: 'BXYZ123' },
    value: [550, null], acquired: ['2022-02-14', null, null],
    dates: [], photos: [photo('overview', 'pistol')], documents: [], rel: [], createdAt: ago(18),
  },
  {
    id: 'th7', name: 'DeWalt 20V MAX drill/driver', typeId: 't-tool', placeId: 'p-shelf2', tags: ['shop'],
    attributes: { brand: 'DeWalt', model: 'DCD791D2', power: 'Battery', serial: '' },
    value: [null, null], acquired: ['2023-07-04', 'Home Depot', 179],
    dates: [date('dt7', 'warranty', '3-year limited warranty', '2027-02-10', 138, 'later')],
    photos: [photo('overview', 'drill')], documents: [], rel: [['stored-with', 'th8']], createdAt: ago(12),
  },
  {
    id: 'th8', name: 'Milwaukee M18 Fuel circular saw', typeId: 't-tool', placeId: 'p-truck', tags: ['shop', 'jobsite'],
    attributes: { brand: 'Milwaukee', model: '2732-20', power: 'Battery', serial: 'J41A2023001234' },
    value: [199, '2025-11-01'], acquired: ['2023-03-18', 'Home Depot', 229],
    dates: [], photos: [], documents: [doc('receipt', 'Home Depot receipt', 'hd-receipt-0318.jpg', 1310720, 'image/jpeg')], rel: [], createdAt: ago(10),
  },
  {
    id: 'th9', name: 'Keychron Q1 Pro', typeId: 't-keyboard', placeId: 'p-office', tags: ['desk'],
    attributes: { brand: 'Keychron', model: 'Q1 Pro', layout: '75% ANSI', switches: 'Gateron Jupiter Brown', keycaps: 'KAT Milkshake PBT', connection: 'Both' },
    value: [199, '2026-02-01'], acquired: ['2024-01-15', 'keychron.com', 219],
    dates: [], photos: [photo('overview', 'keyboard')], documents: [doc('receipt', null, 'keychron-order-48213.pdf', 51200)], rel: [], createdAt: ago(6),
  },
  {
    id: 'th10', name: 'Sony α7 III', typeId: 't-camera', placeId: 'p-office', tags: ['photo'],
    attributes: { brand: 'Sony', model: 'ILCE-7M3', serial: '4512345' },
    value: [1100, '2026-03-01'], acquired: ['2019-12-20', 'B&H Photo', 1998],
    dates: [date('dt8', 'warranty', 'B&H extended warranty', '2026-10-19', 24, 'soon')],
    photos: [photo('overview', 'camera')], documents: [], rel: [], createdAt: ago(2),
  },
];

const TRASHED_RAW = [
  { id: 'th11', name: 'Old Humminbird PiranhaMax', typeId: 't-electronics', placeId: null, tags: ['fishing'], attributes: { brand: 'Humminbird', model: 'PiranhaMax 4', serial: '' }, value: [null, null], acquired: [null, null, null], dates: [], photos: [], documents: [], rel: [], createdAt: ago(300), deletedAt: ago(10) },
  { id: 'th12', name: 'Broken shop vac', typeId: 't-appliance', placeId: 'p-shelf2', tags: ['shop'], attributes: { brand: 'Craftsman', model: 'CMXEVBE17250', serial: '' }, value: [null, null], acquired: [null, null, null], dates: [], photos: [], documents: [], rel: [], createdAt: ago(200), deletedAt: ago(27) },
];

// ── Rendering a thing the way the gateway does ─────────────────────────────
function summary(t) {
  const cover = t.photos.find((p) => p.role === 'overview') ?? t.photos[0];
  const type = typeById.get(t.typeId);
  return { __typename: 'ThingSummary', id: t.id, name: t.name, coverThumbUrl: cover?.thumbUrl ?? null, type: type ? { __typename: 'ThingType', id: type.id, name: type.name, icon: type.icon } : null };
}

function missingOf(t, type) {
  const ident = (type?.fields ?? []).filter((f) => f.identifier).map((f) => f.key);
  const out = [];
  if (!t.photos.length) out.push('photo');
  if (ident.length && !t.photos.some((p) => p.role === 'id-plate')) out.push('id-plate');
  if (!t.photos.some((p) => p.role === 'receipt') && !t.documents.some((d) => d.role === 'receipt')) out.push('receipt');
  if (ident.length && ident.some((k) => !t.attributes[k])) out.push('serial');
  if (t.value[0] == null) out.push('value');
  return out;
}

let WORLD = RAW;
let TRASH = TRASHED_RAW;

function render(t) {
  const type = typeById.get(t.typeId) ?? null;
  const cover = t.photos.find((p) => p.role === 'overview') ?? t.photos[0] ?? null;
  const out = t.rel.map(([kind, other], i) => ({ __typename: 'ThingRelationship', id: `${t.id}-r${i}`, kind, direction: 'out', thing: summary(WORLD.find((x) => x.id === other)) }));
  const inbound = WORLD.flatMap((o) => o.rel.filter(([, target]) => target === t.id).map(([kind], i) => ({ __typename: 'ThingRelationship', id: `${o.id}-in-${t.id}-${i}`, kind, direction: 'in', thing: summary(o) })));
  const dates = t.dates.filter(Boolean);
  const nextDue = [...dates].sort((a, b) => a.daysUntil - b.daysUntil).find((d) => d.status !== 'later') ?? [...dates].sort((a, b) => a.daysUntil - b.daysUntil)[0] ?? null;
  return {
    __typename: 'Thing',
    id: t.id,
    name: t.name,
    tags: t.tags,
    missing: missingOf(t, type),
    createdAt: t.createdAt,
    updatedAt: t.createdAt,
    deletedAt: t.deletedAt ?? null,
    type: type ? { __typename: 'ThingType', id: type.id, key: type.key, name: type.name, icon: type.icon } : null,
    place: placeRef(t.placeId),
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
  };
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
  places: (t) => (t.placeId ? pathOf(t.placeId).map((p) => p.id) : []),
  due: dueBuckets,
  missing: (t) => missingOf(t, typeById.get(t.typeId)),
};
function matches(t, f = {}, skip = null) {
  const has = (key, wanted, all = false) => {
    if (skip === key || !wanted?.length) return true;
    const vals = VALUES[key](t);
    return all ? wanted.every((w) => vals.includes(w)) : wanted.some((w) => vals.includes(w));
  };
  if (f.q) {
    const words = String(f.q).toLowerCase().split(/\s+/).filter((w) => !w.includes(':'));
    const hay = [t.name, t.notes, ...t.tags, ...Object.values(t.attributes)].join(' ').toLowerCase();
    if (!words.every((w) => hay.includes(w))) return false;
  }
  if (!has('types', f.types) || !has('tags', f.tags, f.tagMatch === 'all') || !has('places', f.places) || !has('due', f.due) || !has('missing', f.missing)) return false;
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
  return {
    __typename: 'ThingFacets',
    total: WORLD.filter((t) => matches(t, f)).length,
    types: tally('types', f),
    tags: tally('tags', f),
    places: tally('places', f),
    due: ['overdue', '30d', '90d', 'year'].map((value) => ({ __typename: 'ThingFacetValue', value, count: WORLD.filter((t) => matches(t, f, 'due') && dueBuckets(t).includes(value)).length })),
    missing: ['photo', 'id-plate', 'receipt', 'serial', 'value'].map((value) => ({ __typename: 'ThingFacetValue', value, count: WORLD.filter((t) => matches(t, f, 'missing') && VALUES.missing(t).includes(value)).length })),
    acquiredYears: [...years].sort((a, b) => a[0] - b[0]).map(([year, count]) => ({ __typename: 'ThingYearBucket', year, count })),
    hasPhotos: WORLD.filter((t) => matches(t, f, 'hasPhotos') && t.photos.length).length,
    hasDocuments: WORLD.filter((t) => matches(t, f, 'hasDocuments') && t.documents.length).length,
  };
}

function places() {
  return PLACE_ROWS.map(([id, name, parentId]) => ({
    __typename: 'Place',
    id,
    name,
    parentId,
    notes: null,
    path: pathOf(id),
    directCount: WORLD.filter((t) => t.placeId === id).length,
    totalCount: WORLD.filter((t) => t.placeId && descendants(id).has(t.placeId)).length,
  }));
}

function types() {
  return TYPES.map((t) => ({ ...t, thingCount: WORLD.filter((x) => x.typeId === t.id).length }));
}

function page(items, v) {
  const limit = v.limit || 48;
  const pageNum = v.page || 1;
  const slice = items.slice((pageNum - 1) * limit, pageNum * limit);
  return { __typename: 'ThingPage', things: slice.map(render), total: items.length, page: pageNum, pages: Math.max(1, Math.ceil(items.length / limit)) };
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
  relationshipKinds: ['equipped-with', 'part-of', 'accessory-of', 'stored-with'],
  missingKeys: ['photo', 'id-plate', 'receipt', 'serial', 'value'],
  trashDays: 30,
};

function attention() {
  const rendered = WORLD.map(render);
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
  const items = WORLD.filter((t) => matches(t, f)).map(render);
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

const find = (id) => WORLD.find((t) => t.id === id) ?? WORLD[0];

export const OPS = {
  GetThings: (v) => ({ things: page(list(v), v) }),
  GetReportThings: (v) => ({ things: page(list(v), v) }),
  SearchThings: (v) => ({ things: { __typename: 'ThingPage', total: list(v).length, things: list(v).slice(0, v.limit || 12).map((t) => { const r = render(t); return { __typename: 'Thing', id: r.id, name: r.name, type: r.type, coverPhoto: r.coverPhoto }; }) } }),
  GetThingFacets: (v) => ({ thingFacets: facets(v.filter || {}) }),
  GetThing: (v) => ({ thing: WORLD.some((t) => t.id === v.id) ? render(find(v.id)) : null }),
  GetThingTypes: () => ({ thingTypes: types() }),
  GetPlaces: () => ({ places: places() }),
  GetThingAttention: () => ({ thingAttention: attention() }),
  GetThingProfile: () => ({ thingProfile: { __typename: 'ThingProfile', savedFilters } }),
  GetThingVocabulary: { thingVocabulary: VOCAB },
  GetTrashedThings: () => ({ trashedThings: TRASH.map(render) }),
  GetThingInsuranceTotals: (v) => ({ thingInsuranceTotals: totals(v.filter || {}) }),
  CreateThing: (v) => ({ createThing: render({ id: 'th-new', name: v.input?.name || 'New thing', typeId: v.input?.typeId || 't-general', placeId: v.input?.placeId || null, tags: v.input?.tags || [], attributes: {}, value: [null, null], acquired: [null, null, null], dates: [], photos: [], documents: [], rel: [], createdAt: new Date().toISOString() }) }),
  UpdateThing: (v) => ({ updateThing: render(find(v.id)) }),
  DeleteThing: { deleteThing: { __typename: 'DeleteResponse', success: true, message: null } },
  RestoreThing: (v) => ({ restoreThing: render(TRASH.find((t) => t.id === v.id) ?? TRASH[0]) }),
  CreateThingType: (v) => ({ createThingType: { ...TYPES[8], id: 't-new', key: 'new', name: v.input?.name || 'New', builtIn: false, fields: [] } }),
  UpdateThingType: (v) => ({ updateThingType: types().find((t) => t.id === v.id) ?? TYPES[0] }),
  DeleteThingType: { deleteThingType: { __typename: 'DeleteResponse', success: true, message: null } },
  CreatePlace: (v) => ({ createPlace: { __typename: 'Place', id: 'p-new', name: v.input?.name || 'New place', parentId: v.input?.parentId ?? null, notes: null, path: [{ __typename: 'Place', id: 'p-new', name: v.input?.name || 'New place' }], directCount: 0, totalCount: 0 } }),
  UpdatePlace: (v) => ({ updatePlace: places().find((p) => p.id === v.id) }),
  DeletePlace: { deletePlace: { __typename: 'DeleteResponse', success: true, message: null } },
  SaveThingFilter: (v) => {
    savedFilters = [...savedFilters, { __typename: 'ThingSavedFilter', id: `v${savedFilters.length + 1}`, filter: null, sortBy: null, sortDir: null, ...v.input }];
    return { saveThingFilter: { __typename: 'ThingProfile', savedFilters } };
  },
  DeleteThingFilter: (v) => {
    savedFilters = savedFilters.filter((x) => x.id !== v.id);
    return { deleteThingFilter: { __typename: 'ThingProfile', savedFilters } };
  },
};

// A brand-new household: the starter types, no things, no places, no views.
const EMPTY_FACETS = { __typename: 'ThingFacets', total: 0, types: [], tags: [], places: [], due: [], missing: [], acquiredYears: [], hasPhotos: 0, hasDocuments: 0 };
export const EMPTY_OPS = {
  ...OPS,
  GetThings: () => ({ things: { __typename: 'ThingPage', things: [], total: 0, page: 1, pages: 1 } }),
  GetThingFacets: () => ({ thingFacets: EMPTY_FACETS }),
  GetThingTypes: () => ({ thingTypes: TYPES }),
  GetPlaces: () => ({ places: [] }),
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
