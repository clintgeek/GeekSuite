/**
 * Optional metadata from Tankarr's HTTP API (2026-11-16), for the comics scan.
 *
 * The FILES always come from the folder walk (services/comicsFolder.js); this
 * only adds what a filename cannot say: the description, the year, the kind
 * (manga or comic) and, when a folder has no image of its own, the artwork.
 *
 * Rules, all of them here:
 *   - ONE list request per scan (`GET {TANKARR_URL}/api/manga`), 5 s timeout.
 *   - Any failure — unset URL, network error, timeout, non-200, not JSON, not
 *     an array — resolves to null and the scan carries on from filenames.
 *     Nothing here throws.
 *   - Everything in the answer is untrusted: types are checked, strings are
 *     capped, and no API string ever becomes part of a filesystem path (the
 *     artwork file is named by a hash this process computes).
 *   - GET only. BookGeek never writes to Tankarr.
 *
 * `TANKARR_API_KEY` is optional. Tankarr's openapi.json declared no security
 * scheme when this was written, so the header is the *arr convention
 * (`X-Api-Key`) — an assumption, sent only when the key is set.
 */
import crypto from "crypto";

export const TANKARR_TIMEOUT_MS = 5000;
const MAX_SERIES = 5000;
const MAX_BODY_BYTES = 32 * 1024 * 1024;
const MAX_ARTWORK_BYTES = 8 * 1024 * 1024;
const ARTWORK_PATH = /^\/api\/metadata\/artwork\/[A-Za-z0-9._~%/-]{1,300}(\?[A-Za-z0-9._~%&=-]{0,300})?$/;

/** Case-, accent- and punctuation-insensitive: "DEATH NOTE" and "Death Note!" are one title. */
export function normalizeTitle(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

const cleanString = (value, max) => {
  if (typeof value !== "string") return "";
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, max);
};

/** The shared tag for a Tankarr `metadata.content_kind`; null when the kind says nothing we know. */
export function tagForContentKind(kind) {
  const k = cleanString(kind, 40).toLowerCase().replace(/[\s_-]+/g, " ");
  if (!k) return null;
  if (k === "manga") return "Manga";
  if (["comic", "comics", "comic book", "graphic novel"].includes(k)) return "Comics";
  return null;
}

/** One API series, reduced to the few validated fields the scan uses. Null when it has no usable title. */
export function cleanSeries(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const title = cleanString(raw.title, 300);
  if (!title) return null;
  const authors = Array.isArray(raw.authors)
    ? [...new Set(raw.authors.map((a) => cleanString(a, 200)).filter(Boolean))].slice(0, 10)
    : [];
  const year = Number.isInteger(raw.year) && raw.year >= 1800 && raw.year <= 2200 ? raw.year : null;
  const meta = raw.metadata && typeof raw.metadata === "object" && !Array.isArray(raw.metadata) ? raw.metadata : {};
  const artwork =
    typeof raw.artwork_url === "string" && ARTWORK_PATH.test(raw.artwork_url) && !raw.artwork_url.includes("..")
      ? raw.artwork_url
      : "";
  const titles = [title, cleanString(raw.metadata_title, 300), cleanString(raw.source_title, 300)].filter(Boolean);
  return {
    id: cleanString(raw.id, 100),
    title,
    titles,
    authors,
    description: cleanString(raw.description, 5000),
    year,
    tag: tagForContentKind(meta.content_kind),
    artworkPath: artwork,
  };
}

/**
 * Index a raw `/api/manga` payload by normalized title. A title two different
 * series share is dropped from the index: a wrong match is worse than none.
 * Returns null for a payload that is not a list at all.
 */
export function indexSeries(payload) {
  if (!Array.isArray(payload)) return null;
  const index = new Map();
  const clashes = new Set();
  for (const raw of payload.slice(0, MAX_SERIES)) {
    const series = cleanSeries(raw);
    if (!series) continue;
    for (const key of new Set(series.titles.map(normalizeTitle).filter(Boolean))) {
      const held = index.get(key);
      if (held && held !== series) clashes.add(key);
      else index.set(key, series);
    }
  }
  for (const key of clashes) index.delete(key);
  return index;
}

function tankarrBase(env) {
  const raw = String(env.TANKARR_URL || "").trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url;
  } catch {
    return null;
  }
}

function requestHeaders(env, accept) {
  const headers = { Accept: accept };
  const key = String(env.TANKARR_API_KEY || "").trim();
  if (key) headers["X-Api-Key"] = key;
  return headers;
}

/**
 * The series list, indexed by normalized title — or null (off, down, slow or
 * malformed), in which case the scan is filename-only. Logs once on failure.
 */
export async function loadTankarrSeries({ env = process.env, fetchImpl = globalThis.fetch, logger = null } = {}) {
  const base = tankarrBase(env);
  if (!base) return null;
  try {
    const res = await fetchImpl(new URL("/api/manga", base), {
      method: "GET",
      headers: requestHeaders(env, "application/json"),
      redirect: "error",
      signal: AbortSignal.timeout(TANKARR_TIMEOUT_MS),
    });
    if (!res || !res.ok) throw new Error(`HTTP ${res?.status ?? "?"}`);
    const text = await res.text();
    if (text.length > MAX_BODY_BYTES) throw new Error("answer too large");
    const index = indexSeries(JSON.parse(text));
    if (!index) throw new Error("unexpected shape (not a list)");
    return index;
  } catch (err) {
    logger?.warn?.({ err: err?.message }, "[bookgeek] comics scan: Tankarr API unavailable; using filenames only");
    return null;
  }
}

const IMAGE_MAGIC = [
  { ext: "jpg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: "png", test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { ext: "webp", test: (b) => b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP" },
];

/** A filename stem for a series' artwork that owes nothing to any API string. */
export function artworkStem(series) {
  return crypto.createHash("sha1").update(`${series.id}\n${series.title}`).digest("hex").slice(0, 20);
}

/**
 * A series' artwork as `{ buffer, ext }`, or null. Only called for a series
 * whose folder has no image of its own. The URL is Tankarr's own artwork
 * route on Tankarr's own origin, nothing else; the bytes must be an image.
 */
export async function fetchTankarrArtwork(series, { env = process.env, fetchImpl = globalThis.fetch, logger = null } = {}) {
  const base = tankarrBase(env);
  if (!base || !series?.artworkPath) return null;
  try {
    const url = new URL(series.artworkPath, base);
    if (url.origin !== base.origin || !url.pathname.startsWith("/api/metadata/artwork/")) return null;
    const res = await fetchImpl(url, {
      method: "GET",
      headers: requestHeaders(env, "image/*"),
      redirect: "error",
      signal: AbortSignal.timeout(TANKARR_TIMEOUT_MS),
    });
    if (!res || !res.ok) throw new Error(`HTTP ${res?.status ?? "?"}`);
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length < 16 || buffer.length > MAX_ARTWORK_BYTES) throw new Error("artwork size out of range");
    const kind = IMAGE_MAGIC.find((m) => m.test(buffer));
    if (!kind) throw new Error("artwork is not an image");
    return { buffer, ext: kind.ext };
  } catch (err) {
    logger?.warn?.({ err: err?.message }, "[bookgeek] comics scan: Tankarr artwork not fetched");
    return null;
  }
}
