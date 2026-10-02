/**
 * The Attic's collections (DOCS/THINGGEEK_PLAN.md "The Attic"), one factory
 * per model, shared by the gateway and the backend so they cannot drift.
 * Every document leads with `householdId`; every index leads with it too.
 *
 * WHO WRITES WHAT (the key lives only in the thinggeek backend):
 *   attic_people, attic_doctypes      gateway
 *   attic_documents                   gateway: metadata, plain fields, files[]
 *                                     order/captions, links; backend: `secrets`
 *                                     (encrypted identifiers) and files[] pushes
 *   attic_files                       backend only (ciphertext on disk)
 *   attic_vault_credentials           backend only (PIN hash, passkeys)
 *   attic_vault_sessions              backend writes; gateway reads + touches
 *   attic_audit                       both (append-only)
 */
const { ATTIC_FIELD_KINDS, ATTIC_FILE_SIDES, ATTIC_AUDIT_ACTIONS, atticBounds } = require('./attic.js');

function need(mongoose, name) {
  if (!mongoose || !mongoose.Schema) throw new TypeError(`@geeksuite/schemas/thinggeek/atticModels ${name}: pass your own mongoose instance`);
  return mongoose.Schema;
}

// ── Person ──────────────────────────────────────────────────────────────────
function createAtticPersonSchema(mongoose) {
  need(mongoose, 'person');
  const schema = new mongoose.Schema({
    householdId: { type: String, required: true },
    name: { type: String, required: true, trim: true, maxlength: atticBounds.name.maxlength },
    sortName: { type: String, default: '' },
    relation: { type: String, maxlength: 60, default: '' },
    birthDate: { type: Date, default: null },            // calendar date (UTC midnight)
    photoFileId: { type: mongoose.Schema.Types.ObjectId, default: null }, // → attic_files (seam: no UI yet)
    createdBy: { type: String, default: null },
  }, { timestamps: true });
  schema.pre('validate', function personSort(next) {
    this.sortName = String(this.name || '').trim().toLowerCase();
    next();
  });
  schema.index({ householdId: 1, sortName: 1 });
  return schema;
}

// ── Document type ───────────────────────────────────────────────────────────
function createAtticDocumentTypeSchema(mongoose) {
  const Schema = need(mongoose, 'documentType');
  const schema = new mongoose.Schema({
    householdId: { type: String, required: true },
    key: { type: String, required: true, maxlength: 60 },
    name: { type: String, required: true, maxlength: 80 },
    icon: { type: String, maxlength: 60, default: 'FolderOpen' },
    issuedLabel: { type: String, maxlength: 60, default: null },  // null: no issued date
    expiryLabel: { type: String, maxlength: 60, default: null },  // null: no expiry date
    expiryWarnDays: { type: Number, min: atticBounds.warnDays.min, max: atticBounds.warnDays.max, default: null },
    fields: {
      type: [new Schema({
        key: { type: String, required: true, maxlength: 60 },
        label: { type: String, required: true, maxlength: 80 },
        kind: { type: String, enum: ATTIC_FIELD_KINDS, required: true },
        choices: { type: [String], default: [] },
        identifier: { type: Boolean, default: false }, // encrypted, masked, reveal audit-logged
        strict: { type: Boolean, default: false },     // masked hardest (SSN)
        required: { type: Boolean, default: false },
      }, { _id: false })],
      default: [],
    },
    builtIn: { type: Boolean, default: false },
  }, { timestamps: true });
  schema.index({ householdId: 1, key: 1 }, { unique: true });
  return schema;
}

// ── Document ────────────────────────────────────────────────────────────────
/**
 * `fields` holds the type's NON-identifier values in plain text (country,
 * carrier…). Identifier values live only in `secrets`, AES-256-GCM sealed by
 * the backend: { [fieldKey]: { v: keyVersion, iv, tag, ct } } (base64), with
 * additional data binding each one to its household, document and key.
 */
function createAtticDocumentSchema(mongoose) {
  const Schema = need(mongoose, 'document');
  const schema = new mongoose.Schema({
    householdId: { type: String, required: true },
    typeId: { type: Schema.Types.ObjectId, required: true },
    personIds: { type: [Schema.Types.ObjectId], default: [] },
    title: { type: String, trim: true, maxlength: atticBounds.title.maxlength, default: '' },
    fields: { type: Schema.Types.Mixed, default: {} },
    secrets: { type: Schema.Types.Mixed, default: {} },
    issued: { type: Date, default: null },   // calendar date
    expires: { type: Date, default: null },  // calendar date — drives Needs attention
    files: {
      type: [new Schema({
        fileId: { type: Schema.Types.ObjectId, required: true },
        side: { type: String, enum: ATTIC_FILE_SIDES, default: 'page' },
        caption: { type: String, maxlength: 200, default: '' },
      }, { _id: true })],
      default: [],
    },
    links: {
      type: [new Schema({ thingId: { type: Schema.Types.ObjectId, required: true } }, { _id: false })],
      default: [],
    },
    notes: { type: String, maxlength: atticBounds.notes.maxlength, default: '' },
    createdBy: { type: String, default: null },
    // A deleted document is gone from every view at once; the backend's
    // purge removes it and its encrypted files shortly after.
    deletedAt: { type: Date, default: null },
  }, { timestamps: true, minimize: false });
  schema.index({ householdId: 1, deletedAt: 1, expires: 1 });
  schema.index({ householdId: 1, personIds: 1 });
  schema.index({ householdId: 1, typeId: 1 });
  schema.index({ householdId: 1, 'links.thingId': 1 });
  return schema;
}

