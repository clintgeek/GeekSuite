import { test } from "node:test";
import assert from "node:assert/strict";
import { WORDS } from "../src/wordlist.js";
import { generateSlug, normalizeSlug } from "../src/slug.js";

// --- wordlist tests ---

test("wordlist has at least 1024 words", () => {
  assert.ok(WORDS.length >= 1024, `Expected ≥1024 words, got ${WORDS.length}`);
});

test("all words match /^[a-z]{3,7}$/", () => {
  const bad = WORDS.filter((w) => !/^[a-z]{3,7}$/.test(w));
  assert.deepEqual(bad, [], `Bad words: ${bad.join(", ")}`);
});

test("no duplicate words", () => {
  const dupes = WORDS.filter((w, i) => WORDS.indexOf(w) !== i);
  assert.deepEqual(dupes, [], `Duplicates: ${dupes.join(", ")}`);
});

test("WORDS is frozen", () => {
  assert.ok(Object.isFrozen(WORDS), "WORDS should be a frozen array");
});

// --- generateSlug tests ---

test("generateSlug returns 4-word hyphen-joined string by default", () => {
  const slug = generateSlug();
  const parts = slug.split("-");
  assert.equal(parts.length, 4, `Expected 4 parts, got ${parts.length}: ${slug}`);
});

test("generateSlug result is all lowercase", () => {
  const slug = generateSlug();
  assert.equal(slug, slug.toLowerCase(), "Slug should be lowercase");
});

test("all words in generated slug come from WORDS", () => {
  // Run many times to catch any out-of-bounds issue
  const wordSet = new Set(WORDS);
  for (let i = 0; i < 200; i++) {
    const parts = generateSlug().split("-");
    for (const part of parts) {
      assert.ok(wordSet.has(part), `Word "${part}" not in WORDS`);
    }
  }
});

test("generateSlug respects custom wordCount", () => {
  assert.equal(generateSlug(2).split("-").length, 2);
  assert.equal(generateSlug(6).split("-").length, 6);
});

test("generateSlug produces different values across calls (statistical)", () => {
  const slugs = new Set(Array.from({ length: 50 }, () => generateSlug()));
  // Astronomically unlikely to get the same slug twice in 50 tries
  assert.ok(slugs.size > 1, "generateSlug should produce varied output");
});

// --- normalizeSlug tests ---

test("normalizeSlug lowercases input", () => {
  assert.equal(normalizeSlug("Soft-Apple-Chair-Lamp"), "soft-apple-chair-lamp");
});

test("normalizeSlug trims leading/trailing whitespace", () => {
  assert.equal(normalizeSlug("  soft-apple  "), "soft-apple");
});

test("normalizeSlug collapses whitespace to hyphens", () => {
  assert.equal(normalizeSlug("soft apple chair lamp"), "soft-apple-chair-lamp");
});

test("normalizeSlug collapses underscores to hyphens", () => {
  assert.equal(normalizeSlug("soft_apple_chair_lamp"), "soft-apple-chair-lamp");
});

test("normalizeSlug collapses mixed whitespace/underscores to single hyphen", () => {
  // A run of spaces + underscores is a single separator → single hyphen
  assert.equal(normalizeSlug("soft  _  apple"), "soft-apple");
  // Tabs and multiple spaces collapse the same way
  assert.equal(normalizeSlug("soft   apple\tchair"), "soft-apple-chair");
});

test("normalizeSlug handles already-normalized slug unchanged", () => {
  const slug = "soft-apple-chair-lamp";
  assert.equal(normalizeSlug(slug), slug);
});
