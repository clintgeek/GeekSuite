/**
 * thinggeekAttic.test.js — The Attic, gateway side (DOCS/THINGGEEK_PLAN.md
 * "The Attic").
 *
 *   1. Gates, in order: signed in → member (the kids' accounts get
 *      NOT_A_MEMBER from EVERYTHING, locked-visible answers included) →
 *      a live vault session of THIS user (VAULT_LOCKED otherwise: no cookie,
 *      a bad cookie, another member's cookie, an idle or over-age session).
 *   2. Locked-visible is exactly: atticExpiring / ThingAttention.attic
 *      (names + type + expiry) and Thing.attic.count.
 *   3. The gateway can never write or return an identifier value.
 *   4. People, types, documents, links, expiry windows, the audit log.
 */
import mongoose from 'mongoose';
import { ApolloServer } from '@apollo/server';
import vaultSessionModule from '@geeksuite/schemas/thinggeek/vaultSession';
import {
  startHarness,
  stopHarness,
  cleanAll,
  starterTypes,
  createThing,
  CHEF,
  HEATHER,
  OUTSIDER,
  OTHER_HOUSEHOLD,
} from './thinggeekHarness.js';

const { typeDefs, resolvers } = await import('../graphql/index.js');
const { AtticPerson, AtticDocumentType, AtticDocument, AtticFile, VaultSession, AtticAudit } = await import('../graphql/thinggeek/models/attic.js');
const atticResolvers = (await import('../graphql/thinggeek/attic/resolvers.js')).resolvers;
const { newVaultToken, vaultSessionRow, VAULT_COOKIE, VAULT_IDLE_MS, VAULT_MAX_MS } = vaultSessionModule;

let server;
const tokens = {};

beforeAll(async () => {
  await startHarness();
  await Promise.all([AtticPerson.init(), AtticDocumentType.init(), AtticDocument.init(), AtticFile.init(), VaultSession.init(), AtticAudit.init()]);
  server = new ApolloServer({ typeDefs, resolvers });
  await server.start();
}, 60000);

async function cleanAttic() {
  await Promise.all([
    AtticPerson.deleteMany({}),
    AtticDocumentType.deleteMany({}),
    AtticDocument.deleteMany({}),
    AtticFile.deleteMany({}),
    VaultSession.deleteMany({}),
    AtticAudit.deleteMany({}),
  ]);
}

/** Open a vault session for `userId` the way the backend's unlock does. */
async function unlock(userId, { now = new Date(), method = 'pin' } = {}) {
  const token = newVaultToken();
  await VaultSession.create(vaultSessionRow({ token, userId, householdId: 'default', method, now }));
  tokens[userId] = token;
  return token;
}

beforeEach(async () => {
  await cleanAll();
  await cleanAttic();
  for (const k of Object.keys(tokens)) delete tokens[k];
});

afterAll(async () => {
  await cleanAttic();
  await cleanAll();
  await server.stop();
  await stopHarness();
});

const ctxOf = (userId, token = tokens[userId]) => ({
  user: userId ? { id: userId, username: userId === HEATHER ? 'heather' : userId === CHEF ? 'chef' : 'kid' } : null,
  cookies: token ? { [VAULT_COOKIE]: token } : {},
});

async function run(query, variables = {}, userId = CHEF, token) {
  const res = await server.executeOperation({ query, variables }, { contextValue: ctxOf(userId, token) });
  const single = res.body.kind === 'single' ? res.body.singleResult : null;
  return { data: single?.data ?? null, errors: single?.errors ?? null };
}
async function ok(query, variables = {}, userId = CHEF, token) {
  const { data, errors } = await run(query, variables, userId, token);
  if (errors) throw new Error(`GraphQL errors: ${JSON.stringify(errors, null, 2)}`);
  return data;
}
async function code(query, variables = {}, userId = CHEF, token) {
  const { errors } = await run(query, variables, userId, token);
  return errors?.[0]?.extensions?.code ?? null;
}

const DOC_FIELDS = `id title type { id key name expiryLabel expiryWarnDays } people { id name }
  fields { key label kind value } identifiers { key label strict hasValue }
  issued expires expiry { status daysUntil label warnDays } files { id fileId side url } links { id name } notes`;
