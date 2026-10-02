/**
 * The Attic — the household's locked unit for family documents
 * (DOCS/THINGGEEK_PLAN.md "The Attic"). Vocabulary, starter document types,
 * expiry rules and the vault-session lifetimes, shared by every writer: the
 * basegeek gateway (people, types, document metadata — it holds NO key) and
 * the thinggeek backend (the key holder: identifier values, files, unlock).
 *
 * Privacy rule (the plan's "Decisions"): identifier values, document images
 * and document contents NEVER go to an AI provider, a log, or a cache.
 */

/** Which face of a card or which page a stored image is. */
const ATTIC_FILE_SIDES = Object.freeze(['front', 'back', 'page']);
/** Field kinds a document type may declare (no money/boolean: these are papers, not things). */
const ATTIC_FIELD_KINDS = Object.freeze(['text', 'number', 'date', 'choice', 'url']);
/** Suggestions only — a person's relation is free text. */
const PERSON_RELATIONS = Object.freeze(['Self', 'Spouse', 'Partner', 'Child', 'Parent', 'Pet', 'Other']);

/**
 * Audit actions. Every entry names WHO, WHEN, WHAT (document / person / file
 * id, and a field KEY) — never a value.
 */
const ATTIC_AUDIT_ACTIONS = Object.freeze([
  'unlock',          // a vault session opened (method: passkey | pin | setup)
  'unlock-failed',   // a wrong PIN or a failed passkey assertion
  'lock',            // an explicit Lock
  'view',            // a document's page was opened
  'reveal',          // one identifier value was decrypted for display
  'file-view',       // an image / PDF was decrypted for display
  'download',        // an image / PDF was decrypted as a download
  'upload',          // a file was added
  'identifiers-set', // identifier values were written (keys only)
  'created',         // a document was added
  'updated',         // a document's metadata changed
  'deleted',         // a document was deleted
  'pin-set',         // a PIN was set or changed
  'passkey-added',   // a passkey was registered
  'passkey-removed', // a passkey was removed
]);

const atticBounds = Object.freeze({
  name: Object.freeze({ maxlength: 120 }),
  title: Object.freeze({ maxlength: 200 }),
  notes: Object.freeze({ maxlength: 5000 }),
  fieldValue: Object.freeze({ maxlength: 300 }),
  identifierValue: Object.freeze({ maxlength: 120 }),
  peoplePerDocument: Object.freeze({ max: 12 }),
  filesPerDocument: Object.freeze({ max: 12 }),
  linksPerDocument: Object.freeze({ max: 40 }),
  fieldsMax: Object.freeze({ max: 20 }),
  warnDays: Object.freeze({ min: 0, max: 730 }),
  passkeysPerUser: Object.freeze({ max: 10 }),
});

/**
 * Vault sessions. An unlock opens one; it lives at most MAX_MS from the
 * unlock and dies after IDLE_MS without an Attic request. Server-side, in
 * Mongo (`vaultsessions`), so Lock is real revocation and the gateway can
 * check a session without holding any secret.
 */
const VAULT_IDLE_MS = 10 * 60 * 1000;
const VAULT_MAX_MS = 60 * 60 * 1000;
/** Host-only, HttpOnly, SameSite=Strict — set by the backend on thinggeek's own origin. */
const VAULT_COOKIE = 'thinggeek_vault';

/** PINs: digits only. Long enough to matter, short enough to type on a phone. */
const PIN_MIN = 6;
const PIN_MAX = 12;
/**
 * Wrong-PIN backoff: the first PIN_FREE_FAILURES consecutive failures cost
 * nothing extra; every one after that locks the PIN for 30 s × 2^(n−free−1),
 * capped at an hour. A success (PIN or passkey) resets the count.
 */
const PIN_FREE_FAILURES = 4;
const PIN_LOCK_BASE_MS = 30 * 1000;
const PIN_LOCK_MAX_MS = 60 * 60 * 1000;

