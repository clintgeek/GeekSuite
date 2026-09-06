#!/usr/bin/env node
// tools/gql-arg-audit.mjs
//
// Cross-check every frontend GraphQL document in the suite against the
// gateway's own schema, in BOTH directions, and fail on the drift that
// GraphQL itself will not tell you about.
//
// ## Why this exists
//
// GraphQL is loud about some mistakes and completely silent about others, and
// the silent ones are the expensive ones:
//
//   - An argument a mutation does not declare is a *validation error*. Loud.
//   - A **variable in the `variables` object that the document never declared
//     as a `$var` is dropped without a word.** The request succeeds, the
//     dialog closes, the field is never written. flockgeek's
//     `QuickHarvestEntry` sent `source: "manual"` to `recordEggProduction`
//     for the life of the feature and not one record ever carried it; the Add
//     Hatch Event dialog lost `hatchDate` the same way — and its unit test
//     asserted the payload, so the test agreed with a value the server never
//     saw. A test cannot catch this class, because both sides of a test are
//     the client.
//   - A **`$var` declared and then never passed to the field** is the same
//     bug wearing a different hat: the caller fills the variable in, Apollo
//     ships it, the resolver never sees it.
//   - A field the UI collects that has **no argument on the mutation at all**
//     is the third face of it. `updateBird` declared 6 of the 16 fields
//     BirdsPage's edit form collects, so editing a bird's breed closed the
//     dialog and changed nothing (Q59).
//
// The rule this tool enforces, stated once: **a frontend field with no
// mutation argument is a bug, not a preference.** Either the gateway grows
// the argument or the input comes out of the form.
//
// ## What it checks
//
// Per operation, three checks that are always errors:
//
//   1. `undeclared-variable`  — a `$var` used in the body with no matching
//                               variable definition.
//   2. `unused-variable`      — a variable definition never referenced in the
//                               body. Whatever the caller passes for it is
//                               discarded.
//   3. `unknown-argument`     — an argument on a root field that the gateway
//                               schema does not declare, or a root field the
//                               schema does not have at all.
//
// And one check across the document boundary, which is where the `source` bug
// actually lived:
//
//   4. `undeclared-callsite-key` — a key in a `{ variables: { … } }` object
//                                  literal that the document bound to that
//                                  call declares no variable for.
//
// Plus one advisory pass, off by default because most of its output is
// legitimate (`--missing`):
//
//   5. `missing-argument`     — a schema argument the document never passes.
//                               Sometimes a real silent-loss finding, usually
//                               just an optional argument this screen has no
//                               reason to send. Human judgement required, so
//                               it never fails the build.
//
// ## What it does NOT check, and why that matters
//
// **The interior of an input object.** This tool compares *root field
// arguments*. When a mutation takes `input: SomeInput!` that is ONE argument,
// and the fields inside it are invisible here.
//
// That gap has already cost something. fitnessgeek's Medications page sent
// `suggested_indications` inside `FitnessMedicationInput`, which declared no
// such field — readable on `FitnessMedication`, present on the model, missing
// only from the input — and every Add and Edit Medication failed outright.
// Not silently: an unrecognized field on an input-object *variable* is a
// coercion error, so graphql-js refuses the whole operation before the
// resolver runs, even when the value is `[]`.
//
// Extending this tool to input objects would not have caught that one either,
// because the payload is passed as `variables: { input: data }` — a name, not
// a literal, and its keys are built in another module. That is a job for a
// test that drives the real schema, or for an eye. **A clean run of this tool
// means the root argument lists agree; it does not mean an input object's
// fields do.**
//
// ## How it reads things
//
// The gateway's `src/graphql/*/typeDefs.js` modules import nothing but
// `graphql-tag`, so they are imported directly — no mongoose connection is
// opened and no merged schema has to be built. Only `Query`/`Mutation` field
// argument lists are extracted.
//
// Frontend documents cannot be imported (JSX, aliases, a browser runtime), so
// their `gql` template literals are scanned out of the source text and handed
// to `graphql`'s `parse`. `${…}` interpolations — fragment splices — are
// blanked before parsing; an unresolved `...Fragment` spread is a *validation*
// concern, not a parse one, so this is safe and keeps the scanner dependency
// free.
//
// `graphql` is resolved from `apps/basegeek/packages/api`, which already
// depends on it; there is no new dependency anywhere and nothing to install.
//
// Usage:
//   node tools/gql-arg-audit.mjs            # errors only; exit 1 on any
//   node tools/gql-arg-audit.mjs --missing  # also list unpassed schema args
//   node tools/gql-arg-audit.mjs --json     # machine-readable findings

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const REPO_ROOT = path.resolve(fileURLToPath(import.meta.url), '..', '..');
const API_PKG = path.join(REPO_ROOT, 'apps/basegeek/packages/api');

