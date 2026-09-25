/**
 * Fill-only-empty planning and its undo (apps/gamegeek/DOCS/METADATA_ENRICHMENT.md
 * §What gets filled, §Record per game). Pure: no database, no network.
 *
 * planFill(game, detail) says which catalog fields a matched provider detail
 * may write: only the empty ones, never title/tags/copies/anything personal.
 * Every field it fills is named in `filled` and fingerprinted in `hashes`
 * (sha256 of the value written), so planUnlink() can later clear a field
 * ONLY while it still holds what enrichment wrote. A field someone edited
 * after the match keeps their edit through an unlink.
 */
import crypto from 'node:crypto';
import constantsModule from '@geeksuite/schemas/gamegeek/constants';
import { cleanList } from '../playnite/mapping.js';
import { toPlainText } from './text.js';

const { PLATFORMS, GAME_MODES } = constantsModule;

const MAX_LOCAL_PLAYERS = 64;
const MAX_HOURS = 100000;

/** Read a dotted path off a plain object or a mongoose document. */
export function getPath(obj, path) {
  if (obj && typeof obj.get === 'function' && typeof obj.toObject === 'function') return obj.get(path);
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

function toDateOrNull(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function hoursOrNull(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0 || n > MAX_HOURS) return null;
  return Math.round(n * 10) / 10;
}

/**
 * The fillable fields. `kind` decides what "empty" means, the empty-value
 * filter used by the guarded write, and the default an unlink restores.
 */
export const FILL_FIELDS = Object.freeze([
  { path: 'description', kind: 'string', from: (d) => toPlainText(d.description) },
  { path: 'developers', kind: 'list', from: (d) => cleanList(d.developers, { maxLength: 200 }) },
  { path: 'publishers', kind: 'list', from: (d) => cleanList(d.publishers, { maxLength: 200 }) },
  { path: 'genres', kind: 'list', from: (d) => cleanList(d.genres) },
  { path: 'releaseDate', kind: 'scalar', from: (d) => toDateOrNull(d.releaseDate) },
  { path: 'modes', kind: 'list', from: (d) => (d.modes ?? []).filter((m, i, a) => GAME_MODES.includes(m) && a.indexOf(m) === i) },
  {
    path: 'maxLocalPlayers',
    kind: 'scalar',
    from: (d) => (Number.isInteger(d.maxLocalPlayers) && d.maxLocalPlayers > 0 ? Math.min(d.maxLocalPlayers, MAX_LOCAL_PLAYERS) : null),
  },
  { path: 'timeToBeat.main', kind: 'scalar', from: (d) => hoursOrNull(d.timeToBeat?.main) },
  { path: 'timeToBeat.extra', kind: 'scalar', from: (d) => hoursOrNull(d.timeToBeat?.extra) },
  { path: 'timeToBeat.complete', kind: 'scalar', from: (d) => hoursOrNull(d.timeToBeat?.complete) },
  { path: 'externalIds.steamAppId', kind: 'id', idKey: 'steamAppId' },
  { path: 'externalIds.igdb', kind: 'id', idKey: 'igdb' },
  { path: 'externalIds.rawg', kind: 'id', idKey: 'rawg' },
]);

const KIND_BY_PATH = Object.freeze({
  ...Object.fromEntries(FILL_FIELDS.map((f) => [f.path, f.kind])),
  coverPath: 'scalar',
});

export function isEmptyValue(kind, value) {
  if (kind === 'list') return !Array.isArray(value) || value.length === 0;
  if (kind === 'string') return value == null || value === '';
  return value == null || value === '';
}

/** The Mongo filter clause that is true only while `path` is still empty. */
export function emptyFilter(path) {
  const kind = KIND_BY_PATH[path] ?? 'scalar';
  if (kind === 'list') return { [`${path}.0`]: { $exists: false } };
  if (kind === 'string' || kind === 'id') return { [path]: { $in: [null, ''] } };
  return { [path]: null };
}

/** The value an unlink puts back: the schema default. */
export function defaultFor(path) {
  const kind = KIND_BY_PATH[path] ?? 'scalar';
  if (kind === 'list') return [];
  if (kind === 'string') return '';
  return null;
}

function canonical(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    if (typeof value.toHexString === 'function') return value.toHexString();
    return Object.fromEntries(Object.keys(value).sort().map((k) => [k, canonical(value[k])]));
  }
  return value ?? null;
}