const TYPES = `query { atticDocumentTypes { id key name issuedLabel expiryLabel expiryWarnDays builtIn documentCount fields { key label kind identifier strict required } } }`;
const CREATE_PERSON = `mutation($input: AtticPersonInput!) { createAtticPerson(input: $input) { id name relation birthDate documentCount } }`;
const CREATE_DOC = `mutation($input: AtticDocumentInput!) { createAtticDocument(input: $input) { ${DOC_FIELDS} } }`;
const UPDATE_DOC = `mutation($id: ID!, $input: AtticDocumentInput!) { updateAtticDocument(id: $id, input: $input) { ${DOC_FIELDS} } }`;
const EXPIRING = `query { atticExpiring { documentId typeName expiryLabel people expires daysUntil status } }`;

function dayFromToday(n) {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + n)).toISOString().slice(0, 10);
}

async function types(userId = CHEF) {
  if (!tokens[userId]) await unlock(userId);
  const data = await ok(TYPES, {}, userId);
  return Object.fromEntries(data.atticDocumentTypes.map((t) => [t.key, t]));
}

async function person(name, userId = CHEF) {
  return (await ok(CREATE_PERSON, { input: { name, relation: 'Self' } }, userId)).createAtticPerson;
}

async function doc(input, userId = CHEF) {
  return (await ok(CREATE_DOC, { input }, userId)).createAtticDocument;
}

/** Every vault-gated root, with harmless args. */
function vaultCalls(ids) {
  return {
    queries: {
      atticPeople: [`query { atticPeople { id } }`],
      atticDocumentTypes: [`query { atticDocumentTypes { id } }`],
      atticDocuments: [`query { atticDocuments { id } }`],
      atticDocument: [`query($id: ID!) { atticDocument(id: $id) { id } }`, { id: ids.docId }],
      atticAccessLog: [`query { atticAccessLog { id } }`],
    },
    mutations: {
      createAtticPerson: [CREATE_PERSON, { input: { name: 'Mallory' } }],
      updateAtticPerson: [`mutation($id: ID!) { updateAtticPerson(id: $id, input: { name: "pwned" }) { id } }`, { id: ids.personId }],
      deleteAtticPerson: [`mutation($id: ID!) { deleteAtticPerson(id: $id) { success } }`, { id: ids.personId }],
      createAtticDocumentType: [`mutation { createAtticDocumentType(input: { name: "Spy" }) { id } }`],
      updateAtticDocumentType: [`mutation($id: ID!) { updateAtticDocumentType(id: $id, input: { name: "pwned" }) { id } }`, { id: ids.typeId }],
      deleteAtticDocumentType: [`mutation($id: ID!) { deleteAtticDocumentType(id: $id) { success } }`, { id: ids.typeId }],
      createAtticDocument: [`mutation($t: ID!) { createAtticDocument(input: { typeId: $t }) { id } }`, { t: ids.typeId }],
      updateAtticDocument: [`mutation($id: ID!) { updateAtticDocument(id: $id, input: { title: "pwned" }) { id } }`, { id: ids.docId }],
      deleteAtticDocument: [`mutation($id: ID!) { deleteAtticDocument(id: $id) { success } }`, { id: ids.docId }],
    },
  };
}

async function seed() {
  const t = await types();
  const chef = await person('Clint');
  const passport = await doc({ typeId: t.passport.id, personIds: [chef.id], fields: { country: 'USA' }, expires: dayFromToday(200) });
  return { t, chef, passport, ids: { docId: passport.id, personId: chef.id, typeId: t.other.id } };
}

async function snapshot() {
  return JSON.stringify([
    await AtticPerson.find({}).sort({ _id: 1 }).lean(),
    await AtticDocumentType.find({}).sort({ _id: 1 }).lean(),
    await AtticDocument.find({}).sort({ _id: 1 }).lean(),
  ]);
}