// `graphql` is a dependency of the api package, not of the repo root. Resolve
// it from there so this tool adds no dependency of its own.
const requireFromApi = createRequire(path.join(API_PKG, 'package.json'));
const { parse } = await import(
  pathToFileURL(requireFromApi.resolve('graphql')).href
);

const ARGV = new Set(process.argv.slice(2));
const SHOW_MISSING = ARGV.has('--missing');
const AS_JSON = ARGV.has('--json');

// ── Where the documents live ────────────────────────────────────────────────
// Every tree that talks to the gateway. bujogeek and notegeek are in here on
// purpose: they are audited like everything else even while another pass owns
// the files.
const DOCUMENT_ROOTS = [
  'apps/notegeek/frontend/src',
  'apps/bujogeek/frontend/src',
  'apps/flockgeek/frontend/src',
  'apps/fitnessgeek/frontend/src',
  'apps/bookgeek/web/src',
  'apps/basegeek/packages/ui/src',
  'apps/startgeek/src',
];

const GRAPHQL_DIR = path.join(API_PKG, 'src/graphql');

const SOURCE_EXTENSIONS = new Set(['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.graphql', '.gql']);
const EXCLUDE_DIRS = new Set(['node_modules', 'dist', 'build', 'coverage', '.git', '.vite']);

// ── 1. The gateway schema's root argument lists ─────────────────────────────

/**
 * Import every `<module>/typeDefs.js` and collect the argument list of every
 * `Query` and `Mutation` field. These modules import only `graphql-tag`, so
 * importing them opens no database connection — which is the whole reason
 * this reads typeDefs directly instead of booting the merged schema.
 */
async function loadSchemaRootFields() {
  const modules = (await readdir(GRAPHQL_DIR, { withFileTypes: true }))
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();

  /** @type {Map<'Query'|'Mutation', Map<string, {args: Map<string,string>, module: string}>>} */
  const roots = new Map([['Query', new Map()], ['Mutation', new Map()]]);

  for (const moduleName of modules) {
    const file = path.join(GRAPHQL_DIR, moduleName, 'typeDefs.js');
    let mod;
    try {
      mod = await import(pathToFileURL(file).href);
    } catch (err) {
      if (err?.code === 'ERR_MODULE_NOT_FOUND') continue; // no typeDefs in this dir
      throw new Error(`Could not import ${path.relative(REPO_ROOT, file)}: ${err.message}`);
    }
    const doc = mod.typeDefs ?? mod.sharedTypeDefs;
    if (!doc?.definitions) continue;

    for (const def of doc.definitions) {
      // `type Mutation { … }` and `extend type Mutation { … }` both count.
      if (def.kind !== 'ObjectTypeDefinition' && def.kind !== 'ObjectTypeExtension') continue;
      const typeName = def.name.value;
      if (!roots.has(typeName)) continue;
      for (const field of def.fields ?? []) {
        const args = new Map();
        for (const arg of field.arguments ?? []) {
          args.set(arg.name.value, printType(arg.type));
        }
        roots.get(typeName).set(field.name.value, { args, module: moduleName });
      }
    }
  }
  return roots;
}

/** `NonNullType(ListType(NamedType(ID)))` → `[ID]!`, for readable messages. */
function printType(node) {
  if (node.kind === 'NonNullType') return `${printType(node.type)}!`;
  if (node.kind === 'ListType') return `[${printType(node.type)}]`;
  return node.name.value;
}

// ── 2. Finding the documents ────────────────────────────────────────────────

async function collectSourceFiles(root) {
  const out = [];
  async function walk(dir) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return; // a root that does not exist on this checkout is not an error
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (EXCLUDE_DIRS.has(entry.name)) continue;
        await walk(full);
      } else if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
        out.push(full);
      }
    }
  }
  await walk(root);
  return out.sort();
}

