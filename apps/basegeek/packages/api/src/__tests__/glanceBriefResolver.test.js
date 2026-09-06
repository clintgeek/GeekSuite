/**
 * glanceBriefResolver.test.js
 *
 * The gateway edge of the morning brief: the SDL it publishes and the two
 * arguments it refuses. `briefService` is unit-tested next door
 * (`glanceBrief.test.js`); what is pinned here is the contract a client sees.
 *
 * `localHour` is the one argument that decides whether a model is asked at
 * all, and it comes from the browser (the containers run UTC — BURN_REVIEW
 * #13), so it is bounded rather than trusted. A resolver that took `localHour:
 * -1` and quietly treated it as "before 5 a.m." would be indistinguishable
 * from one that took `localHour: 99` and briefed at midnight.
 */

import { parse, Kind } from 'graphql';
import { GraphQLError } from 'graphql';

import { typeDefs } from '../graphql/glance/typeDefs.js';
import { sharedTypeDefs } from '../graphql/shared/typeDefs.js';
import { resolvers } from '../graphql/glance/resolvers.js';

// AIProvenance lives in shared/typeDefs.js (one declaration for every AI feature).
const doc = parse(typeDefs.loc.source.body + '\n' + sharedTypeDefs.loc.source.body);

const typeNode = (name) =>
  doc.definitions.find((d) => d.kind === Kind.OBJECT_TYPE_DEFINITION && d.name.value === name);

const queryField = (name) => {
  for (const def of doc.definitions) {
    if (def.kind !== Kind.OBJECT_TYPE_EXTENSION || def.name.value !== 'Query') continue;
    const field = def.fields.find((f) => f.name.value === name);
    if (field) return field;
  }
  return null;
};

/** `Foo!` / `[Foo!]!` printed back the way the SDL wrote it. */
function printType(node) {
  if (node.kind === Kind.NON_NULL_TYPE) return `${printType(node.type)}!`;
  if (node.kind === Kind.LIST_TYPE) return `[${printType(node.type)}]`;
  return node.name.value;
}

describe('glanceBrief SDL', () => {
  test('takes the client\'s own date and hour, both required', () => {
    const field = queryField('glanceBrief');
    expect(field).toBeTruthy();
    expect(printType(field.type)).toBe('GlanceBrief!');
    const args = Object.fromEntries(field.arguments.map((a) => [a.name.value, printType(a.type)]));
    expect(args).toEqual({ date: 'String!', localHour: 'Int!' });
  });

  test('the brief itself is nullable and the provenance is not', () => {
    const fields = Object.fromEntries(
      typeNode('GlanceBrief').fields.map((f) => [f.name.value, printType(f.type)])
    );
    expect(fields).toEqual({
      date: 'String!',
      brief: 'String',        // null is a normal answer: before 5am, or no snapshot
      facts: 'JSON',
      provenance: 'AIProvenance!',
    });
  });

  test('AIProvenance is declared, so a fallback can never pass for a model answer', () => {
    const fields = Object.fromEntries(
      typeNode('AIProvenance').fields.map((f) => [f.name.value, printType(f.type)])
    );
    expect(fields.source).toBe('String!');
    expect(fields.model).toBe('String');
  });
});

describe('glanceBrief arguments', () => {
  const ctx = { user: { id: 'u1' } };

  test('an anonymous caller gets nothing, and is refused before validation', async () => {
    await expect(resolvers.Query.glanceBrief(null, { date: '2026-09-06', localHour: 7 }, {}))
      .rejects.toThrow(/unauthorized/i);
  });

  test.each([
    ['a date that is not a calendar day', { date: '06/09/2026', localHour: 7 }],
    ['an empty date', { date: '', localHour: 7 }],
    ['an hour below the clock', { date: '2026-09-06', localHour: -1 }],
    ['an hour above the clock', { date: '2026-09-06', localHour: 24 }],
    ['a fractional hour', { date: '2026-09-06', localHour: 7.5 }],
  ])('rejects %s as BAD_USER_INPUT', async (_label, args) => {
    const err = await resolvers.Query.glanceBrief(null, args, ctx).catch((e) => e);
    expect(err).toBeInstanceOf(GraphQLError);
    expect(err.extensions.code).toBe('BAD_USER_INPUT');
  });

  test('a valid call before 5am answers without touching the database', async () => {
    const res = await resolvers.Query.glanceBrief(null, { date: '2026-09-06', localHour: 4 }, ctx);
    expect(res).toMatchObject({ date: '2026-09-06', brief: null, facts: null });
    expect(res.provenance.source).toBe('fallback');
  });
});