describe('the Attic — gates', () => {
  test('the completeness list matches the resolver map', () => {
    const { queries, mutations } = vaultCalls({});
    expect([...Object.keys(queries), 'atticExpiring'].sort()).toEqual(Object.keys(atticResolvers.Query).sort());
    expect(Object.keys(mutations).sort()).toEqual(Object.keys(atticResolvers.Mutation).sort());
  });

  test('anonymous: UNAUTHORIZED everywhere, nothing changes', async () => {
    const { ids } = await seed();
    const before = await snapshot();
    const { queries, mutations } = vaultCalls(ids);
    for (const [q, v] of [...Object.values(queries), ...Object.values(mutations), [EXPIRING]]) {
      expect(await code(q, v, null)).toBe('UNAUTHORIZED');
    }
    expect(await snapshot()).toEqual(before);
  });

  test("a kid's account gets NOT_A_MEMBER from everything — locked-visible answers too — even holding a valid-looking cookie", async () => {
    const { ids } = await seed();
    const before = await snapshot();
    // The kid somehow holds Chef's cookie: still not a member.
    const stolen = tokens[CHEF];
    const { queries, mutations } = vaultCalls(ids);
    for (const [q, v] of [...Object.values(queries), ...Object.values(mutations), [EXPIRING]]) {
      expect(await code(q, v, OUTSIDER, stolen)).toBe('NOT_A_MEMBER');
    }
    expect(await code(`query { thingAttention { attic { documentId } } }`, {}, OUTSIDER, stolen)).toBe('NOT_A_MEMBER');
    // Even their own (impossible) session row would not help.
    await VaultSession.create(vaultSessionRow({ token: newVaultToken(), userId: OUTSIDER, householdId: 'default', method: 'pin' }));
    expect(await code(`query { atticPeople { id } }`, {}, OUTSIDER)).toBe('NOT_A_MEMBER');
    expect(await snapshot()).toEqual(before);
  });

  test('a member with no vault session is VAULT_LOCKED from every vault-gated root, and nothing changes', async () => {
    const { ids } = await seed();
    const before = await snapshot();
    const { queries, mutations } = vaultCalls(ids);
    for (const [name, [q, v]] of [...Object.entries(queries), ...Object.entries(mutations)]) {
      const got = await code(q, v, HEATHER); // Heather hasn't unlocked
      expect([name, got]).toEqual([name, 'VAULT_LOCKED']);
    }
    expect(await snapshot()).toEqual(before);
  });

  test("another member's session cannot be reused", async () => {
    await seed();
    expect(await code(`query { atticPeople { id } }`, {}, HEATHER, tokens[CHEF])).toBe('VAULT_LOCKED');
  });

  test('a malformed or unknown cookie is locked', async () => {
    await seed();
    expect(await code(`query { atticPeople { id } }`, {}, CHEF, 'not-a-token')).toBe('VAULT_LOCKED');
    expect(await code(`query { atticPeople { id } }`, {}, CHEF, newVaultToken())).toBe('VAULT_LOCKED');
  });

  test('an idle session (10 min without Attic activity) is locked; activity keeps one alive', async () => {
    await seed();
    const idle = await unlock(HEATHER, { now: new Date(Date.now() - VAULT_IDLE_MS - 5000) });
    expect(await code(`query { atticPeople { id } }`, {}, HEATHER, idle)).toBe('VAULT_LOCKED');
    // A request touches lastSeenAt.
    const fresh = await unlock(HEATHER, { now: new Date(Date.now() - VAULT_IDLE_MS + 60000) });
    await ok(`query { atticPeople { id } }`, {}, HEATHER, fresh);
    const row = await VaultSession.findOne({ userId: HEATHER, lastSeenAt: { $gt: new Date(Date.now() - 5000) } }).lean();
    expect(row).toBeTruthy();
  });

  test('a session past its absolute lifetime is locked even when active', async () => {
    await seed();
    const token = newVaultToken();
    const row = vaultSessionRow({ token, userId: HEATHER, householdId: 'default', method: 'pin', now: new Date(Date.now() - VAULT_MAX_MS - 1000) });
    row.lastSeenAt = new Date(); // active a moment ago
    await VaultSession.create(row);
    expect(await code(`query { atticPeople { id } }`, {}, HEATHER, token)).toBe('VAULT_LOCKED');
  });

  test('field resolvers refuse a locked context too', async () => {
    const { passport } = await seed();
    const raw = await AtticDocument.findById(passport.id).lean();
    for (const field of ['title', 'type', 'people', 'fields', 'identifiers', 'expiry', 'files', 'links', 'notes']) {
      await expect(Promise.resolve().then(() => atticResolvers.AtticDocument[field](raw, {}, ctxOf(HEATHER)))).rejects.toMatchObject({
        extensions: { code: 'VAULT_LOCKED' },
      });
      await expect(Promise.resolve().then(() => atticResolvers.AtticDocument[field](raw, {}, ctxOf(OUTSIDER, tokens[CHEF])))).rejects.toMatchObject({
        extensions: { code: 'NOT_A_MEMBER' },
      });
    }
  });

  test('Heather sees everything in the Attic with her own unlock', async () => {
    const { passport } = await seed();
    await unlock(HEATHER);
    const data = await ok(`query($id: ID!) { atticDocument(id: $id) { id title people { name } } }`, { id: passport.id }, HEATHER);
    expect(data.atticDocument).toMatchObject({ id: passport.id, people: [{ name: 'Clint' }] });
  });
});

