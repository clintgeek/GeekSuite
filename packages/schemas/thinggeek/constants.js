/**
 * thinggeek vocabulary shared by every writer. DOCS/THINGGEEK_PLAN.md is the
 * design record. Add a value here, never inline.
 */
const FIELD_KINDS = Object.freeze(['text', 'number', 'date', 'choice', 'money', 'url', 'boolean']);
const DATE_KINDS = Object.freeze(['warranty', 'registration', 'insurance', 'license', 'maintenance', 'other']);
const PHOTO_ROLES = Object.freeze(['overview', 'id-plate', 'receipt', 'detail', 'other']);
const DOCUMENT_ROLES = Object.freeze(['receipt', 'manual', 'warranty', 'registration', 'insurance', 'other']);
// Stored one way; the inverse ("part of Wendy") is derived at read time.
const RELATIONSHIP_KINDS = Object.freeze(['equipped-with', 'part-of', 'accessory-of', 'stored-with']);
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
  placeDepth: Object.freeze({ max: 8 }),
});

/**
 * Starter types, seeded once per household (then household-editable data).
 * `identifier: true` marks serials/VIN/hull/registration: masked in the UI
 * until revealed, and NEVER sent to an AI provider.
 */
const STARTER_TYPES = Object.freeze([
  { key: 'boat', name: 'Boat', icon: 'DirectionsBoat', fields: [
    { key: 'manufacturer', label: 'Manufacturer', kind: 'text' }, { key: 'model', label: 'Model', kind: 'text' },
    { key: 'year', label: 'Year', kind: 'number' }, { key: 'lengthFt', label: 'Length', kind: 'number', unit: 'ft' },
    { key: 'engine', label: 'Engine', kind: 'text' },
    { key: 'hullNumber', label: 'Hull number', kind: 'text', identifier: true },
    { key: 'registrationNumber', label: 'Registration number', kind: 'text', identifier: true } ] },
  { key: 'vehicle', name: 'Vehicle', icon: 'DirectionsCar', fields: [
    { key: 'make', label: 'Make', kind: 'text' }, { key: 'model', label: 'Model', kind: 'text' },
    { key: 'year', label: 'Year', kind: 'number' }, { key: 'vin', label: 'VIN', kind: 'text', identifier: true },
    { key: 'plate', label: 'Plate', kind: 'text', identifier: true }, { key: 'mileage', label: 'Mileage', kind: 'number', unit: 'mi' } ] },
  { key: 'firearm', name: 'Firearm', icon: 'GpsFixed', fields: [
    { key: 'manufacturer', label: 'Manufacturer', kind: 'text' }, { key: 'model', label: 'Model', kind: 'text' },
    { key: 'kind', label: 'Kind', kind: 'choice', choices: ['Handgun', 'Rifle', 'Shotgun', 'Other'] },
    { key: 'caliber', label: 'Caliber / gauge', kind: 'text' }, { key: 'action', label: 'Action', kind: 'text' },
    { key: 'serial', label: 'Serial number', kind: 'text', identifier: true } ] },
  { key: 'tool', name: 'Tool', icon: 'Handyman', fields: [
    { key: 'brand', label: 'Brand', kind: 'text' }, { key: 'model', label: 'Model', kind: 'text' },
    { key: 'power', label: 'Power', kind: 'choice', choices: ['Corded', 'Battery', 'Manual', 'Gas'] },
    { key: 'serial', label: 'Serial number', kind: 'text', identifier: true } ] },
  { key: 'electronics', name: 'Electronics', icon: 'Devices', fields: [
    { key: 'brand', label: 'Brand', kind: 'text' }, { key: 'model', label: 'Model', kind: 'text' },
    { key: 'serial', label: 'Serial number', kind: 'text', identifier: true } ] },
  { key: 'keyboard', name: 'Keyboard', icon: 'Keyboard', fields: [
    { key: 'brand', label: 'Brand', kind: 'text' }, { key: 'model', label: 'Model', kind: 'text' },
    { key: 'layout', label: 'Layout', kind: 'text' }, { key: 'switches', label: 'Switches', kind: 'text' },
    { key: 'keycaps', label: 'Keycaps', kind: 'text' },
    { key: 'connection', label: 'Connection', kind: 'choice', choices: ['Wired', 'Wireless', 'Both'] } ] },
  { key: 'appliance', name: 'Appliance', icon: 'Kitchen', fields: [
    { key: 'brand', label: 'Brand', kind: 'text' }, { key: 'model', label: 'Model', kind: 'text' },
    { key: 'serial', label: 'Serial number', kind: 'text', identifier: true } ] },
  { key: 'camera', name: 'Camera', icon: 'PhotoCamera', fields: [
    { key: 'brand', label: 'Brand', kind: 'text' }, { key: 'model', label: 'Model', kind: 'text' },
    { key: 'serial', label: 'Serial number', kind: 'text', identifier: true } ] },
  { key: 'general', name: 'General', icon: 'Inventory2', fields: [] },
]);

module.exports = {
  FIELD_KINDS, DATE_KINDS, PHOTO_ROLES, DOCUMENT_ROLES, RELATIONSHIP_KINDS, FILE_KINDS,
  PHOTO_MIMES, DOCUMENT_MIMES, MISSING_KEYS, STARTER_TYPES, TRASH_DAYS, bounds,
};