/**
 * Pull every gql/graphql tagged template out of a source file.
 *
 * This is a small JS lexer rather than a regex, and it has to be: a regex for
 * the tag matches prose. `apps/flockgeek/.../QuickHarvestEntry.test.jsx` has
 * the words "`gql`/everything else" in a comment and
 * `restVsGraphqlRouting.test.js` has "basegeek's `/graphql`;" — in both, an
 * identifier is followed by a backtick and a regex cannot tell that from a
 * tagged template. So comments and string literals are skipped by state, and
 * only a tag in code position is taken.
 *
 * `${…}` interpolations are substituted, not blanked, and the substitution
 * depends on where they sit:
 *
 *   - inside a selection set (brace depth > 0) they are a spliced *field
 *     list* — `saveBookProfile(input: $input) { ${BOOK_PROFILE_FIELDS} }` —
 *     and blanking one leaves `{ }`, which is a parse error. A placeholder
 *     field name keeps the document parseable.
 *   - at document top level they are a spliced *fragment definition*, where a
 *     stray name would itself be the parse error, so those are blanked.
 *
 * Either way the interpolation's newlines are preserved, so line numbers
 * inside the literal stay true to the file.
 */
function extractGqlLiterals(source) {
  const literals = [];
  const isIdentChar = (c) => c !== undefined && /[\w$]/.test(c);

  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];

    // Skip comments.
    if (ch === '/' && source[i + 1] === '/') {
      i = source.indexOf('\n', i);
      if (i === -1) break;
      continue;
    }
    if (ch === '/' && source[i + 1] === '*') {
      const end = source.indexOf('*/', i + 2);
      i = end === -1 ? source.length : end + 1;
      continue;
    }
    // Skip plain string literals.
    if (ch === '"' || ch === "'") {
      i += 1;
      while (i < source.length && source[i] !== ch) {
        if (source[i] === '\\') i += 1;
        if (source[i] === '\n') break; // unterminated: bail rather than run away
        i += 1;
      }
      continue;
    }
    if (!isIdentChar(ch)) continue;

    // An identifier. Is it our tag, in code position?
    let j = i;
    while (j < source.length && isIdentChar(source[j])) j += 1;
    const word = source.slice(i, j);
    const prev = source[i - 1];
    if ((word !== 'gql' && word !== 'graphql') || prev === '.' || prev === '`') {
      i = j - 1;
      continue;
    }
    let k = j;
    while (k < source.length && /\s/.test(source[k])) k += 1;
    if (source[k] !== '`') { i = j - 1; continue; }

    // Consume the template.
    const start = k + 1;
    let p = start;
    let body = '';
    let braceDepth = 0;
    for (; p < source.length; p += 1) {
      const c = source[p];
      if (c === '\\') { body += '  '; p += 1; continue; }
      if (c === '`') break;
      if (c === '$' && source[p + 1] === '{') {
        let q = p + 2;
        let braces = 1;
        while (q < source.length && braces > 0) {
          if (source[q] === '{') braces += 1;
          else if (source[q] === '}') braces -= 1;
          q += 1;
        }
        const raw = source.slice(p, q);
        const newlines = raw.split('\n').length - 1;
        body += (braceDepth > 0 ? '__splicedFieldList' : '') + '\n'.repeat(newlines);
        p = q - 1;
        continue;
      }
      if (c === '{') braceDepth += 1;
      else if (c === '}') braceDepth -= 1;
      body += c;
    }
    literals.push({ text: body, offset: start });
    i = p;
  }
  return literals;
}

/** Line number of a byte offset, 1-based. */
const lineAt = (source, offset) => source.slice(0, offset).split('\n').length;

// ── 3. Walking a parsed operation ───────────────────────────────────────────

/** Every `$name` referenced anywhere inside a node. */
function collectVariableUses(node, into = new Set()) {
  if (!node || typeof node !== 'object') return into;
  if (Array.isArray(node)) {
    for (const child of node) collectVariableUses(child, into);
    return into;
  }
  if (node.kind === 'Variable') into.add(node.name.value);
  for (const key of Object.keys(node)) {
    if (key === 'loc') continue;
    collectVariableUses(node[key], into);
  }
  return into;
}

// ── 4. Call-site `variables: { … }` keys ────────────────────────────────────