describe('the Attic — what is visible while locked', () => {
  test('atticExpiring: names, type and date only — no title, no numbers, no notes', async () => {
    const { t, chef } = await seed();
    await doc({ typeId: t['drivers-license'].id, personIds: [chef.id], title: 'SECRET TITLE', notes: 'SECRET NOTES', expires: dayFromToday(30) });
    // Locked caller: Heather, no session.
    const res = await run(`query { atticExpiring { documentId typeName expiryLabel people expires daysUntil status } thingAttention { attic { typeName people } } }`, {}, HEATHER);
    expect(res.errors).toBeNull();
    const rows = res.data.atticExpiring;
    expect(rows.map((r) => [r.typeName, r.people, r.status, r.daysUntil])).toEqual([
      ["Driver's license", ['Clint'], 'warning', 30],
      ['Passport', ['Clint'], 'warning', 200],
    ]);
    expect(res.data.thingAttention.attic).toHaveLength(2);
    expect(JSON.stringify(res.data)).not.toMatch(/SECRET|USA/);
    // The type exposes nothing more than the list above.
    const fields = typeDefs.definitions.find((d) => d.name?.value === 'AtticExpiring').fields.map((f) => f.name.value);
    expect(fields.sort()).toEqual(['daysUntil', 'documentId', 'expires', 'expiryLabel', 'people', 'status', 'typeName']);
  });

  test("a thing's page: locked shows only the count; unlocked lists the documents", async () => {
    const { t, chef } = await seed();
    const thingTypes = await starterTypes();
    const van = await createThing({ name: 'Van', typeId: thingTypes.vehicle.id });
    await doc({ typeId: t['vehicle-title'].id, personIds: [chef.id], title: 'Van title', links: [van.id] });
    await doc({ typeId: t['insurance-policy'].id, personIds: [chef.id], title: 'Auto policy', links: [van.id] });
    const Q = `query($id: ID!) { thing(id: $id) { name attic { count locked documents { title } } } }`;
    const locked = await ok(Q, { id: van.id }, HEATHER);
    expect(locked.thing.attic).toEqual({ count: 2, locked: true, documents: [] });
    const open = await ok(Q, { id: van.id }, CHEF);
    expect(open.thing.attic.locked).toBe(false);
    expect(open.thing.attic.documents.map((d) => d.title).sort()).toEqual(['Auto policy', 'Van title']);
  });

  test('browsing things never keeps the vault awake (Thing.attic peeks, it does not touch)', async () => {
    await seed();
    const thingTypes = await starterTypes();
    const van = await createThing({ name: 'Van', typeId: thingTypes.vehicle.id });
    const longAgo = new Date(Date.now() - 5 * 60000);
    await VaultSession.updateOne({ userId: CHEF }, { $set: { lastSeenAt: longAgo } });
    await ok(`query($id: ID!) { thing(id: $id) { attic { count } } }`, { id: van.id }, CHEF);
    const row = await VaultSession.findOne({ userId: CHEF }).lean();
    expect(row.lastSeenAt.getTime()).toBe(longAgo.getTime());
  });
});

