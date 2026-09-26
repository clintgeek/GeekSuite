/**
 * thinggeek vocabulary shared by every writer. DOCS/THINGGEEK_PLAN.md is the
 * design record. Add a value here, never inline.
 */
const FIELD_KINDS = Object.freeze(['text', 'number', 'date', 'choice', 'money', 'url', 'boolean']);
const DATE_KINDS = Object.freeze(['warranty', 'registration', 'insurance', 'license', 'maintenance', 'other']);
const PHOTO_ROLES = Object.freeze(['overview', 'id-plate', 'receipt', 'detail', 'other']);
const DOCUMENT_ROLES = Object.freeze(['receipt', 'manual', 'warranty', 'registration', 'insurance', 'other']);
// Stored one way; the inverse ("the camera's accessories") is derived at read
// time. WHERE a thing is is not a relationship: that is `parentId` (below).
const RELATIONSHIP_KINDS = Object.freeze(['accessory-of']);
/**
 * A type's role in the containment graph (DOCS/THINGGEEK_PLAN.md
 * "Containment"). Every Thing's `parentId` points at another Thing:
 *   location  — house, room, shelf: offered as "where it is", but NOT
 *               inventory (lists, insurance, needs-attention, missing, value);
 *   container — van, boat, safe: inventory AND offered as "where it is";
 *   item      — inventory; not offered as "where it is" (Move may still put
 *               things inside one).
 * A thing with no type (or a type since deleted) is an `item`.
 */