/**
 * Map the local binding of a `useMutation`/`useQuery`/`useLazyQuery` call to
 * the document constant it was given:
 *
 *   const [updateBird] = useMutation(UPDATE_BIRD)   → updateBird → UPDATE_BIRD
 *   const [run, …]     = useLazyQuery(SEARCH)       → run        → SEARCH
 *
 * Anything more exotic (a document chosen at runtime, a binding reassigned)
 * simply is not matched, and this check stays quiet about it. It is a
 * bug-finder, not a proof.
 */
function collectHookBindings(source) {
  const bindings = new Map(); // localName → documentConstName
  const re = /(?:const|let|var)\s*\[\s*([A-Za-z_$][\w$]*)[^\]]*\]\s*=\s*use(?:Mutation|LazyQuery)\s*\(\s*([A-Z][A-Z0-9_]*)/g;
  let m;
  while ((m = re.exec(source)) !== null) bindings.set(m[1], m[2]);
  return bindings;
}

/**
 * The top-level keys of the object literal that follows `variables:` at
 * `fromIndex`. Returns `null` when the object spreads something (`...rest`),
 * because then the key set is not knowable from the text and a report would
 * be a guess.
 */
function variablesObjectKeys(source, fromIndex) {
  // The variables must be an object literal *right here*. `variables: filters`
  // and `variables: noteData` (notegeek's services/api.js) pass a name whose
  // keys this scanner cannot know — and searching on for the next `{` finds
  // some unrelated object two lines down and invents findings from it. An
  // identifier is "unknown", not "empty".
  let open = fromIndex;
  if (source[open] === ':') open += 1;
  while (open < source.length && /\s/.test(source[open])) open += 1;
  if (source[open] !== '{') return null;
  const keys = [];
  let depth = 0;
  let i = open;
  let segmentStart = open + 1;
  for (; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '{' || ch === '[' || ch === '(') {
      depth += 1;
      if (depth === 1) segmentStart = i + 1;
      continue;
    }
    if (ch === '}' || ch === ']' || ch === ')') {
      depth -= 1;
      if (depth === 0) {
        pushKey(source.slice(segmentStart, i));
        break;
      }
      continue;
    }
    if (ch === ',' && depth === 1) {
      pushKey(source.slice(segmentStart, i));
      segmentStart = i + 1;
    }
  }
  function pushKey(segment) {
    const trimmed = segment.trim();
    if (!trimmed) return;
    if (trimmed.startsWith('...')) { keys.push('...'); return; }
    const named = /^["']?([A-Za-z_$][\w$]*)["']?\s*:/.exec(trimmed);
    if (named) { keys.push(named[1]); return; }
    const shorthand = /^([A-Za-z_$][\w$]*)$/.exec(trimmed);
    if (shorthand) keys.push(shorthand[1]);
  }
  if (keys.includes('...')) return null;
  return keys;
}

/**
 * Every call site in a file that pairs a document with a variables object.
 *
 * The suite writes this three different ways and the check has to know all
 * three, or it is blind on whole trees:
 *
 *   A. Apollo hooks —  `updateBird({ variables: { … } })`, after
 *      `const [updateBird] = useMutation(UPDATE_BIRD)`. flockgeek, bookgeek,
 *      fitnessgeek, bujogeek, notegeek.
 *   B. The client directly — `apolloClient.mutate({ mutation: CREATE_API_KEY,
 *      variables: { … } })`. basegeek's packages/ui aigeek console.
 *   C. A hand-rolled transport — `gql(CREATE_TASK, { … })`, where the second
 *      argument *is* the variables object. startgeek, which has no Apollo.
 */