describe('the Attic — identifiers never pass through the gateway', () => {
  test('an identifier key in `fields` is refused on create and update; nothing is stored', async () => {
    const { t, chef, passport } = await seed();
    const res = await run(CREATE_DOC, { input: { typeId: t.passport.id, personIds: [chef.id], fields: { number: 'X1234567' } } });
    expect(res.errors[0].extensions.code).toBe('BAD_USER_INPUT');
    expect(res.errors[0].extensions.details[0].path).toBe('input.fields.number');
    const upd = await run(UPDATE_DOC, { id: passport.id, input: { fields: { number: 'X1234567' } } });
    expect(upd.errors[0].extensions.code).toBe('BAD_USER_INPUT');
    const all = JSON.stringify(await AtticDocument.find({}).lean());
    expect(all).not.toContain('X1234567');
  });

  test('`secrets`, householdId and file bytes cannot be smuggled in', async () => {
    const { t } = await seed();
    for (const extra of [{ secrets: { number: {} } }, { householdId: OTHER_HOUSEHOLD }]) {
      const res = await run(CREATE_DOC, { input: { typeId: t.passport.id, ...extra } });
      expect(res.errors).not.toBeNull();
    }
    const files = await run(CREATE_DOC, { input: { typeId: t.passport.id, files: [{ id: String(new mongoose.Types.ObjectId()) }] } });
    expect(files.errors[0].extensions.code).toBe('BAD_USER_INPUT');
  });

  test('identifiers say only whether a value is on file; the sealed blob is never returned', async () => {
    const { passport } = await seed();
    await AtticDocument.updateOne({ _id: passport.id }, { $set: { secrets: { number: { v: 1, iv: 'SEALEDIV', tag: 'SEALEDTAG', ct: 'SEALEDCIPHERTEXT' } } } });
    const data = await ok(`query($id: ID!) { atticDocument(id: $id) { ${DOC_FIELDS} } }`, { id: passport.id });
    expect(data.atticDocument.identifiers).toEqual([{ key: 'number', label: 'Passport number', strict: false, hasValue: true }]);
    expect(JSON.stringify(data)).not.toMatch(/SEALED/);
    expect(data.atticDocument.fields).toEqual([{ key: 'country', label: 'Country', kind: 'text', value: 'USA' }]);
  });

  test('the Social Security type is strict', async () => {
    const t = await types();
    expect(t['social-security'].fields).toEqual([{ key: 'number', label: 'Social Security number', kind: 'text', identifier: true, strict: true, required: false }]);
  });

  test('an existing field cannot flip between plain and identifier', async () => {
    const t = await types();
    const res = await run(`mutation($id: ID!, $input: AtticDocumentTypeInput!) { updateAtticDocumentType(id: $id, input: $input) { id } }`, {
      id: t.passport.id,
      input: { fields: [{ key: 'number', label: 'Passport number', kind: 'text', identifier: false }, { key: 'country', label: 'Country', kind: 'text' }] },
    });
    expect(res.errors[0].extensions.code).toBe('BAD_USER_INPUT');
  });
});