const THING_KINDS = Object.freeze(['location', 'container', 'item']);
const DEFAULT_THING_KIND = 'item';
/** The kinds the "where is it?" picker offers. */
const PARENT_KINDS = Object.freeze(['location', 'container']);
const FILE_KINDS = Object.freeze(['photo', 'document']);
const PHOTO_MIMES = Object.freeze(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);
const DOCUMENT_MIMES = Object.freeze(['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'text/plain']);
/** Days a deleted Thing stays in Trash before the backend purges it and its files. */
const TRASH_DAYS = 30;
const MISSING_KEYS = Object.freeze(['photo', 'id-plate', 'receipt', 'serial', 'value']);

const bounds = Object.freeze({
  name: Object.freeze({ maxlength: 200 }),
  notes: Object.freeze({ maxlength: 10000 }),
  tag: Object.freeze({ maxlength: 60 }),
  listMax: Object.freeze({ max: 50 }),
  photosMax: Object.freeze({ max: 60 }),
  documentsMax: Object.freeze({ max: 60 }),
  relationshipsMax: Object.freeze({ max: 100 }),
  fieldsMax: Object.freeze({ max: 40 }),
  fileBytes: Object.freeze({ max: 25 * 1024 * 1024 }),
  // House › Garage › Van › Glovebox … : a thing's ancestors, at most.
  containDepth: Object.freeze({ max: 16 }),
});

/**
 * Starter types, seeded once per household (then household-editable data).
 * `identifier: true` marks serials/VIN/hull/registration: masked in the UI
 * until revealed, and NEVER sent to an AI provider. `kind` is the type's
 * role in the containment graph (THING_KINDS). A household seeded before a
 * starter type existed gets it from the gateway's starter-type upgrade (and
 * the backend's scripts/migrate-containment.js), keyed on `key`: `since`
 * is the STARTER_TYPES_VERSION that introduced it (absent = 1).
 */
const STARTER_TYPES_VERSION = 2;
const STARTER_TYPES = Object.freeze([
  { key: 'location', name: 'Location', icon: 'Place', kind: 'location', since: 2, fields: [] },
  { key: 'storage', name: 'Storage', icon: 'AllInbox', kind: 'container', since: 2, fields: [
    { key: 'brand', label: 'Brand', kind: 'text' }, { key: 'model', label: 'Model', kind: 'text' },
    { key: 'serial', label: 'Serial number', kind: 'text', identifier: true } ] },
  { key: 'boat', name: 'Boat', icon: 'DirectionsBoat', kind: 'container', fields: [
    { key: 'manufacturer', label: 'Manufacturer', kind: 'text' }, { key: 'model', label: 'Model', kind: 'text' },
    { key: 'year', label: 'Year', kind: 'number' }, { key: 'lengthFt', label: 'Length', kind: 'number', unit: 'ft' },
    { key: 'engine', label: 'Engine', kind: 'text' },
    { key: 'hullNumber', label: 'Hull number', kind: 'text', identifier: true },
    { key: 'registrationNumber', label: 'Registration number', kind: 'text', identifier: true } ] },
  { key: 'vehicle', name: 'Vehicle', icon: 'DirectionsCar', kind: 'container', fields: [
    { key: 'make', label: 'Make', kind: 'text' }, { key: 'model', label: 'Model', kind: 'text' },
    { key: 'year', label: 'Year', kind: 'number' }, { key: 'vin', label: 'VIN', kind: 'text', identifier: true },
    { key: 'plate', label: 'Plate', kind: 'text', identifier: true }, { key: 'mileage', label: 'Mileage', kind: 'number', unit: 'mi' } ] },
  { key: 'firearm', name: 'Firearm', icon: 'GpsFixed', kind: 'item', fields: [
    { key: 'manufacturer', label: 'Manufacturer', kind: 'text' }, { key: 'model', label: 'Model', kind: 'text' },
    { key: 'kind', label: 'Kind', kind: 'choice', choices: ['Handgun', 'Rifle', 'Shotgun', 'Other'] },
    { key: 'caliber', label: 'Caliber / gauge', kind: 'text' }, { key: 'action', label: 'Action', kind: 'text' },
    { key: 'serial', label: 'Serial number', kind: 'text', identifier: true } ] },
  { key: 'tool', name: 'Tool', icon: 'Handyman', kind: 'item', fields: [
    { key: 'brand', label: 'Brand', kind: 'text' }, { key: 'model', label: 'Model', kind: 'text' },
    { key: 'power', label: 'Power', kind: 'choice', choices: ['Corded', 'Battery', 'Manual', 'Gas'] },
    { key: 'serial', label: 'Serial number', kind: 'text', identifier: true } ] },
  { key: 'electronics', name: 'Electronics', icon: 'Devices', kind: 'item', fields: [
    { key: 'brand', label: 'Brand', kind: 'text' }, { key: 'model', label: 'Model', kind: 'text' },
    { key: 'serial', label: 'Serial number', kind: 'text', identifier: true } ] },
  { key: 'keyboard', name: 'Keyboard', icon: 'Keyboard', kind: 'item', fields: [
    { key: 'brand', label: 'Brand', kind: 'text' }, { key: 'model', label: 'Model', kind: 'text' },
    { key: 'layout', label: 'Layout', kind: 'text' }, { key: 'switches', label: 'Switches', kind: 'text' },
    { key: 'keycaps', label: 'Keycaps', kind: 'text' },
    { key: 'connection', label: 'Connection', kind: 'choice', choices: ['Wired', 'Wireless', 'Both'] } ] },
  { key: 'appliance', name: 'Appliance', icon: 'Kitchen', kind: 'item', fields: [
    { key: 'brand', label: 'Brand', kind: 'text' }, { key: 'model', label: 'Model', kind: 'text' },
    { key: 'serial', label: 'Serial number', kind: 'text', identifier: true } ] },
  { key: 'camera', name: 'Camera', icon: 'PhotoCamera', kind: 'item', fields: [
    { key: 'brand', label: 'Brand', kind: 'text' }, { key: 'model', label: 'Model', kind: 'text' },
    { key: 'serial', label: 'Serial number', kind: 'text', identifier: true } ] },
  { key: 'general', name: 'General', icon: 'Inventory2', kind: 'item', fields: [] },
]);

module.exports = {
  FIELD_KINDS, DATE_KINDS, PHOTO_ROLES, DOCUMENT_ROLES, RELATIONSHIP_KINDS, THING_KINDS, DEFAULT_THING_KIND, PARENT_KINDS, FILE_KINDS,
  PHOTO_MIMES, DOCUMENT_MIMES, MISSING_KEYS, STARTER_TYPES, STARTER_TYPES_VERSION, TRASH_DAYS, bounds,
};
