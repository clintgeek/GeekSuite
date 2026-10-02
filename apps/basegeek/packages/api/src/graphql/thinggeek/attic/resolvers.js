import mongoose from 'mongoose';
import { GraphQLError } from 'graphql';
import householdModule from '@geeksuite/schemas/thinggeek/household';
import atticModule from '@geeksuite/schemas/thinggeek/attic';
import vaultSessionModule from '@geeksuite/schemas/thinggeek/vaultSession';
import { Thing } from '../models/thing.js';
import { AtticPerson, AtticDocumentType, AtticDocument, AtticFile, VaultSession, AtticAudit } from '../models/attic.js';
import {
  validateInput,
  validateDocumentFields,
  inputError,
  createPersonArgsSchema,
  updatePersonArgsSchema,
  createTypeArgsSchema,
  updateTypeArgsSchema,
  createDocumentArgsSchema,
  updateDocumentArgsSchema,
  idArgsSchema,
  documentsArgsSchema,
  accessLogArgsSchema,
} from './validation.js';

/**
 * The Attic, gateway side (DOCS/THINGGEEK_PLAN.md "The Attic").
 *
 * ## The three gates, in order, in every resolver
 *   1. requireUser — signed in (UNAUTHORIZED);
 *   2. the MEMBER GATE — resolveHouseholdId (NOT_A_MEMBER for everyone but
 *      the household's members: the kids' accounts see nothing);
 *   3. the VAULT — a live, unexpired vault session belonging to THIS user
 *      (VAULT_LOCKED), except for the two locked-visible answers
 *      (atticExpiring / ThingAttention.attic, and Thing.attic's count).
 *
 * ## No key here
 * This gateway never holds THINGGEEK_VAULT_KEY. It stores and returns plain
 * metadata (people, types, titles, dates, plain fields, notes, links); the
 * identifier values and file bytes are sealed and opened by the thinggeek
 * backend alone. `secrets` is read here only for WHICH keys hold a value.
 *
 * ## Audit
 * Opening a document (atticDocument) and every write are appended to
 * attic_audit — who, when, which document; never a value. A view is logged
 * at most once per user and document per VIEW_AUDIT_WINDOW_MS, so Apollo's
 * refetches don't bury the log.
 */
const { resolveHouseholdId: resolveThingHousehold } = householdModule;
const { atticStarterTypeDoc, ATTIC_STARTER_TYPES, atticExpiryStatus } = atticModule;
const { readVaultToken, findVaultSession } = vaultSessionModule;

const VIEW_AUDIT_WINDOW_MS = 2 * 60 * 1000;

const validateCreatePerson = validateInput(createPersonArgsSchema);
const validateUpdatePerson = validateInput(updatePersonArgsSchema);
const validateCreateType = validateInput(createTypeArgsSchema);
const validateUpdateType = validateInput(updateTypeArgsSchema);
const validateCreateDocument = validateInput(createDocumentArgsSchema);
const validateUpdateDocument = validateInput(updateDocumentArgsSchema);
const validateId = validateInput(idArgsSchema);
const validateDocumentsArgs = validateInput(documentsArgsSchema);
const validateAccessLogArgs = validateInput(accessLogArgsSchema);

// ── Errors + gates ───────────────────────────────────────────────────────────

function codedError(message, code) {
  const err = new GraphQLError(message, { extensions: { code } });
  err.code = code;
  return err;
}

const notFound = (what = 'Document') => codedError(`${what} not found`, 'NOT_FOUND');

function requireUser(user) {
  if (!user?.id) throw codedError('Unauthorized', 'UNAUTHORIZED');
  return String(user.id);
}

/** Signed in + the member gate → { userId, householdId }. */
function gate(context) {
  const userId = requireUser(context?.user);
  try {
    return { userId, householdId: resolveThingHousehold(context.user) };
  } catch (err) {
    throw codedError(err.message, err.code || 'UNAUTHORIZED');
  }
}

const requestState = new WeakMap();
function cached(context, key, fn) {
  const holder = context && typeof context === 'object' ? context : {};
  let state = requestState.get(holder);
  if (!state) {
    state = new Map();
    requestState.set(holder, state);
  }
  if (!state.has(key)) state.set(key, fn());
  return state.get(key);
}
function resetRequestCache(context) {
  if (context && typeof context === 'object') requestState.delete(context);
}