describe('the Attic — people, types and documents', () => {
  test('starter types: the warning windows Chef chose', async () => {
    const t = await types();
    const w = (k) => [t[k].expiryLabel, t[k].expiryWarnDays];
    expect(w('passport')).toEqual(['Expires', 270]);
    expect(w('drivers-license')).toEqual(['Expires', 60]);
    expect(w('insurance-policy')).toEqual(['Renews', 30]);
    expect(w('vehicle-registration')).toEqual(['Expires', 30]);
    expect(w('pet-record')).toEqual(['Rabies vaccine expires', 30]);
    expect(w('birth-certificate')).toEqual([null, null]);
    expect(Object.keys(t)).toHaveLength(15);
    // Seeded once: a second call adds nothing.
    await types();
    expect(await AtticDocumentType.countDocuments({ householdId: 'default' })).toBe(15);
  });

  test('a document: plain fields, people, dates, title fallback, counts; by person and by type', async () => {
    const { t, chef, passport } = await seed();
    const heather = await person('Heather');
    expect(passport.title).toBe('Passport · Clint');
    expect(passport.expiry).toMatchObject({ status: 'warning', daysUntil: 200, label: 'Expires', warnDays: 270 });
    const lic = await doc({ typeId: t['drivers-license'].id, personIds: [heather.id], fields: { class: 'C', state: 'MO' }, expires: dayFromToday(400), issued: '2022-01-05' });
    expect(lic.expiry.status).toBe('ok');
    expect(lic.fields.map((f) => [f.key, f.value])).toEqual([['class', 'C'], ['state', 'MO']]);
    const byPerson = await ok(`query($p: ID) { atticDocuments(personId: $p) { id } }`, { p: heather.id });
    expect(byPerson.atticDocuments.map((d) => d.id)).toEqual([lic.id]);
    const byType = await ok(`query($t: ID) { atticDocuments(typeId: $t) { id } }`, { t: t.passport.id });
    expect(byType.atticDocuments.map((d) => d.id)).toEqual([passport.id]);
    const people = await ok(`query { atticPeople { name documentCount } }`);
    expect(people.atticPeople).toEqual([{ name: 'Clint', documentCount: 1 }, { name: 'Heather', documentCount: 1 }]);
    void chef;
  });

  test('a type without an expiry ignores one; a person in use cannot be deleted', async () => {
    const { t, chef } = await seed();
    const bc = await doc({ typeId: t['birth-certificate'].id, personIds: [chef.id], expires: dayFromToday(5) });
    expect(bc.expires).toBeNull();
    const res = await run(`mutation($id: ID!) { deleteAtticPerson(id: $id) { success } }`, { id: chef.id });
    expect(res.errors[0].extensions.code).toBe('CONFLICT');
  });

  test('update: type is fixed, links must be live household things, files only reorder existing entries', async () => {
    const { t, passport } = await seed();
    expect((await run(UPDATE_DOC, { id: passport.id, input: { typeId: t.other.id } })).errors[0].extensions.code).toBe('BAD_USER_INPUT');
    const theirThing = String(new mongoose.Types.ObjectId());
    expect((await run(UPDATE_DOC, { id: passport.id, input: { links: [theirThing] } })).errors[0].extensions.code).toBe('BAD_USER_INPUT');
    const f1 = new mongoose.Types.ObjectId();
    const f2 = new mongoose.Types.ObjectId();
    await AtticFile.create([
      { _id: f1, householdId: 'default', documentId: passport.id, mime: 'image/jpeg', size: 10, path: 'x/1.enc', keyVersion: 1 },
      { _id: f2, householdId: 'default', documentId: passport.id, mime: 'image/jpeg', size: 10, path: 'x/2.enc', keyVersion: 1 },
    ]);
    const e1 = new mongoose.Types.ObjectId();
    const e2 = new mongoose.Types.ObjectId();
    await AtticDocument.updateOne({ _id: passport.id }, { $set: { files: [{ _id: e1, fileId: f1, side: 'front' }, { _id: e2, fileId: f2, side: 'back' }] } });
    const re = await ok(UPDATE_DOC, { id: passport.id, input: { files: [{ id: String(e2) }, { id: String(e1), caption: 'Photo page' }] } });
    expect(re.updateAtticDocument.files.map((f) => [f.side, f.url])).toEqual([['back', `/api/attic/files/${f2}`], ['front', `/api/attic/files/${f1}`]]);
    const bogus = await run(UPDATE_DOC, { id: passport.id, input: { files: [{ id: String(new mongoose.Types.ObjectId()) }] } });
    expect(bogus.errors[0].extensions.code).toBe('BAD_USER_INPUT');
  });

  test('delete: gone from every view at once', async () => {
    const { passport } = await seed();
    await ok(`mutation($id: ID!) { deleteAtticDocument(id: $id) { success } }`, { id: passport.id });
    expect((await ok(`query { atticDocuments { id } }`)).atticDocuments).toEqual([]);
    expect((await ok(`query($id: ID!) { atticDocument(id: $id) { id } }`, { id: passport.id })).atticDocument).toBeNull();
    expect((await ok(EXPIRING, {}, HEATHER)).atticExpiring).toEqual([]);
  });

  test('another household is invisible', async () => {
    const { t } = await seed();
    const theirs = await AtticDocument.create({ householdId: OTHER_HOUSEHOLD, typeId: t.passport.id, title: 'Theirs', expires: new Date(Date.now() + 86400000) });
    await AtticPerson.create({ householdId: OTHER_HOUSEHOLD, name: 'Stranger' });
    expect((await ok(`query { atticDocuments { title } }`)).atticDocuments.map((d) => d.title)).not.toContain('Theirs');
    expect((await ok(`query($id: ID!) { atticDocument(id: $id) { id } }`, { id: String(theirs._id) })).atticDocument).toBeNull();
    expect((await ok(`query { atticPeople { name } }`)).atticPeople.map((p) => p.name)).toEqual(['Clint']);
    expect((await ok(EXPIRING)).atticExpiring.map((e) => e.documentId)).not.toContain(String(theirs._id));
  });
});