function collectCallSites(source, bindings) {
  const sites = [];

  // A — a hook binding called with `{ variables: { … } }`.
  for (const [local, docName] of bindings) {
    const re = new RegExp(`\\b${local}\\s*\\(`, 'g');
    let m;
    while ((m = re.exec(source)) !== null) {
      const varsAt = findKeyInCall(source, m.index + m[0].length, 'variables');
      if (varsAt === -1) continue;
      const keys = variablesObjectKeys(source, varsAt);
      if (keys) sites.push({ docName, keys, line: lineAt(source, m.index) });
    }
  }

  // B — `{ mutation: DOC, … variables: { … } }` / `{ query: DOC, … }`.
  const clientRe = /\b(?:mutation|query)\s*:\s*([A-Z][A-Z0-9_]*)\s*,/g;
  let cm;
  while ((cm = clientRe.exec(source)) !== null) {
    const varsAt = findKeyInCall(source, clientRe.lastIndex, 'variables');
    if (varsAt === -1) continue;
    const keys = variablesObjectKeys(source, varsAt);
    if (keys) sites.push({ docName: cm[1], keys, line: lineAt(source, cm.index) });
  }

  // C — `gql(DOC, { … })`: the variables object is the second argument.
  const directRe = /\bgql\s*\(\s*([A-Z][A-Z0-9_]*)\s*,/g;
  let dm;
  while ((dm = directRe.exec(source)) !== null) {
    const keys = variablesObjectKeys(source, directRe.lastIndex);
    if (keys) sites.push({ docName: dm[1], keys, line: lineAt(source, dm.index) });
  }

  return sites;
}

/**
 * Index of the `:` of `<key>:` at the top level of the call/object starting at
 * `from`, or -1. Stops at the end of that call so a later, unrelated
 * `variables:` in the same file is not picked up.
 */
function findKeyInCall(source, from, key) {
  let depth = 1;
  const probe = new RegExp(`^${key}\\s*:`);
  for (let i = from; i < source.length && depth > 0; i += 1) {
    const ch = source[i];
    if (ch === '(' || ch === '{' || ch === '[') depth += 1;
    else if (ch === ')' || ch === '}' || ch === ']') depth -= 1;
    else if (ch === key[0] && probe.test(source.slice(i, i + key.length + 4))) {
      return i + source.slice(i).indexOf(':');
    }
  }
  return -1;
}

// ── 5. Run ──────────────────────────────────────────────────────────────────

const roots = await loadSchemaRootFields();

/** @type {{level:string, rule:string, file:string, line:number, message:string}[]} */
const findings = [];
const advisories = [];
/** documentConstName → { vars:Set, file, line } — for the call-site check. */
const documentsByConst = new Map();

let documentCount = 0;
let operationCount = 0;

const allFiles = [];
for (const root of DOCUMENT_ROOTS) {
  allFiles.push(...(await collectSourceFiles(path.join(REPO_ROOT, root))));
}

for (const file of allFiles) {
  const source = await readFile(file, 'utf8');
  const rel = path.relative(REPO_ROOT, file);
  const ext = path.extname(file);

  const literals = ext === '.graphql' || ext === '.gql'
    ? [{ text: source, offset: 0 }]
    : extractGqlLiterals(source);
  if (literals.length === 0) continue;

  // The const each literal is assigned to, so a call site elsewhere can find
  // it: `export const UPDATE_BIRD = gql\`…\``.
  const constNames = [];
  const constRe = /(?:const|let|var)\s+([A-Z][A-Z0-9_]*)\s*=\s*(?:gql|graphql)\s*`/g;
  let cm;
  while ((cm = constRe.exec(source)) !== null) constNames.push(cm[1]);

  literals.forEach((literal, index) => {
    let doc;
    try {
      doc = parse(literal.text);
    } catch (err) {
      findings.push({
        level: 'error',
        rule: 'parse-error',
        file: rel,
        line: lineAt(source, literal.offset),
        message: `document does not parse: ${err.message.split('\n')[0]}`,
      });
      return;
    }
    documentCount += 1;

    const constName = constNames[index];
    const declaredHere = new Set();

    for (const op of doc.definitions) {
      if (op.kind !== 'OperationDefinition') continue;
      operationCount += 1;

      const opName = op.name?.value ?? '(anonymous)';
      const line = lineAt(source, literal.offset) + (op.loc ? literal.text.slice(0, op.loc.start).split('\n').length - 1 : 0);
      const where = `${opName}`;

      const declared = new Map();
      for (const def of op.variableDefinitions ?? []) {
        declared.set(def.variable.name.value, printType(def.type));
        declaredHere.add(def.variable.name.value);
      }
      const used = collectVariableUses(op.selectionSet);

      // (1) used but never declared — GraphQL rejects this one, but a
      //     document is cheap to check and this is where the class starts.
      for (const name of used) {
        if (!declared.has(name)) {
          findings.push({
            level: 'error', rule: 'undeclared-variable', file: rel, line,
            message: `${where}: $${name} is used but never declared`,
          });
        }
      }

      // (2) declared but never passed — silently discarded.
      for (const name of declared.keys()) {
        if (!used.has(name)) {
          findings.push({
            level: 'error', rule: 'unused-variable', file: rel, line,
            message: `${where}: $${name} is declared but never passed to a field — whatever the caller sets is dropped`,
          });
        }
      }

      // (3) root-field arguments against the gateway schema.
      const rootType = op.operation === 'mutation' ? 'Mutation'
        : op.operation === 'query' ? 'Query' : null;
      if (!rootType) continue;
      const schemaFields = roots.get(rootType);

      for (const sel of op.selectionSet.selections) {
        if (sel.kind !== 'Field') continue;
        const fieldName = sel.name.value;
        if (fieldName.startsWith('__')) continue;
        const schemaField = schemaFields.get(fieldName);
        if (!schemaField) {
          findings.push({
            level: 'error', rule: 'unknown-argument', file: rel, line,
            message: `${where}: the gateway declares no ${rootType.toLowerCase()} \`${fieldName}\``,
          });
          continue;
        }
        const passed = new Set();
        for (const arg of sel.arguments ?? []) {
          passed.add(arg.name.value);
          if (!schemaField.args.has(arg.name.value)) {
            findings.push({
              level: 'error', rule: 'unknown-argument', file: rel, line,
              message: `${where}: \`${fieldName}\` has no argument \`${arg.name.value}\` (${schemaField.module})`,
            });
          }
        }
        // (5) advisory: schema arguments this document never passes.
        const unpassed = [...schemaField.args.keys()].filter((a) => !passed.has(a));
        if (unpassed.length > 0) {
          advisories.push({
            level: 'info', rule: 'missing-argument', file: rel, line,
            message: `${where}: \`${fieldName}\` also accepts ${unpassed.map((a) => `${a}: ${schemaField.args.get(a)}`).join(', ')}`,
          });
        }
      }
    }

    if (constName) {
      documentsByConst.set(constName, { vars: declaredHere, file: rel });
    }
  });

}