/** This request's vault session (or null) — one atomic check-and-touch per request. */
function vaultOf(context, { userId, householdId }, { touch = true } = {}) {
  return cached(context, touch ? 'vault' : 'vault:peek', () =>
    findVaultSession(VaultSession, { token: readVaultToken(context?.cookies), userId, householdId, now: new Date(), touch })
  );
}

/** The three gates. Throws VAULT_LOCKED without a live session for THIS user. */
async function requireVault(context) {
  const scope = gate(context);
  const session = await vaultOf(context, scope);
  if (!session) throw codedError('The Attic is locked.', 'VAULT_LOCKED');
  return { ...scope, session };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const validObjectId = (id) => typeof id === 'string' && /^[0-9a-fA-F]{24}$/.test(id);
const oid = (id) => new mongoose.Types.ObjectId(String(id));
const toObj = (doc) => (doc && typeof doc.toObject === 'function' ? doc.toObject() : doc);
const jsonValue = (v) => (v instanceof Date ? v.toISOString() : v ?? null);

function actorNameOf(user) {
  return String(user?.username || user?.name || 'A member').slice(0, 120);
}

async function audit(context, scope, entry) {
  await AtticAudit.create({
    householdId: scope.householdId,
    userId: scope.userId,
    actorName: actorNameOf(context?.user),
    at: new Date(),
    ...entry,
  });
}

function slugify(name) {
  const s = String(name || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return s || 'type';
}

/** Seed the starter document types once per household (on its first type list). */
async function ensureStarterTypes(householdId) {
  if (await AtticDocumentType.exists({ householdId })) return;
  try {
    await AtticDocumentType.insertMany(ATTIC_STARTER_TYPES.map((t) => atticStarterTypeDoc(t, householdId)), { ordered: false });
  } catch (err) {
    // A racing first call seeded them too: the unique {householdId,key} index keeps one of each.
    if (err?.code !== 11000 && !err?.writeErrors) throw err;
  }
}

function typesById(context, householdId) {
  return cached(context, `types:${householdId}`, async () => {
    const rows = await AtticDocumentType.find({ householdId }).lean();
    return new Map(rows.map((t) => [String(t._id), t]));
  });
}

function peopleById(context, householdId) {
  return cached(context, `people:${householdId}`, async () => {
    const rows = await AtticPerson.find({ householdId }).sort({ sortName: 1, _id: 1 }).lean();
    return new Map(rows.map((p) => [String(p._id), p]));
  });
}

/** Every live document's routing fields, for counts and thing links. */
function liveDocIndex(context, householdId) {
  return cached(context, `docIndex:${householdId}`, () =>
    AtticDocument.find({ householdId, deletedAt: null }, { typeId: 1, personIds: 1, 'links.thingId': 1 }).lean().exec()
  );
}

function filesById(context, householdId, ids) {
  const key = `files:${householdId}:${ids.join(',')}`;
  return cached(context, key, async () => {
    const valid = ids.filter(validObjectId).map(oid);
    const rows = valid.length ? await AtticFile.find({ _id: { $in: valid }, householdId }).lean() : [];
    return new Map(rows.map((f) => [String(f._id), f]));
  });
}

async function requireLiveDocument(householdId, id) {
  if (!validObjectId(id)) throw notFound();
  const doc = await AtticDocument.findOne({ _id: id, householdId, deletedAt: null }).lean();
  if (!doc) throw notFound();
  return doc;
}

/** personIds from input → household people ids (BAD_USER_INPUT for a stranger's). */
async function resolvePeople(householdId, ids) {
  const unique = [...new Set(ids ?? [])];
  if (!unique.length) return [];
  if (!unique.every(validObjectId)) throw inputError('input.personIds', 'person not found');
  const found = await AtticPerson.find({ _id: { $in: unique.map(oid) }, householdId }, { _id: 1 }).lean();
  if (found.length !== unique.length) throw inputError('input.personIds', 'person not found');
  return unique.map(oid);
}

/** links from input → live household thing ids. */
async function resolveLinks(householdId, ids) {
  const unique = [...new Set(ids ?? [])];
  if (!unique.length) return [];
  if (!unique.every(validObjectId)) throw inputError('input.links', 'thing not found');
  const found = await Thing.find({ _id: { $in: unique.map(oid) }, householdId, deletedAt: null }, { _id: 1 }).lean();
  if (found.length !== unique.length) throw inputError('input.links', 'thing not found');
  return unique.map((id) => ({ thingId: oid(id) }));
}

async function resolveType(householdId, typeId) {
  const type = validObjectId(typeId) ? await AtticDocumentType.findOne({ _id: typeId, householdId }).lean() : null;
  if (!type) throw inputError('input.typeId', 'document type not found');
  return type;
}

/** files input → the stored entries, reordered/edited; only EXISTING entries (uploads are the backend's). */
function reorderFiles(existing, input) {
  const byId = new Map((existing ?? []).map((f) => [String(f._id), f]));
  const seen = new Set();
  return input.map((f, i) => {
    const cur = byId.get(String(f.id));
    if (!cur || seen.has(String(f.id))) throw inputError(`input.files.${i}.id`, 'file not found on this document');
    seen.add(String(f.id));
    return {
      _id: cur._id,
      fileId: cur.fileId,
      side: f.side ?? cur.side ?? 'page',
      caption: f.caption === undefined || f.caption === null ? cur.caption ?? '' : f.caption,
    };
  });
}

function typeFieldsValue(fields, previous) {
  const before = new Map((previous ?? []).map((f) => [f.key, f]));
  return (fields ?? []).map((f, i) => {
    const old = before.get(f.key);
    // Flipping an existing field between plain and identifier would strand
    // its values on the wrong side of the seal: refuse; remove and re-add.
    if (old && Boolean(old.identifier) !== Boolean(f.identifier)) {
      throw inputError(`input.fields.${i}.identifier`, 'an existing field cannot change between plain and identifier — add a new field instead');
    }
    return {
      key: f.key,
      label: f.label,
      kind: f.kind,
      choices: f.kind === 'choice' ? f.choices ?? [] : [],
      identifier: Boolean(f.identifier),
      strict: Boolean(f.identifier && f.strict),
      required: Boolean(f.required),
    };
  });
}

function defaultTitle(doc, type, people) {
  const names = (doc.personIds ?? []).map((id) => people.get(String(id))?.name).filter(Boolean);
  return [type?.name || 'Document', names.join(' & ')].filter(Boolean).join(' · ');
}

/** The locked-visible expiry list: person names + type + date, inside each type's warning window. */
async function expiringFor(context, householdId) {
  return cached(context, `expiring:${householdId}`, async () => {
    const [docs, types, people] = await Promise.all([
      AtticDocument.find({ householdId, deletedAt: null, expires: { $ne: null } }, { typeId: 1, personIds: 1, expires: 1 }).lean(),
      typesById(context, householdId),
      peopleById(context, householdId),
    ]);
    const today = new Date();
    const out = [];
    for (const d of docs) {
      const type = types.get(String(d.typeId));
      if (!type || !type.expiryLabel || type.expiryWarnDays === null || type.expiryWarnDays === undefined) continue;
      const st = atticExpiryStatus(d.expires, type.expiryWarnDays, today);
      if (st.status !== 'warning' && st.status !== 'expired') continue;
      out.push({
        documentId: String(d._id),
        typeName: type.name,
        expiryLabel: type.expiryLabel,
        people: (d.personIds ?? []).map((id) => people.get(String(id))?.name).filter(Boolean),
        expires: d.expires,
        daysUntil: st.daysUntil,
        status: st.status,
      });
    }
    return out.sort((a, b) => a.daysUntil - b.daysUntil || a.typeName.localeCompare(b.typeName));
  });
}

// ── Resolvers ────────────────────────────────────────────────────────────────

export const resolvers = {
  AtticDocumentType: {
    id: (t) => String(t._id),
    icon: (t) => t.icon || 'FolderOpen',
    issuedLabel: (t) => t.issuedLabel ?? null,
    expiryLabel: (t) => t.expiryLabel ?? null,
    expiryWarnDays: (t) => (t.expiryLabel ? t.expiryWarnDays ?? null : null),
    fields: (t) =>
      (t.fields ?? []).map((f) => ({
        key: f.key,
        label: f.label,
        kind: f.kind,
        choices: f.choices ?? [],
        identifier: Boolean(f.identifier),
        strict: Boolean(f.strict),
        required: Boolean(f.required),
      })),
    builtIn: (t) => Boolean(t.builtIn),
    documentCount: async (t, _a, context) => {
      const { householdId } = await requireVault(context);
      return (await liveDocIndex(context, householdId)).filter((d) => String(d.typeId) === String(t._id)).length;
    },
  },

  AtticPerson: {
    id: (p) => String(p._id),
    relation: (p) => p.relation || null,
    birthDate: (p) => p.birthDate ?? null,
    documentCount: async (p, _a, context) => {
      const { householdId } = await requireVault(context);
      return (await liveDocIndex(context, householdId)).filter((d) => (d.personIds ?? []).some((id) => String(id) === String(p._id))).length;
    },
  },

  AtticDocument: {
    id: (d) => String(d._id),
    title: async (d, _a, context) => {
      const { householdId } = await requireVault(context);
      if (d.title) return d.title;
      const [types, people] = await Promise.all([typesById(context, householdId), peopleById(context, householdId)]);
      return defaultTitle(d, types.get(String(d.typeId)), people);
    },
    type: async (d, _a, context) => {
      const { householdId } = await requireVault(context);
      return (await typesById(context, householdId)).get(String(d.typeId)) ?? null;
    },
    people: async (d, _a, context) => {
      const { householdId } = await requireVault(context);
      const people = await peopleById(context, householdId);
      return (d.personIds ?? []).map((id) => people.get(String(id))).filter(Boolean);
    },
    fields: async (d, _a, context) => {
      const { householdId } = await requireVault(context);
      const type = (await typesById(context, householdId)).get(String(d.typeId));
      return (type?.fields ?? [])
        .filter((f) => !f.identifier)
        .map((f) => ({ key: f.key, label: f.label, kind: f.kind, value: jsonValue(d.fields?.[f.key]) }));
    },
    identifiers: async (d, _a, context) => {
      const { householdId } = await requireVault(context);
      const type = (await typesById(context, householdId)).get(String(d.typeId));
      return (type?.fields ?? [])
        .filter((f) => f.identifier)
        .map((f) => ({ key: f.key, label: f.label, strict: Boolean(f.strict), hasValue: Boolean(d.secrets?.[f.key]?.ct) }));
    },
    issued: (d) => d.issued ?? null,
    expires: (d) => d.expires ?? null,
    expiry: async (d, _a, context) => {
      const { householdId } = await requireVault(context);
      const type = (await typesById(context, householdId)).get(String(d.typeId));
      const warnDays = type?.expiryLabel ? type?.expiryWarnDays ?? null : null;
      const st = atticExpiryStatus(d.expires, warnDays, new Date());
      return { date: d.expires ?? null, label: type?.expiryLabel ?? null, status: st.status, daysUntil: st.daysUntil, warnDays, warnsOn: st.warnsOn };
    },
    files: async (d, _a, context) => {
      const { householdId } = await requireVault(context);
      const entries = d.files ?? [];
      const files = await filesById(context, householdId, entries.map((f) => String(f.fileId)));
      return entries
        .filter((f) => files.has(String(f.fileId)))
        .map((f) => {
          const file = files.get(String(f.fileId));
          return {
            id: String(f._id),
            fileId: String(f.fileId),
            side: f.side || 'page',
            caption: f.caption || '',
            url: `/api/attic/files/${f.fileId}`,
            mime: file.mime ?? null,
            size: file.size ?? null,
            width: file.width ?? null,
            height: file.height ?? null,
          };
        });
    },
    links: async (d, _a, context) => {
      const { householdId } = await requireVault(context);
      const ids = (d.links ?? []).map((l) => l.thingId).filter(Boolean);
      if (!ids.length) return [];
      const rows = await Thing.find({ _id: { $in: ids }, householdId, deletedAt: null }, { name: 1, typeId: 1, photos: 1 }).sort({ sortName: 1 }).lean();
      return rows.map((t) => ({ _id: t._id, name: t.name, typeId: t.typeId, photos: t.photos ?? [], inTrash: false }));
    },
    notes: async (d, _a, context) => {
      await requireVault(context);
      return d.notes ?? '';
    },
  },

  AtticAccessEntry: {
    id: (e) => String(e._id),
  },

  // On a thing's page: the count is locked-visible; the documents need the vault.
  Thing: {
    attic: async (t, _a, context) => {
      const scope = gate(context);
      const linked = (await liveDocIndex(context, scope.householdId)).filter((d) => (d.links ?? []).some((l) => String(l.thingId) === String(t._id)));
      // A peek, not a touch: browsing things is not Attic activity, so it never keeps the vault awake.
      const session = await vaultOf(context, scope, { touch: false });
      if (!session) return { count: linked.length, locked: true, documents: [] };
      if (!linked.length) return { count: 0, locked: false, documents: [] };
      const docs = await AtticDocument.find({ _id: { $in: linked.map((d) => d._id) }, householdId: scope.householdId, deletedAt: null }).lean();
      return { count: docs.length, locked: false, documents: docs };
    },
  },

  ThingAttention: {
    // LOCKED-VISIBLE: person + type + expiry date only.
    attic: async (_parent, _a, context) => {
      const { householdId } = gate(context);
      return expiringFor(context, householdId);
    },
  },

  Query: {
    atticExpiring: async (_, __, context = {}) => {
      const { householdId } = gate(context);
      return expiringFor(context, householdId);
    },

    atticPeople: async (_, __, context = {}) => {
      const { householdId } = await requireVault(context);
      return [...(await peopleById(context, householdId)).values()];
    },

    atticDocumentTypes: async (_, __, context = {}) => {
      const { householdId } = await requireVault(context);
      await ensureStarterTypes(householdId);
      return AtticDocumentType.find({ householdId }).sort({ name: 1, _id: 1 }).lean();
    },

    atticDocuments: async (_, rawArgs, context = {}) => {
      const { householdId } = await requireVault(context);
      const { personId, typeId } = validateDocumentsArgs(rawArgs ?? {});
      const filter = { householdId, deletedAt: null };
      if (personId) {
        if (!validObjectId(personId)) return [];
        filter.personIds = oid(personId);
      }
      if (typeId) {
        if (!validObjectId(typeId)) return [];
        filter.typeId = oid(typeId);
      }
      return AtticDocument.find(filter).sort({ expires: 1, title: 1, _id: 1 }).limit(500).lean();
    },

    atticDocument: async (_, rawArgs, context = {}) => {
      const scope = await requireVault(context);
      const { id } = validateId(rawArgs ?? {});
      if (!validObjectId(id)) return null;
      const doc = await AtticDocument.findOne({ _id: id, householdId: scope.householdId, deletedAt: null }).lean();
      if (!doc) return null;
      const recent = await AtticAudit.exists({
        householdId: scope.householdId,
        userId: scope.userId,
        documentId: doc._id,
        action: 'view',
        at: { $gt: new Date(Date.now() - VIEW_AUDIT_WINDOW_MS) },
      });
      if (!recent) await audit(context, scope, { action: 'view', documentId: doc._id });
      return doc;
    },

    atticAccessLog: async (_, rawArgs, context = {}) => {
      const { householdId } = await requireVault(context);
      const { limit } = validateAccessLogArgs(rawArgs ?? {});
      const rows = await AtticAudit.find({ householdId }).sort({ at: -1, _id: -1 }).limit(limit ?? 40).lean();
      const docIds = [...new Set(rows.map((r) => r.documentId).filter(Boolean).map(String))];
      const [docs, types, people] = await Promise.all([
        docIds.length ? AtticDocument.find({ _id: { $in: docIds.map(oid) }, householdId }, { title: 1, typeId: 1, personIds: 1, deletedAt: 1 }).lean() : [],
        typesById(context, householdId),
        peopleById(context, householdId),
      ]);
      const byId = new Map(docs.map((d) => [String(d._id), d]));
      return rows.map((r) => {
        const doc = r.documentId ? byId.get(String(r.documentId)) : null;
        const type = doc ? types.get(String(doc.typeId)) : null;
        const label = r.field && type ? (type.fields ?? []).find((f) => f.key === r.field)?.label ?? r.field : r.field ?? null;
        return {
          _id: r._id,
          at: r.at,
          action: r.action,
          actorName: r.actorName || 'A member',
          method: r.method ?? null,
          documentId: r.documentId ? String(r.documentId) : null,
          documentTitle: doc && !doc.deletedAt ? doc.title || defaultTitle(doc, type, people) : null,
          field: label,
        };
      });
    },
  },

  Mutation: {
    createAtticPerson: async (_, rawArgs, context = {}) => {
      const { userId, householdId } = await requireVault(context);
      const { input } = validateCreatePerson(rawArgs ?? {});
      const person = await AtticPerson.create({
        householdId,
        name: input.name,
        relation: input.relation ?? '',
        birthDate: input.birthDate ?? null,
        createdBy: userId,
      });
      resetRequestCache(context);
      return toObj(person);
    },

    updateAtticPerson: async (_, rawArgs, context = {}) => {
      const { householdId } = await requireVault(context);
      const { id, input } = validateUpdatePerson(rawArgs ?? {});
      if (!validObjectId(id)) throw notFound('Person');
      const set = {};
      if (input.name !== undefined) set.name = input.name;
      if (input.name !== undefined) set.sortName = input.name.trim().toLowerCase();
      if (input.relation !== undefined) set.relation = input.relation ?? '';
      if (input.birthDate !== undefined) set.birthDate = input.birthDate ?? null;
      const person = await AtticPerson.findOneAndUpdate({ _id: id, householdId }, { $set: set }, { new: true }).lean();
      if (!person) throw notFound('Person');
      resetRequestCache(context);
      return person;
    },

    deleteAtticPerson: async (_, rawArgs, context = {}) => {
      const { householdId } = await requireVault(context);
      const { id } = validateId(rawArgs ?? {});
      if (!validObjectId(id)) return { success: false, message: 'Person not found' };
      const used = await AtticDocument.countDocuments({ householdId, deletedAt: null, personIds: oid(id) });
      if (used > 0) throw codedError(`${used} document${used === 1 ? '' : 's'} still name this person`, 'CONFLICT');
      const res = await AtticPerson.deleteOne({ _id: id, householdId });
      resetRequestCache(context);
      return res.deletedCount ? { success: true, message: 'Person removed' } : { success: false, message: 'Person not found' };
    },

    createAtticDocumentType: async (_, rawArgs, context = {}) => {
      const { householdId } = await requireVault(context);
      const { input } = validateCreateType(rawArgs ?? {});
      await ensureStarterTypes(householdId);
      const base = slugify(input.name);
      const taken = new Set((await AtticDocumentType.find({ householdId }, { key: 1 }).lean()).map((t) => t.key));
      let key = base;
      for (let n = 2; taken.has(key); n += 1) key = `${base}-${n}`;
      const type = await AtticDocumentType.create({
        householdId,
        key,
        name: input.name,
        icon: input.icon || 'FolderOpen',
        issuedLabel: input.issuedLabel || null,
        expiryLabel: input.expiryLabel || null,
        expiryWarnDays: input.expiryLabel ? input.expiryWarnDays ?? 30 : null,
        fields: typeFieldsValue(input.fields),
        builtIn: false,
      });
      resetRequestCache(context);
      return toObj(type);
    },

    /** The key never changes; an existing field never flips between plain and identifier. */
    updateAtticDocumentType: async (_, rawArgs, context = {}) => {
      const { householdId } = await requireVault(context);
      const { id, input } = validateUpdateType(rawArgs ?? {});
      if (!validObjectId(id)) throw notFound('Document type');
      const current = await AtticDocumentType.findOne({ _id: id, householdId }).lean();
      if (!current) throw notFound('Document type');
      const set = {};
      if (input.name !== undefined) set.name = input.name;
      if (input.icon !== undefined) set.icon = input.icon || 'FolderOpen';
      if (input.issuedLabel !== undefined) set.issuedLabel = input.issuedLabel || null;
      if (input.expiryLabel !== undefined) set.expiryLabel = input.expiryLabel || null;
      if (input.expiryWarnDays !== undefined) set.expiryWarnDays = input.expiryWarnDays ?? null;
      if (input.fields !== undefined && input.fields !== null) set.fields = typeFieldsValue(input.fields, current.fields);
      const type = await AtticDocumentType.findOneAndUpdate({ _id: id, householdId }, { $set: set }, { new: true }).lean();
      resetRequestCache(context);
      return type;
    },

    deleteAtticDocumentType: async (_, rawArgs, context = {}) => {
      const { householdId } = await requireVault(context);
      const { id } = validateId(rawArgs ?? {});
      if (!validObjectId(id)) return { success: false, message: 'Document type not found' };
      const used = await AtticDocument.countDocuments({ householdId, deletedAt: null, typeId: oid(id) });
      if (used > 0) throw codedError(`This type is used by ${used} document${used === 1 ? '' : 's'}`, 'CONFLICT');
      const res = await AtticDocumentType.deleteOne({ _id: id, householdId });
      resetRequestCache(context);
      return res.deletedCount ? { success: true, message: 'Type deleted' } : { success: false, message: 'Document type not found' };
    },

    createAtticDocument: async (_, rawArgs, context = {}) => {
      const scope = await requireVault(context);
      const { householdId, userId } = scope;
      const { input } = validateCreateDocument(rawArgs ?? {});
      if (input.files?.length) throw inputError('input.files', 'files are uploaded to the Attic after the document exists');
      const type = await resolveType(householdId, input.typeId);
      const [personIds, links] = await Promise.all([resolvePeople(householdId, input.personIds), resolveLinks(householdId, input.links)]);
      const fields = validateDocumentFields(type, input.fields ?? {});
      const doc = await AtticDocument.create({
        householdId,
        typeId: type._id,
        personIds,
        title: input.title ?? '',
        fields,
        secrets: {},
        issued: type.issuedLabel ? input.issued ?? null : null,
        expires: type.expiryLabel ? input.expires ?? null : null,
        files: [],
        links,
        notes: input.notes ?? '',
        createdBy: userId,
      });
      await audit(context, scope, { action: 'created', documentId: doc._id });
      resetRequestCache(context);
      return toObj(doc);
    },

    updateAtticDocument: async (_, rawArgs, context = {}) => {
      const scope = await requireVault(context);
      const { householdId } = scope;
      const { id, input } = validateUpdateDocument(rawArgs ?? {});
      const doc = await requireLiveDocument(householdId, id);
      if (input.typeId !== undefined && String(input.typeId) !== String(doc.typeId)) {
        throw inputError('input.typeId', 'a document keeps its type — add a new document instead');
      }
      const type = await AtticDocumentType.findOne({ _id: doc.typeId, householdId }).lean();
      const set = {};
      if (input.personIds !== undefined) set.personIds = await resolvePeople(householdId, input.personIds ?? []);
      if (input.links !== undefined) set.links = await resolveLinks(householdId, input.links ?? []);
      if (input.title !== undefined) set.title = input.title ?? '';
      if (input.notes !== undefined) set.notes = input.notes ?? '';
      if (input.fields !== undefined && input.fields !== null) set.fields = validateDocumentFields(type, input.fields, doc.fields);
      if (input.issued !== undefined) set.issued = type?.issuedLabel ? input.issued ?? null : null;
      if (input.expires !== undefined) set.expires = type?.expiryLabel ? input.expires ?? null : null;
      if (input.files !== undefined && input.files !== null) set.files = reorderFiles(doc.files, input.files);
      const updated = await AtticDocument.findOneAndUpdate({ _id: doc._id, householdId, deletedAt: null }, { $set: set }, { new: true }).lean();
      if (!updated) throw notFound();
      await audit(context, scope, { action: 'updated', documentId: doc._id });
      resetRequestCache(context);
      return updated;
    },

    deleteAtticDocument: async (_, rawArgs, context = {}) => {
      const scope = await requireVault(context);
      const { id } = validateId(rawArgs ?? {});
      if (!validObjectId(id)) return { success: false, message: 'Document not found' };
      const res = await AtticDocument.updateOne({ _id: id, householdId: scope.householdId, deletedAt: null }, { $set: { deletedAt: new Date() } });
      if (!res.matchedCount) return { success: false, message: 'Document not found' };
      await audit(context, scope, { action: 'deleted', documentId: oid(id) });
      resetRequestCache(context);
      return { success: true, message: 'Document deleted' };
    },
  },
};
