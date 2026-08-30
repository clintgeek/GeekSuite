/**
 * Unit tests for src/deviceBasket.js — pure-function exports only.
 * No DB, no HTTP (supertest not a dependency).
 *
 * renderBasketPage is NOT exported from deviceBasket.js, so HTML rendering
 * tests are limited to what can be observed through escapeHtml + the
 * constants. See report for detail.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BASKET_TTL_MS,
  DEVICE_FORMAT_MAP,
  DEVICE_WORD_PATTERN,
  WORD_ATTEMPT_LIMIT,
  WORD_ATTEMPT_WINDOW_MS,
  checkWordRateLimit,
  escapeHtml,
  isValidDeviceWord,
  minutesRemaining,
  normalizeDeviceWord,
} from "../src/deviceBasket.js";

// ---------------------------------------------------------------------------
// escapeHtml
// ---------------------------------------------------------------------------

test("escapeHtml: escapes < and >", () => {
  assert.equal(escapeHtml("<b>"), "&lt;b&gt;");
});

test("escapeHtml: escapes a hostile script tag completely", () => {
  const out = escapeHtml("<script>alert(1)</script>");
  assert.ok(!out.includes("<"), "must not contain raw <");
  assert.ok(!out.includes(">"), "must not contain raw >");
  assert.equal(out, "&lt;script&gt;alert(1)&lt;/script&gt;");
});

test("escapeHtml: escapes apostrophes to &#39;", () => {
  assert.equal(escapeHtml("it's fine"), "it&#39;s fine");
});

test("escapeHtml: escapes double quotes to &quot;", () => {
  assert.equal(escapeHtml('Say "hello"'), "Say &quot;hello&quot;");
});

test("escapeHtml: escapes ampersands to &amp;", () => {
  assert.equal(escapeHtml("Tom & Jerry"), "Tom &amp; Jerry");
});

test("escapeHtml: ampersand escaped before other replacements (no double-escape of & in output)", () => {
  // & must become &amp; — not &&amp; or similar
  const out = escapeHtml("a & b");
  assert.equal(out, "a &amp; b");
  // Verify the count: exactly one &amp; present
  assert.equal((out.match(/&amp;/g) || []).length, 1);
});

test("escapeHtml: already-escaped input is double-mangled (implementation behavior)", () => {
  // The function is a raw escaper, not idempotent.
  // "&amp;" → "&amp;amp;" because & → &amp; first.
  assert.equal(escapeHtml("&amp;"), "&amp;amp;");
});

test("escapeHtml: passes through plain ASCII unchanged", () => {
  assert.equal(escapeHtml("Hello World 123"), "Hello World 123");
});

test("escapeHtml: Unicode passes through unchanged", () => {
  const unicode = "Café Münchhausen 日本";
  assert.equal(escapeHtml(unicode), unicode);
});

test("escapeHtml: Unicode with embedded HTML chars escapes the HTML, preserves Unicode", () => {
  const out = escapeHtml("Café <em>Münchhausen</em> 日本");
  assert.equal(out, "Café &lt;em&gt;Münchhausen&lt;/em&gt; 日本");
});

test("escapeHtml: null returns empty string", () => {
  assert.equal(escapeHtml(null), "");
});

test("escapeHtml: undefined returns empty string", () => {
  assert.equal(escapeHtml(undefined), "");
});

test("escapeHtml: empty string returns empty string", () => {
  assert.equal(escapeHtml(""), "");
});

test("escapeHtml: all hostile chars together", () => {
  // Verify each replacement fires in a combined input
  const out = escapeHtml(`<div class="x" id='y'>a & b</div>`);
  assert.ok(!out.includes("<"));
  assert.ok(!out.includes(">"));
  assert.ok(!out.includes('"'));
  assert.ok(!out.includes("'"));
  // ampersand in "a & b" → &amp;
  assert.ok(out.includes("&amp;"));
  // attribute values escaped
  assert.ok(out.includes("&quot;"));
  assert.ok(out.includes("&#39;"));
});

// ---------------------------------------------------------------------------
// minutesRemaining
// ---------------------------------------------------------------------------

test("minutesRemaining: future date 30 minutes from now → 30", () => {
  const now = Date.now();
  const expiresAt = new Date(now + 30 * 60 * 1000);
  assert.equal(minutesRemaining(expiresAt, now), 30);
});

test("minutesRemaining: future date 90 seconds from now → 2 (ceil)", () => {
  const now = Date.now();
  const expiresAt = new Date(now + 90_000); // 1.5 minutes
  assert.equal(minutesRemaining(expiresAt, now), 2);
});

test("minutesRemaining: exactly 1 minute from now → 1", () => {
  const now = Date.now();
  const expiresAt = new Date(now + 60_000);
  assert.equal(minutesRemaining(expiresAt, now), 1);
});

test("minutesRemaining: boundary — 59 seconds from now → 1 (Math.max floors to 1, not 0)", () => {
  const now = Date.now();
  const expiresAt = new Date(now + 59_000); // 0.98 minutes → ceil → 1 → max(1,1)=1
  assert.equal(minutesRemaining(expiresAt, now), 1);
});

test("minutesRemaining: 1 ms from now → 1 (never returns 0 for a future date)", () => {
  const now = Date.now();
  const expiresAt = new Date(now + 1);
  assert.equal(minutesRemaining(expiresAt, now), 1);
});

test("minutesRemaining: past date → 0", () => {
  const now = Date.now();
  const expiresAt = new Date(now - 60_000);
  assert.equal(minutesRemaining(expiresAt, now), 0);
});

test("minutesRemaining: expiresAt equals now (ms <= 0) → 0", () => {
  const now = Date.now();
  const expiresAt = new Date(now);
  assert.equal(minutesRemaining(expiresAt, now), 0);
});

test("minutesRemaining: accepts Date object and number equally", () => {
  const now = Date.now();
  const future = now + 2 * 60_000;
  assert.equal(minutesRemaining(new Date(future), now), 2);
  assert.equal(minutesRemaining(future, now), 2);
});

test("minutesRemaining: invalid date → 0", () => {
  assert.equal(minutesRemaining(new Date("not-a-date"), Date.now()), 0);
});

// ---------------------------------------------------------------------------
// DEVICE_FORMAT_MAP
// ---------------------------------------------------------------------------

test("DEVICE_FORMAT_MAP: kindle maps to mobi", () => {
  assert.equal(DEVICE_FORMAT_MAP["kindle"], "mobi");
});

test("DEVICE_FORMAT_MAP: unknown device is not present", () => {
  assert.equal(DEVICE_FORMAT_MAP["unknown"], undefined);
  assert.equal(DEVICE_FORMAT_MAP["ipad"], undefined);
  assert.equal(DEVICE_FORMAT_MAP["nook"], undefined);
});

test("DEVICE_FORMAT_MAP: is a plain object with at least one entry", () => {
  assert.ok(typeof DEVICE_FORMAT_MAP === "object" && DEVICE_FORMAT_MAP !== null);
  assert.ok(Object.keys(DEVICE_FORMAT_MAP).length >= 1);
});

// ---------------------------------------------------------------------------
// BASKET_TTL_MS
// ---------------------------------------------------------------------------

test("BASKET_TTL_MS: is a positive finite number", () => {
  assert.ok(Number.isFinite(BASKET_TTL_MS), "BASKET_TTL_MS must be finite");
  assert.ok(BASKET_TTL_MS > 0, "BASKET_TTL_MS must be positive");
});

test("BASKET_TTL_MS: defaults to 30 minutes (1 800 000 ms) when env var is unset", () => {
  // DEVICE_BASKET_TTL_MINUTES is read at import time.
  // The test runner does not set it, so the default of 30 minutes applies.
  assert.equal(
    BASKET_TTL_MS,
    30 * 60 * 1000,
    `Expected 1800000, got ${BASKET_TTL_MS}`
  );
});

// ---------------------------------------------------------------------------
// normalizeDeviceWord
// ---------------------------------------------------------------------------

test("normalizeDeviceWord: trims surrounding whitespace", () => {
  assert.equal(normalizeDeviceWord("  otter  "), "otter");
});

test("normalizeDeviceWord: lowercases", () => {
  assert.equal(normalizeDeviceWord("OtTeR"), "otter");
});

test("normalizeDeviceWord: null/undefined/empty become empty string", () => {
  assert.equal(normalizeDeviceWord(null), "");
  assert.equal(normalizeDeviceWord(undefined), "");
  assert.equal(normalizeDeviceWord(""), "");
  assert.equal(normalizeDeviceWord("   "), "");
});

test("normalizeDeviceWord: non-strings are coerced, not thrown on", () => {
  assert.equal(normalizeDeviceWord(12345), "12345");
});

// ---------------------------------------------------------------------------
// DEVICE_WORD_PATTERN / isValidDeviceWord
// ---------------------------------------------------------------------------

test("DEVICE_WORD_PATTERN: matches a plain 3-char lowercase word", () => {
  assert.ok(DEVICE_WORD_PATTERN.test("cat"));
});

test("DEVICE_WORD_PATTERN: rejects a 2-char word (minimum is 3)", () => {
  assert.equal(DEVICE_WORD_PATTERN.test("ca"), false);
});

test("DEVICE_WORD_PATTERN: accepts exactly 24 chars, rejects 25", () => {
  assert.ok(DEVICE_WORD_PATTERN.test("a".repeat(24)));
  assert.equal(DEVICE_WORD_PATTERN.test("a".repeat(25)), false);
});

test("DEVICE_WORD_PATTERN: must start with a letter", () => {
  assert.equal(DEVICE_WORD_PATTERN.test("1cat"), false);
  assert.equal(DEVICE_WORD_PATTERN.test("-cat"), false);
});

test("DEVICE_WORD_PATTERN: allows digits and hyphens after the first char", () => {
  assert.ok(DEVICE_WORD_PATTERN.test("cat-99"));
  assert.ok(DEVICE_WORD_PATTERN.test("a1-"));
});

test("DEVICE_WORD_PATTERN: rejects uppercase (normalize first)", () => {
  assert.equal(DEVICE_WORD_PATTERN.test("Cat"), false);
});

test("DEVICE_WORD_PATTERN: rejects spaces, underscores and other punctuation", () => {
  assert.equal(DEVICE_WORD_PATTERN.test("my cat"), false);
  assert.equal(DEVICE_WORD_PATTERN.test("my_cat"), false);
  assert.equal(DEVICE_WORD_PATTERN.test("cat!"), false);
  assert.equal(DEVICE_WORD_PATTERN.test("cat.dog"), false);
});

test("DEVICE_WORD_PATTERN: rejects non-ASCII letters", () => {
  assert.equal(DEVICE_WORD_PATTERN.test("café"), false);
});

test("DEVICE_WORD_PATTERN: is anchored (no newline smuggling)", () => {
  assert.equal(DEVICE_WORD_PATTERN.test("cat\nevil"), false);
});

test("isValidDeviceWord: normalizes before matching", () => {
  assert.equal(isValidDeviceWord("  OtTeR  "), true);
  assert.equal(isValidDeviceWord("OTTER-7"), true);
});

test("isValidDeviceWord: empty and whitespace-only are invalid", () => {
  assert.equal(isValidDeviceWord(""), false);
  assert.equal(isValidDeviceWord("   "), false);
  assert.equal(isValidDeviceWord(null), false);
  assert.equal(isValidDeviceWord(undefined), false);
});

test("isValidDeviceWord: too short / too long", () => {
  assert.equal(isValidDeviceWord("ab"), false);
  assert.equal(isValidDeviceWord("abc"), true);
  assert.equal(isValidDeviceWord("a".repeat(24)), true);
  assert.equal(isValidDeviceWord("a".repeat(25)), false);
});

// ---------------------------------------------------------------------------
// checkWordRateLimit
// ---------------------------------------------------------------------------

test("checkWordRateLimit: allows exactly WORD_ATTEMPT_LIMIT attempts, then blocks", () => {
  const key = "test-ip-a";
  const now = Date.now();
  for (let i = 0; i < WORD_ATTEMPT_LIMIT; i++) {
    assert.equal(checkWordRateLimit(key, now), true, `attempt ${i + 1} allowed`);
  }
  assert.equal(checkWordRateLimit(key, now), false, "attempt over limit blocked");
});

test("checkWordRateLimit: window reset lets attempts through again", () => {
  const key = "test-ip-b";
  const now = Date.now();
  for (let i = 0; i < WORD_ATTEMPT_LIMIT + 3; i++) checkWordRateLimit(key, now);
  assert.equal(checkWordRateLimit(key, now), false);
  assert.equal(checkWordRateLimit(key, now + WORD_ATTEMPT_WINDOW_MS), true);
});

test("checkWordRateLimit: keys are independent", () => {
  const now = Date.now();
  for (let i = 0; i < WORD_ATTEMPT_LIMIT + 1; i++) checkWordRateLimit("test-ip-c", now);
  assert.equal(checkWordRateLimit("test-ip-c", now), false);
  assert.equal(checkWordRateLimit("test-ip-d", now), true);
});

test("checkWordRateLimit: missing key falls back to a shared bucket without throwing", () => {
  assert.equal(typeof checkWordRateLimit(undefined, Date.now()), "boolean");
});

test("WORD_ATTEMPT_LIMIT / WINDOW: 10 attempts per minute", () => {
  assert.equal(WORD_ATTEMPT_LIMIT, 10);
  assert.equal(WORD_ATTEMPT_WINDOW_MS, 60 * 1000);
});