// ── File (bytes on disk are ciphertext; see the backend's lib/atticCrypto.js) ──
function createAtticFileSchema(mongoose) {
  const Schema = need(mongoose, 'file');
  const schema = new mongoose.Schema({
    householdId: { type: String, required: true },
    documentId: { type: Schema.Types.ObjectId, default: null }, // the one document it belongs to
    mime: { type: String, required: true },
    size: { type: Number, required: true },           // plaintext bytes
    path: { type: String, required: true },           // relative to FILES_PATH; ciphertext
    keyVersion: { type: Number, required: true },
    width: { type: Number, default: null },
    height: { type: Number, default: null },
    uploadedBy: { type: String, default: null },
    // No sha256 and no original filename: a plaintext digest is an oracle
    // ("is this the passport scan I have?") and a filename is content.
  }, { timestamps: true });
  schema.index({ householdId: 1, documentId: 1 });
  return schema;
}

// ── Unlock credentials (one row per user) ───────────────────────────────────
function createVaultCredentialSchema(mongoose) {
  const Schema = need(mongoose, 'vaultCredential');
  const schema = new mongoose.Schema({
    householdId: { type: String, required: true },
    userId: { type: String, required: true, unique: true },
    // bcrypt over an HMAC of the PIN keyed with a pepper derived from the
    // vault key — a database dump alone cannot brute-force a 6-digit PIN.
    pinHash: { type: String, default: null },
    pinPepperVersion: { type: Number, default: null },
    pinSetAt: { type: Date, default: null },
    pinFailures: { type: Number, default: 0 },          // consecutive
    pinNextAttemptAt: { type: Date, default: null },    // backoff gate (atomic)
    passkeys: {
      type: [new Schema({
        credentialId: { type: String, required: true },  // base64url
        publicKey: { type: String, required: true },     // base64url COSE key
        counter: { type: Number, default: 0 },
        transports: { type: [String], default: [] },
        deviceType: { type: String, default: null },
        backedUp: { type: Boolean, default: false },
        label: { type: String, maxlength: 60, default: '' },
        createdAt: { type: Date, default: null },
        lastUsedAt: { type: Date, default: null },
      }, { _id: true })],
      default: [],
    },
    // The one pending WebAuthn ceremony (register or unlock), short-lived.
    challenge: {
      value: { type: String, default: null },
      purpose: { type: String, default: null },
      expiresAt: { type: Date, default: null },
    },
  }, { timestamps: true });
  schema.index({ householdId: 1, 'passkeys.credentialId': 1 });
  return schema;
}

// ── Vault sessions ──────────────────────────────────────────────────────────
function createVaultSessionSchema(mongoose) {
  need(mongoose, 'vaultSession');
  const schema = new mongoose.Schema({
    tokenHash: { type: String, required: true, unique: true }, // sha256(token); the token itself is never stored
    householdId: { type: String, required: true },
    userId: { type: String, required: true },
    method: { type: String, enum: ['passkey', 'pin', 'setup'], required: true },
    lastSeenAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },       // absolute: unlock + VAULT_MAX_MS
  }, { timestamps: true });
  schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // Mongo sweeps dead rows
  schema.index({ userId: 1 });
  return schema;
}

// ── Audit log (append-only; no values, ever) ────────────────────────────────
function createAtticAuditSchema(mongoose) {
  const Schema = need(mongoose, 'audit');
  const schema = new mongoose.Schema({
    householdId: { type: String, required: true },
    userId: { type: String, required: true },
    actorName: { type: String, maxlength: 120, default: '' },
    action: { type: String, enum: ATTIC_AUDIT_ACTIONS, required: true },
    documentId: { type: Schema.Types.ObjectId, default: null },
    fileId: { type: Schema.Types.ObjectId, default: null },
    field: { type: String, maxlength: 60, default: null },  // a field KEY, never its value
    method: { type: String, maxlength: 20, default: null },  // passkey | pin | setup
    at: { type: Date, required: true },
  }, { timestamps: false });
  schema.index({ householdId: 1, at: -1 });
  schema.index({ householdId: 1, documentId: 1, at: -1 });
  return schema;
}

/** Collection names, once. */
const ATTIC_COLLECTIONS = Object.freeze({
  people: 'attic_people',
  documentTypes: 'attic_doctypes',
  documents: 'attic_documents',
  files: 'attic_files',
  credentials: 'attic_vault_credentials',
  sessions: 'attic_vault_sessions',
  audit: 'attic_audit',
});

module.exports = {
  ATTIC_COLLECTIONS,
  createAtticPersonSchema,
  createAtticDocumentTypeSchema,
  createAtticDocumentSchema,
  createAtticFileSchema,
  createVaultCredentialSchema,
  createVaultSessionSchema,
  createAtticAuditSchema,
};