/** Short stable fingerprint of a field value (Dates by ISO string, arrays in order). */
export function valueHash(value) {
  const plain = value && typeof value.toObject === 'function' ? value.toObject() : value;
  return crypto.createHash('sha256').update(JSON.stringify(canonical(plain))).digest('hex').slice(0, 16);
}

/**
 * @param {object} game the current Game (plain object or document).
 * @param {object} detail a full MetadataCandidate from a provider.
 * @param {object} [options]
 * @param {{steamAppId?: Set<string>, igdb?: Set<string>, rawg?: Set<string>}} [options.takenIds]
 *   external ids already held by ANOTHER game in the household.
 * @returns {{set: object, filled: string[], hashes: object, addPlatforms: string[]}}
 */
export function planFill(game, detail, { takenIds = {} } = {}) {
  const set = {};
  const filled = [];
  const hashes = {};
  if (!detail) return { set, filled, hashes, addPlatforms: [] };

  for (const field of FILL_FIELDS) {
    if (!isEmptyValue(field.kind, getPath(game, field.path))) continue;
    let value;
    if (field.kind === 'id') {
      const raw = detail.externalIds?.[field.idKey];
      value = raw == null || raw === '' ? null : String(raw);
      if (value && takenIds[field.idKey]?.has(value)) value = null;
    } else {
      value = field.from(detail);
    }
    if (isEmptyValue(field.kind, value)) continue;
    set[field.path] = value;
    filled.push(field.path);
    hashes[field.path] = valueHash(value);
  }

  const have = new Set(getPath(game, 'platformsAvailable') ?? []);
  const addPlatforms = [];
  for (const p of detail.platforms ?? []) {
    if (PLATFORMS.includes(p) && !have.has(p) && !addPlatforms.includes(p)) addPlatforms.push(p);
  }

  return { set, filled, hashes, addPlatforms };
}

/**
 * What an unlink may undo. A field in `enrichment.filled` is cleared only
 * when its current value still hashes to what enrichment wrote; a field
 * with a different value (someone edited it) or no recorded hash is kept.
 * Platforms enrichment added are pulled. The cover is cleared only when
 * `coverFromEnrichment` is still true (a manual upload/delete clears it).
 *
 * @returns {{set: object, pullPlatforms: string[], cleared: string[], kept: string[], clearCover: boolean}}
 */
export function planUnlink(game) {
  const e = getPath(game, 'enrichment') ?? {};
  const filled = Array.isArray(e.filled) ? e.filled : [];
  const hashes = e.filledHashes && typeof e.filledHashes === 'object' ? e.filledHashes : {};
  const set = {};
  const cleared = [];
  const kept = [];
  let clearCover = false;

  for (const path of filled) {
    if (path === 'platformsAvailable') continue;
    if (path === 'coverPath') {
      if (e.coverFromEnrichment && getPath(game, 'coverPath')) {
        clearCover = true;
        set.coverPath = null;
        cleared.push(path);
      } else {
        kept.push(path);
      }
      continue;
    }
    if (!(path in KIND_BY_PATH)) continue;
    const current = getPath(game, path);
    if (hashes[path] && valueHash(current) === hashes[path]) {
      set[path] = defaultFor(path);
      cleared.push(path);
    } else {
      kept.push(path);
    }
  }

  const pullPlatforms = Array.isArray(e.addedPlatforms) ? [...e.addedPlatforms] : [];
  return { set, pullPlatforms, cleared, kept, clearCover };
}

export default { FILL_FIELDS, planFill, planUnlink, emptyFilter, defaultFor, valueHash, getPath, isEmptyValue };
