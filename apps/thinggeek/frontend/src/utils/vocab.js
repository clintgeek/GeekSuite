/**
 * ThingGeek's vocabulary and how each value reads.
 *
 * The lists mirror packages/schemas/thinggeek/constants.js (the frontend does
 * not depend on the CommonJS schemas package); the server's
 * `thingVocabulary` wins whenever it has answered (hooks/useThingMeta.js).
 * The WORDS are the frontend's: how a role, a kind or a gap reads to a person.
 */

export const DEFAULT_VOCAB = Object.freeze({
  fieldKinds: ['text', 'number', 'date', 'choice', 'money', 'url', 'boolean'],
  dateKinds: ['warranty', 'registration', 'insurance', 'license', 'maintenance', 'other'],
  photoRoles: ['overview', 'id-plate', 'receipt', 'detail', 'other'],
  documentRoles: ['receipt', 'manual', 'warranty', 'registration', 'insurance', 'other'],
  relationshipKinds: ['accessory-of'],
  thingKinds: ['location', 'container', 'item'],
  missingKeys: ['photo', 'id-plate', 'receipt', 'serial', 'value'],
  trashDays: 30,
});

export const FIELD_KIND_LABELS = {
  text: 'Text',
  number: 'Number',
  date: 'Date',
  choice: 'Choice',
  money: 'Money',
  url: 'Link',
  boolean: 'Yes / no',
};

export const DATE_KIND_LABELS = {
  warranty: 'Warranty',
  registration: 'Registration',
  insurance: 'Insurance',
  license: 'License',
  maintenance: 'Maintenance',
  other: 'Other',
};

export const PHOTO_ROLE_LABELS = {
  overview: 'Overview',
  'id-plate': 'ID plate',
  receipt: 'Receipt',
  detail: 'Detail',
  other: 'Other',
};

export const DOCUMENT_ROLE_LABELS = {
  receipt: 'Receipt',
  manual: 'Manual',
  warranty: 'Warranty',
  registration: 'Registration',
  insurance: 'Insurance',
  other: 'Other',
};

/** The filter/facet words for a gap ("what's missing"). */
export const MISSING_LABELS = {
  photo: 'No photo',
  'id-plate': 'No ID-plate photo',
  receipt: 'No receipt',
  serial: 'Serial missing',
  value: 'No value',
};

/** The same gaps, as the thing that IS on file (readiness meter). */
export const PRESENT_LABELS = {
  photo: 'Photo',
  'id-plate': 'ID plate',
  receipt: 'Receipt',
  serial: 'Serial',
  value: 'Value',
};

export const DUE_LABELS = {
  overdue: 'Overdue',
  '30d': 'Next 30 days',
  '90d': 'Next 90 days',
  year: 'This year',
};

export const dateKindLabel = (k) => DATE_KIND_LABELS[k] || k || 'Date';
export const photoRoleLabel = (r) => PHOTO_ROLE_LABELS[r] || r || 'Photo';
export const documentRoleLabel = (r) => DOCUMENT_ROLE_LABELS[r] || r || 'Document';
export const fieldKindLabel = (k) => FIELD_KIND_LABELS[k] || k;
