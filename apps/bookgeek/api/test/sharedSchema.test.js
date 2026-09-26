/**
 * sharedSchema.test.js — the bookgeek half of the shared-schema tripwire
 * (DOCS/BOOKGEEK_CLEANUP_PLAN.md, Phase A step 2).
 *
 * `Book` and `Profile` are written by two processes against the same
 * collections: this API and basegeek's GraphQL gateway. Mongoose strict mode
 * silently drops a path a schema doesn't declare, so both now build from
 * packages/schemas/bookgeek/{book,profile}.js. This suite fails if this API's
 * models stop doing that, or if either model file grows a schema of its own.
 *
 * Hermetic: no Mongo, no network. The cross-process comparison and the real
 * write-through (mongoose 7 here ⇄ mongoose 8 there) live in
 * apps/basegeek/packages/api/src/__tests__/bookgeekSchemaParity.test.js.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";

import { Book } from "../src/models/book.js";
import { Profile } from "../src/models/profile.js";
import bookShared from "../../../../packages/schemas/bookgeek/book.js";
import profileShared from "../../../../packages/schemas/bookgeek/profile.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, "../../../..");

function describePath(p) {
  const o = p.options || {};
  return JSON.stringify({
    instance: p.instance,
    default: typeof o.default === "function" ? "[fn]" : o.default,
    required: !!o.required,
    index: !!o.index,
    unique: !!o.unique,
    sparse: !!o.sparse,
    trim: !!o.trim,
    lowercase: !!o.lowercase,
    min: o.min,
    max: o.max,
  });
}

function deepPaths(schema, prefix = "") {
  const out = {};
  for (const [k, p] of Object.entries(schema.paths)) {
    if (!prefix && k === "__v") continue; // added when a model compiles, not by the definition
    out[prefix + k] = describePath(p);
    if (p.schema) Object.assign(out, deepPaths(p.schema, `${prefix}${k}.$.`));
  }
  return out;
}

const indexes = (schema) =>
  schema
    .indexes()
    .map(([keys, opts = {}]) => JSON.stringify([keys, { unique: !!opts.unique, sparse: !!opts.sparse }]))
    .sort();

const CASES = [
  {
    name: "Book",
    Model: Book,
    create: bookShared.createBookSchema,
    files: [
      "apps/bookgeek/api/src/models/book.js",
      "apps/basegeek/packages/api/src/graphql/bookgeek/models/book.js",
    ],
    specifier: "schemas/bookgeek/book",
    collection: "books",
  },
  {
    name: "Profile",
    Model: Profile,
    create: profileShared.createBookProfileSchema,
    files: [
      "apps/bookgeek/api/src/models/profile.js",
      "apps/basegeek/packages/api/src/graphql/bookgeek/models/profile.js",
    ],
    specifier: "schemas/bookgeek/profile",
    collection: "profiles",
  },
];

for (const c of CASES) {
  describe(`${c.name} builds from the shared definition`, () => {
    test("every path, nested ones included, matches the shared schema", () => {
      assert.deepEqual(deepPaths(c.Model.schema), deepPaths(c.create(mongoose)));
    });

    test("indexes and options match the shared schema", () => {
      assert.deepEqual(indexes(c.Model.schema), indexes(c.create(mongoose)));
      assert.equal(c.Model.schema.options.timestamps, true);
      assert.equal(c.Model.schema.options.strict, true);
      assert.equal(c.Model.collection.name, c.collection);
    });

    test("neither writer's model file declares a schema of its own", () => {
      for (const rel of c.files) {
        const src = fs.readFileSync(path.join(REPO, rel), "utf8");
        assert.ok(src.includes(c.specifier), `${rel} must import ${c.specifier}`);
        assert.ok(!/new\s+mongoose\.Schema\s*\(/.test(src), `${rel} must not declare its own schema`);
      }
    });
  });
}

describe("strict mode drops what the shared schema doesn't declare", () => {
  test("an unknown path is not kept on a Book (the failure mode this guards against)", () => {
    const b = new Book({ title: "probe", notAField: "x" });
    assert.equal(b.toObject().notAField, undefined);
    assert.equal(b.toObject().title, "probe");
  });

  test("the Profile keeps its trim/lowercase deviceWord and the Book its sub-document shapes", () => {
    const p = new Profile({ userId: "u", deviceWord: "  Probe-Word " });
    assert.equal(p.deviceWord, "probe-word");
    const b = new Book({ title: "t", files: [{ format: "epub", path: "a/b.epub" }], series: { name: "S", index: 2 } });
    assert.equal(b.toObject().files[0]._id, undefined);
    assert.equal(b.toObject().series._id, undefined);
  });
});
