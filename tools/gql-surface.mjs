#!/usr/bin/env node
// tools/gql-surface.mjs
//
// Print the gateway's GraphQL surface, grouped by the app module that owns
// each root field. Answers "what's available from and to each app" without
// anyone having to read the typeDefs or trust DOCS/GRAPHQL.md being fresh.
//
//   node tools/gql-surface.mjs            human-readable listing
//   node tools/gql-surface.mjs --module gamegeek
//   node tools/gql-surface.mjs --json
//   node tools/gql-surface.mjs --md       the DOCS/GRAPHQL.md fragment
//   node tools/gql-surface.mjs --write    splice that fragment into the doc
//   node tools/gql-surface.mjs --check    fail if the committed fragment is stale (CI)
//
// Loads `<module>/typeDefs.js` directly — those modules import only
// `graphql-tag`, so this opens no database connection and needs no env.
// Same trick as gql-arg-audit.mjs.

import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(fileURLToPath(import.meta.url), '..', '..');
const GRAPHQL_DIR = path.join(
  REPO_ROOT,
  'apps/basegeek/packages/api/src/graphql'
);
const DOC_FILE = path.join(REPO_ROOT, 'DOCS/GRAPHQL.md');
const MARK_BEGIN = '<!-- BEGIN GENERATED SURFACE -->';
const MARK_END = '<!-- END GENERATED SURFACE -->';

const ARGV = process.argv.slice(2);
const AS_JSON = ARGV.includes('--json');
const AS_MD = ARGV.includes('--md');
const WRITE = ARGV.includes('--write');
const CHECK = ARGV.includes('--check');
const moduleIdx = ARGV.indexOf('--module');
const ONLY_MODULE = moduleIdx !== -1 ? ARGV[moduleIdx + 1] : null;

function printType(node) {
  if (node.kind === 'NonNullType') return `${printType(node.type)}!`;
  if (node.kind === 'ListType') return `[${printType(node.type)}]`;
  return node.name.value;
}

function printField(field) {
  const args = (field.arguments ?? []).map(
    (a) => `${a.name.value}: ${printType(a.type)}`
  );
  const sig = args.length ? `(${args.join(', ')})` : '';
  return `${field.name.value}${sig}: ${printType(field.type)}`;
}

async function modules() {
  const top = (await readdir(GRAPHQL_DIR, { withFileTypes: true }))
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
  // A module may keep a sub-module's typeDefs one level down
  // (thinggeek/attic/typeDefs.js — ThingGeek's Attic).
  const out = [];
  for (const name of top) {
    out.push(name);
    const subs = (await readdir(path.join(GRAPHQL_DIR, name), { withFileTypes: true }))
      .filter((e) => e.isDirectory())
      .map((e) => `${name}/${e.name}`)
      .sort();
    out.push(...subs);
  }
  return out;
}

const surface = new Map(); // module -> { Query: [...], Mutation: [...] }

for (const moduleName of await modules()) {
  const file = path.join(GRAPHQL_DIR, moduleName, 'typeDefs.js');
  let mod;
  try {
    mod = await import(pathToFileURL(file).href);
  } catch (err) {
    if (err?.code === 'ERR_MODULE_NOT_FOUND') continue;
    throw new Error(`Could not import ${path.relative(REPO_ROOT, file)}: ${err.message}`);
  }
  const doc = mod.typeDefs ?? mod.sharedTypeDefs;
  if (!doc?.definitions) continue;

  for (const def of doc.definitions) {
    if (def.kind !== 'ObjectTypeDefinition' && def.kind !== 'ObjectTypeExtension') continue;
    const typeName = def.name.value;
    if (typeName !== 'Query' && typeName !== 'Mutation') continue;
    if (!surface.has(moduleName)) surface.set(moduleName, { Query: [], Mutation: [] });
    for (const field of def.fields ?? []) {
      surface.get(moduleName)[typeName].push(printField(field));
    }
  }
}

if (AS_JSON) {
  console.log(JSON.stringify(Object.fromEntries(surface), null, 2));
  process.exit(0);
}

// Markdown fragment for DOCS/GRAPHQL.md §4 — `field(args): Return` split
// across two columns so the tables stay narrow.
function toMarkdown() {
  const out = [];
  for (const [moduleName, roots] of surface) {
    out.push(`### ${moduleName}\n`);
    for (const root of ['Query', 'Mutation']) {
      if (!roots[root].length) continue;
      out.push(`**${root === 'Query' ? 'Queries' : 'Mutations'}**\n`);
      out.push('| Field | Returns |');
      out.push('|---|---|');
      for (const f of roots[root]) {
        const m = f.match(/^([a-zA-Z][a-zA-Z0-9]*)(\([^)]*\))?: (.+)$/);
        const sig = m[2] ? `${m[1]}${m[2]}` : m[1];
        out.push(`| \`${sig}\` | \`${m[3]}\` |`);
      }
      out.push('');
    }
  }
  return out.join('\n').trimEnd() + '\n';
}

if (WRITE || CHECK) {
  const fragment = `${MARK_BEGIN}\n${toMarkdown()}${MARK_END}`;
  const doc = await readFile(DOC_FILE, 'utf8');
  const begin = doc.indexOf(MARK_BEGIN);
  const end = doc.indexOf(MARK_END);
  if (begin === -1 || end === -1 || end < begin) {
    console.error(`gql-surface: ${path.relative(REPO_ROOT, DOC_FILE)} has no ${MARK_BEGIN} … ${MARK_END} region`);
    process.exit(2);
  }
  const updated = doc.slice(0, begin) + fragment + doc.slice(end + MARK_END.length);
  if (updated === doc) {
    if (CHECK) console.log('gql-surface: DOCS/GRAPHQL.md is up to date');
    process.exit(0);
  }
  if (CHECK) {
    console.error('gql-surface: DOCS/GRAPHQL.md generated surface is stale.');
    console.error('Run `node tools/gql-surface.mjs --write` and commit the result.');
    process.exit(1);
  }
  await writeFile(DOC_FILE, updated);
  console.log(`gql-surface: wrote ${path.relative(REPO_ROOT, DOC_FILE)}`);
  process.exit(0);
}

if (AS_MD) {
  process.stdout.write(toMarkdown());
  process.exit(0);
}

for (const [moduleName, roots] of surface) {
  if (ONLY_MODULE && moduleName !== ONLY_MODULE) continue;
  console.log(`\n## ${moduleName}`);
  for (const root of ['Query', 'Mutation']) {
    if (!roots[root].length) continue;
    console.log(`  ${root}`);
    for (const f of roots[root]) console.log(`    ${f}`);
  }
}