function pinLockoutMs(consecutiveFailures) {
  const over = Number(consecutiveFailures) - PIN_FREE_FAILURES;
  if (!(over > 0)) return 0;
  return Math.min(PIN_LOCK_MAX_MS, PIN_LOCK_BASE_MS * 2 ** (over - 1));
}

/**
 * Starter document types (household-editable afterwards). ★ = identifier:
 * encrypted at rest, masked until revealed, every reveal audit-logged.
 * `strict` (the Social Security number) is masked hardest: never a partial
 * digit, and a reveal hides itself again after a few seconds.
 *
 * `expiryLabel` names the date that drives "Needs attention" (null: this
 * type has none) and `expiryWarnDays` how early it warns:
 *   passport 9 months (many countries refuse entry with < 6 months left),
 *   driver's license 60 days, insurance renewal 30, vehicle registration 30,
 *   pet rabies certificate 30, others configurable per type.
 */
const ATTIC_STARTER_TYPES_VERSION = 1;
const F = (key, label, kind = 'text', extra = {}) => ({ key, label, kind, ...extra });
const ATTIC_STARTER_TYPES = Object.freeze([
  { key: 'passport', name: 'Passport', icon: 'Flight', issuedLabel: 'Issued', expiryLabel: 'Expires', expiryWarnDays: 270,
    fields: [F('number', 'Passport number', 'text', { identifier: true }), F('country', 'Country')] },
  { key: 'drivers-license', name: "Driver's license", icon: 'Badge', issuedLabel: 'Issued', expiryLabel: 'Expires', expiryWarnDays: 60,
    fields: [F('number', 'License number', 'text', { identifier: true }), F('class', 'Class'), F('state', 'State')] },
  { key: 'birth-certificate', name: 'Birth certificate', icon: 'ChildFriendly', issuedLabel: 'Issued', expiryLabel: null, expiryWarnDays: null,
    fields: [F('number', 'Certificate number', 'text', { identifier: true }), F('place', 'Place of birth')] },
  { key: 'social-security', name: 'Social Security card', icon: 'Shield', issuedLabel: null, expiryLabel: null, expiryWarnDays: null,
    fields: [F('number', 'Social Security number', 'text', { identifier: true, strict: true })] },
  { key: 'vaccination', name: 'Vaccination record', icon: 'Vaccines', issuedLabel: 'Last updated', expiryLabel: null, expiryWarnDays: null,
    fields: [F('provider', 'Provider')] },
  { key: 'medical-card', name: 'Medical / insurance card', icon: 'LocalHospital', issuedLabel: null, expiryLabel: 'Expires', expiryWarnDays: 30,
    fields: [F('memberId', 'Member ID', 'text', { identifier: true }), F('group', 'Group number', 'text', { identifier: true }), F('carrier', 'Carrier'), F('phone', 'Member services phone')] },
  { key: 'insurance-policy', name: 'Insurance policy', icon: 'Policy', issuedLabel: 'Started', expiryLabel: 'Renews', expiryWarnDays: 30,
    fields: [F('policyNumber', 'Policy number', 'text', { identifier: true }), F('carrier', 'Carrier'), F('agent', 'Agent'), F('phone', 'Agent phone')] },
  { key: 'vehicle-registration', name: 'Vehicle registration', icon: 'DirectionsCar', issuedLabel: 'Issued', expiryLabel: 'Expires', expiryWarnDays: 30,
    fields: [F('registrationNumber', 'Registration number', 'text', { identifier: true }), F('plate', 'Plate', 'text', { identifier: true }), F('state', 'State')] },
  { key: 'vehicle-title', name: 'Vehicle title', icon: 'Description', issuedLabel: 'Issued', expiryLabel: null, expiryWarnDays: null,
    fields: [F('titleNumber', 'Title number', 'text', { identifier: true }), F('vin', 'VIN', 'text', { identifier: true }), F('state', 'State')] },
  { key: 'property-deed', name: 'Property deed', icon: 'Home', issuedLabel: 'Recorded', expiryLabel: null, expiryWarnDays: null,
    fields: [F('address', 'Property address'), F('parcel', 'Parcel number', 'text', { identifier: true })] },
  { key: 'will', name: 'Will', icon: 'HistoryEdu', issuedLabel: 'Signed', expiryLabel: null, expiryWarnDays: null,
    fields: [F('executor', 'Executor'), F('original', 'Where the original is')] },
  { key: 'power-of-attorney', name: 'Power of attorney', icon: 'Gavel', issuedLabel: 'Signed', expiryLabel: null, expiryWarnDays: null,
    fields: [F('agent', 'Agent'), F('scope', 'Scope', 'choice', { choices: ['Financial', 'Medical', 'General', 'Limited'] })] },
  { key: 'tax-return', name: 'Tax return', icon: 'ReceiptLong', issuedLabel: 'Filed', expiryLabel: null, expiryWarnDays: null,
    fields: [F('year', 'Tax year', 'number'), F('preparer', 'Preparer')] },
  { key: 'pet-record', name: 'Pet record', icon: 'Pets', issuedLabel: null, expiryLabel: 'Rabies vaccine expires', expiryWarnDays: 30,
    fields: [F('petName', 'Pet name'), F('vet', 'Vet'), F('tag', 'Rabies tag number')] },
  { key: 'other', name: 'Other', icon: 'FolderOpen', issuedLabel: 'Issued', expiryLabel: 'Expires', expiryWarnDays: 30, fields: [] },
]);