describe('the Attic — expiry windows (Needs attention)', () => {
  test.each([
    ['passport', 271, false],
    ['passport', 270, true],
    ['drivers-license', 61, false],
    ['drivers-license', 60, true],
    ['insurance-policy', 30, true],
    ['insurance-policy', 31, false],
    ['vehicle-registration', 29, true],
    ['pet-record', 30, true],
    ['passport', -3, true],
  ])('%s expiring in %i days warns: %s', async (key, days, warns) => {
    const t = await types();
    await doc({ typeId: t[key].id, expires: dayFromToday(days) });
    const rows = (await ok(EXPIRING, {}, HEATHER)).atticExpiring;
    expect(rows.length).toBe(warns ? 1 : 0);
    if (warns) expect(rows[0].status).toBe(days < 0 ? 'expired' : 'warning');
  });

  test('the warning window is the household’s to tune', async () => {
    const t = await types();
    await doc({ typeId: t.other.id, expires: dayFromToday(90) });
    expect((await ok(EXPIRING)).atticExpiring).toHaveLength(0);
    await ok(`mutation($id: ID!) { updateAtticDocumentType(id: $id, input: { expiryWarnDays: 120 }) { id } }`, { id: t.other.id });
    expect((await ok(EXPIRING)).atticExpiring).toHaveLength(1);
  });
});

describe('the Attic — the audit log', () => {
  test('opening a document is logged once per window; writes are logged; nothing holds a value', async () => {
    const { passport } = await seed();
    const Q = `query($id: ID!) { atticDocument(id: $id) { id } }`;
    await ok(Q, { id: passport.id });
    await ok(Q, { id: passport.id });
    await unlock(HEATHER);
    await ok(Q, { id: passport.id }, HEATHER);
    const views = await AtticAudit.find({ action: 'view' }).lean();
    expect(views.map((v) => v.userId).sort()).toEqual([CHEF, HEATHER].sort());
    expect(await AtticAudit.countDocuments({ action: 'created', documentId: passport.id })).toBe(1);
    // A reveal row as the backend writes it: field KEY only.
    await AtticAudit.create({ householdId: 'default', userId: HEATHER, actorName: 'heather', action: 'reveal', documentId: passport.id, field: 'number', at: new Date() });
    const log = (await ok(`query { atticAccessLog { action actorName documentTitle field } }`)).atticAccessLog;
    expect(log[0]).toEqual({ action: 'reveal', actorName: 'heather', documentTitle: 'Passport · Clint', field: 'Passport number' });
    expect(log.map((e) => e.action)).toEqual(expect.arrayContaining(['view', 'created']));
  });

  test('the log is household-scoped and vault-gated', async () => {
    await seed();
    await AtticAudit.create({ householdId: OTHER_HOUSEHOLD, userId: OUTSIDER, actorName: 'them', action: 'view', at: new Date() });
    const log = (await ok(`query { atticAccessLog { actorName } }`)).atticAccessLog;
    expect(log.map((e) => e.actorName)).not.toContain('them');
    expect(await code(`query { atticAccessLog { id } }`, {}, HEATHER)).toBe('VAULT_LOCKED');
  });
});
