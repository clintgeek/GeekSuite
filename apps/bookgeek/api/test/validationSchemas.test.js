/**
 * Unit tests for src/validation/schemas/** (TODO_ORDER #22, bookgeek slice).
 *
 * Per schema: a passing input, an unknown-key rejection (or, for the query
 * schemas — which are deliberately NOT `.strict()`, see covers.js/
 * importJobs.js's own comments — a documented "extra keys are silently
 * dropped, not rejected" pass-through instead), and a bounds rejection.
 *
 * No HTTP here; that's validationRoute.test.js. Pure `schema.safeParse()`
 * calls, same style as fitnessgeek's/storygeek's own schema unit suites.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { bookIdParamsSchema } from "../src/validation/schemas/books.js";
import {
  downloadParamsSchema,
  DOWNLOAD_FORMATS,
} from "../src/validation/schemas/kindle.js";
import { mergeBodySchema } from "../src/validation/schemas/enrichMerge.js";
import {
  searchCoversQuerySchema,
  manualCoverBodySchema,
  COVER_PROVIDERS,
} from "../src/validation/schemas/covers.js";
import {
  createBasketBodySchema,
  MAX_BOOKS_PER_BASKET,
} from "../src/validation/schemas/deviceBaskets.js";
import { calibreRescanQuerySchema } from "../src/validation/schemas/importJobs.js";

// ---------------------------------------------------------------------------
// books.js — bookIdParamsSchema
// ---------------------------------------------------------------------------

describe("bookIdParamsSchema", () => {
  test("passes a plain Mongo-looking id", () => {
    const result = bookIdParamsSchema.safeParse({ id: "64f0c8b2e1a2b3c4d5e6f7a8" });
    assert.equal(result.success, true);
    assert.equal(result.data.id, "64f0c8b2e1a2b3c4d5e6f7a8");
  });

  test("passes a non-ObjectId string too — ids are checked as bounded strings, not ObjectIds", () => {
    const result = bookIdParamsSchema.safeParse({ id: "not-an-object-id" });
    assert.equal(result.success, true);
  });

  test("rejects an unknown param key (strict)", () => {
    const result = bookIdParamsSchema.safeParse({ id: "abc", extra: "nope" });
    assert.equal(result.success, false);
  });

  test("rejects an empty id", () => {
    const result = bookIdParamsSchema.safeParse({ id: "" });
    assert.equal(result.success, false);
  });

  test("rejects an id over the 64-char bound", () => {
    const result = bookIdParamsSchema.safeParse({ id: "a".repeat(65) });
    assert.equal(result.success, false);
  });

  test("accepts an id at exactly the 64-char bound", () => {
    const result = bookIdParamsSchema.safeParse({ id: "a".repeat(64) });
    assert.equal(result.success, true);
  });
});

// ---------------------------------------------------------------------------
// kindle.js — downloadParamsSchema
// ---------------------------------------------------------------------------

describe("downloadParamsSchema", () => {
  test("passes a valid id + format", () => {
    const result = downloadParamsSchema.safeParse({ id: "abc123", format: "epub" });
    assert.equal(result.success, true);
    assert.equal(result.data.format, "epub");
  });

  test("lowercases format before enum-checking it", () => {
    const result = downloadParamsSchema.safeParse({ id: "abc123", format: "EPUB" });
    assert.equal(result.success, true);
    assert.equal(result.data.format, "epub");
  });

  test("covers every format the handler's own hand-check accepts", () => {
    for (const format of DOWNLOAD_FORMATS) {
      const result = downloadParamsSchema.safeParse({ id: "abc123", format });
      assert.equal(result.success, true, `expected ${format} to pass`);
    }
    assert.deepEqual(DOWNLOAD_FORMATS, ["epub", "azw3", "mobi"]);
  });

  test("rejects an unsupported format (bounds: enum)", () => {
    const result = downloadParamsSchema.safeParse({ id: "abc123", format: "pdf" });
    assert.equal(result.success, false);
  });

  test("rejects an unknown param key (strict)", () => {
    const result = downloadParamsSchema.safeParse({ id: "abc123", format: "epub", extra: "x" });
    assert.equal(result.success, false);
  });
});

// ---------------------------------------------------------------------------
// enrichMerge.js — mergeBodySchema
// ---------------------------------------------------------------------------

describe("mergeBodySchema", () => {
  test("passes two ids", () => {
    const result = mergeBodySchema.safeParse({ primaryId: "aaa", secondaryId: "bbb" });
    assert.equal(result.success, true);
  });

  test("rejects a missing secondaryId (bounds: required)", () => {
    const result = mergeBodySchema.safeParse({ primaryId: "aaa" });
    assert.equal(result.success, false);
  });

  test("rejects an unknown body key (strict) — e.g. a stray 'force' flag", () => {
    const result = mergeBodySchema.safeParse({
      primaryId: "aaa",
      secondaryId: "bbb",
      force: true,
    });
    assert.equal(result.success, false);
  });

  test("rejects an id over the 64-char bound", () => {
    const result = mergeBodySchema.safeParse({
      primaryId: "a".repeat(65),
      secondaryId: "bbb",
    });
    assert.equal(result.success, false);
  });
});

// ---------------------------------------------------------------------------
// covers.js — searchCoversQuerySchema (not .strict() — see file header)
// ---------------------------------------------------------------------------

describe("searchCoversQuerySchema", () => {
  test("passes with no query at all (q is optional)", () => {
    const result = searchCoversQuerySchema.safeParse({});
    assert.equal(result.success, true);
  });

  test("passes a bounded q", () => {
    const result = searchCoversQuerySchema.safeParse({ q: "Dune" });
    assert.equal(result.success, true);
    assert.equal(result.data.q, "Dune");
  });

  test("silently drops an unrecognized query key instead of rejecting (deliberately not strict)", () => {
    const result = searchCoversQuerySchema.safeParse({ q: "Dune", utm_source: "newsletter" });
    assert.equal(result.success, true);
    assert.equal("utm_source" in result.data, false);
  });

  test("rejects q over the 300-char bound", () => {
    const result = searchCoversQuerySchema.safeParse({ q: "x".repeat(301) });
    assert.equal(result.success, false);
  });
});

// ---------------------------------------------------------------------------
// covers.js — manualCoverBodySchema
// ---------------------------------------------------------------------------

describe("manualCoverBodySchema", () => {
  test("passes an openlibrary pick with a numeric coverId", () => {
    const result = manualCoverBodySchema.safeParse({ provider: "openlibrary", coverId: 12345 });
    assert.equal(result.success, true);
  });

  test("passes a googlebooks pick with a coverUrl", () => {
    const result = manualCoverBodySchema.safeParse({
      provider: "googlebooks",
      coverUrl: "https://books.google.com/cover.jpg",
    });
    assert.equal(result.success, true);
  });

  test("passes an empty body — provider defaults to openlibrary in the handler", () => {
    const result = manualCoverBodySchema.safeParse({});
    assert.equal(result.success, true);
  });

  test("rejects an unsupported provider (bounds: enum)", () => {
    const result = manualCoverBodySchema.safeParse({ provider: "flickr" });
    assert.equal(result.success, false);
    assert.deepEqual(COVER_PROVIDERS, ["openlibrary", "googlebooks"]);
  });

  test("rejects an unknown body key (strict)", () => {
    const result = manualCoverBodySchema.safeParse({ provider: "openlibrary", extra: "x" });
    assert.equal(result.success, false);
  });

  test("rejects a coverUrl over the 2000-char bound", () => {
    const result = manualCoverBodySchema.safeParse({ coverUrl: "https://x.test/" + "a".repeat(2000) });
    assert.equal(result.success, false);
  });
});

// ---------------------------------------------------------------------------
// deviceBaskets.js — createBasketBodySchema
// ---------------------------------------------------------------------------

describe("createBasketBodySchema", () => {
  test("passes a single bookId with no device (defaults to kindle downstream)", () => {
    const result = createBasketBodySchema.safeParse({ bookIds: ["abc123"] });
    assert.equal(result.success, true);
  });

  test("passes exactly MAX_BOOKS_PER_BASKET entries", () => {
    const bookIds = Array.from({ length: MAX_BOOKS_PER_BASKET }, (_, i) => `id-${i}`);
    const result = createBasketBodySchema.safeParse({ bookIds });
    assert.equal(result.success, true);
    assert.equal(MAX_BOOKS_PER_BASKET, 50);
  });

  test("rejects an empty bookIds array (bounds: min 1)", () => {
    const result = createBasketBodySchema.safeParse({ bookIds: [] });
    assert.equal(result.success, false);
  });

  test("rejects more than MAX_BOOKS_PER_BASKET entries", () => {
    const bookIds = Array.from({ length: MAX_BOOKS_PER_BASKET + 1 }, (_, i) => `id-${i}`);
    const result = createBasketBodySchema.safeParse({ bookIds });
    assert.equal(result.success, false);
  });

  test("rejects a missing bookIds field entirely", () => {
    const result = createBasketBodySchema.safeParse({ device: "kindle" });
    assert.equal(result.success, false);
  });

  test("rejects an unknown body key (strict)", () => {
    const result = createBasketBodySchema.safeParse({ bookIds: ["abc"], extra: "x" });
    assert.equal(result.success, false);
  });

  test("shape only — a non-ObjectId-looking bookId still passes zod (the handler's own mongoose.isValidObjectId check catches that)", () => {
    const result = createBasketBodySchema.safeParse({ bookIds: ["not-an-object-id"] });
    assert.equal(result.success, true);
  });
});

// ---------------------------------------------------------------------------
// importJobs.js — calibreRescanQuerySchema (not .strict() — see file header)
// ---------------------------------------------------------------------------

describe("calibreRescanQuerySchema", () => {
  test("passes with no query at all (limit is optional; handler defaults to 1000)", () => {
    const result = calibreRescanQuerySchema.safeParse({});
    assert.equal(result.success, true);
  });

  test("coerces a query-string limit into a number", () => {
    const result = calibreRescanQuerySchema.safeParse({ limit: "50" });
    assert.equal(result.success, true);
    assert.equal(result.data.limit, 50);
    assert.equal(typeof result.data.limit, "number");
  });

  test("rejects a zero limit (bounds: positive) — previously silently fell back to the 1000 default", () => {
    const result = calibreRescanQuerySchema.safeParse({ limit: "0" });
    assert.equal(result.success, false);
  });

  test("rejects a negative limit", () => {
    const result = calibreRescanQuerySchema.safeParse({ limit: "-5" });
    assert.equal(result.success, false);
  });

  test("rejects a non-numeric limit", () => {
    const result = calibreRescanQuerySchema.safeParse({ limit: "lots" });
    assert.equal(result.success, false);
  });

  test("silently drops an unrecognized query key instead of rejecting (deliberately not strict)", () => {
    const result = calibreRescanQuerySchema.safeParse({ limit: "10", debug: "1" });
    assert.equal(result.success, true);
    assert.equal("debug" in result.data, false);
  });
});