/** One starter type as an AtticDocumentType document for `householdId`. */
function atticStarterTypeDoc(t, householdId) {
  return {
    householdId,
    key: t.key,
    name: t.name,
    icon: t.icon,
    issuedLabel: t.issuedLabel ?? null,
    expiryLabel: t.expiryLabel ?? null,
    expiryWarnDays: t.expiryWarnDays ?? null,
    builtIn: true,
    fields: t.fields.map((f) => ({
      key: f.key,
      label: f.label,
      kind: f.kind,
      choices: f.choices ?? [],
      identifier: Boolean(f.identifier),
      strict: Boolean(f.strict),
      required: Boolean(f.required),
    })),
  };
}

const DAY_MS = 86400000;

/** UTC calendar midnight of `d` (a Date) — the gateway's "today" convention. */
function utcDay(d) {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/**
 * Where a document stands on its expiry date, given its type's warning
 * window. `expires` and `today` are Dates (calendar dates at UTC midnight).
 *   expired  — the date has passed
 *   warning  — inside the type's warning window (≤ warnDays away)
 *   ok       — further out (or the type has no warning window)
 *   none     — no date
 */
function atticExpiryStatus(expires, warnDays, today = new Date()) {
  if (!expires) return { status: 'none', daysUntil: null, warnsOn: null };
  const exp = new Date(expires);
  if (Number.isNaN(exp.getTime())) return { status: 'none', daysUntil: null, warnsOn: null };
  const daysUntil = Math.round((utcDay(exp) - utcDay(today)) / DAY_MS);
  const window = Number.isFinite(warnDays) && warnDays !== null ? Number(warnDays) : null;
  const warnsOn = window === null ? null : new Date(utcDay(exp) - window * DAY_MS);
  let status = 'ok';
  if (daysUntil < 0) status = 'expired';
  else if (window !== null && daysUntil <= window) status = 'warning';
  return { status, daysUntil, warnsOn };
}

module.exports = {
  ATTIC_FILE_SIDES,
  ATTIC_FIELD_KINDS,
  PERSON_RELATIONS,
  ATTIC_AUDIT_ACTIONS,
  atticBounds,
  VAULT_IDLE_MS,
  VAULT_MAX_MS,
  VAULT_COOKIE,
  PIN_MIN,
  PIN_MAX,
  PIN_FREE_FAILURES,
  PIN_LOCK_BASE_MS,
  PIN_LOCK_MAX_MS,
  pinLockoutMs,
  ATTIC_STARTER_TYPES_VERSION,
  ATTIC_STARTER_TYPES,
  atticStarterTypeDoc,
  atticExpiryStatus,
};