// (4) call-site keys with no variable definition — the silent one. This runs
// after every document in every tree has been registered, because a call site
// and the document it names are almost always in different files.
for (const file of allFiles) {
  const ext = path.extname(file);
  if (ext === '.graphql' || ext === '.gql') continue;
  const source = await readFile(file, 'utf8');
  const rel = path.relative(REPO_ROOT, file);
  const bindings = collectHookBindings(source);
  for (const site of collectCallSites(source, bindings)) {
    const doc = documentsByConst.get(site.docName);
    if (!doc) continue; // document defined somewhere this scan cannot see
    for (const key of site.keys) {
      if (!doc.vars.has(key)) {
        findings.push({
          level: 'error', rule: 'undeclared-callsite-key', file: rel, line: site.line,
          message: `${site.docName} declares no $${key}, but this call passes \`${key}\` in variables — GraphQL drops it silently`,
        });
      }
    }
  }
}

// ── 6. Report ───────────────────────────────────────────────────────────────

if (AS_JSON) {
  console.log(JSON.stringify({ findings, advisories: SHOW_MISSING ? advisories : [] }, null, 2));
  process.exit(findings.length > 0 ? 1 : 0);
}

const byRule = new Map();
for (const f of findings) {
  if (!byRule.has(f.rule)) byRule.set(f.rule, []);
  byRule.get(f.rule).push(f);
}

for (const [rule, items] of [...byRule].sort()) {
  console.log(`\n${rule} (${items.length})`);
  for (const f of items.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)) {
    console.log(`  ${f.file}:${f.line}: ${f.message}`);
  }
}

if (SHOW_MISSING && advisories.length > 0) {
  console.log(`\nmissing-argument — advisory, never fails (${advisories.length})`);
  for (const a of advisories.sort((x, y) => x.file.localeCompare(y.file) || x.line - y.line)) {
    console.log(`  ${a.file}:${a.line}: ${a.message}`);
  }
}

const scope = `${documentCount} documents, ${operationCount} operations across ${DOCUMENT_ROOTS.length} trees`;
if (findings.length === 0) {
  console.log(`\ngql-arg-audit: clean — ${scope}.`);
  process.exit(0);
}
console.error(`\ngql-arg-audit: ${findings.length} finding(s) — ${scope}.`);
process.exit(1);
