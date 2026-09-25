/**
 * Parse and validate a `Playnite Library Exporter` JSON export
 * (apps/gamegeek/DOCS/PLAYNITE_IMPORT.md §The file).
 *
 * The whole file is rejected (PLAYNITE_BAD_FILE) only when it isn't an
 * export at all: unparseable JSON, not an object, `schemaVersion` ≠ 1, or no
 * `games` array. A single bad entry is never fatal — it is counted as
 * `invalid` and skipped.
 *
 * Per-entry schemas are non-strict `z.object`s, which drop unknown keys: that
 * is how `installDirectory` (a local path on Chef's machine) never reaches the
 * planner, the database or a response.
 */
import { z } from 'zod';

export const MAX_GAMES = 20000;
export const SUPPORTED_SCHEMA_VERSION = 1;

export class PlayniteFileError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PlayniteFileError';
    this.code = 'PLAYNITE_BAD_FILE';
    this.status = 400;
  }
}

const shortText = (max) => z.string().max(max);
const stringList = z.array(z.string().max(200)).max(500).nullish().transform((v) => v ?? []);

const entrySchema = z.object({
  playniteId: z.string().trim().min(1).max(100),
  name: z.string().trim().min(1).max(1000),
  providerGameId: z.union([shortText(500), z.number()]).nullish(),
  sourceName: shortText(200).nullish(),
  steamAppIdConfidence: shortText(40).nullish(),
  steamAppId: z.union([z.number().int().nonnegative(), z.string().regex(/^\d{1,12}$/)]).nullish(),
  hidden: z.boolean().nullish(),
  favorite: z.boolean().nullish(),
  platforms: stringList,
  genres: stringList,
  categories: stringList,
  tags: stringList,
  playtimeSeconds: z.number().nonnegative().finite().nullish(),
  releaseDate: shortText(40).nullish(),
  sortingName: shortText(1000).nullish(),
  lastActivity: shortText(60).nullish(),
});

const topSchema = z.object({
  schemaVersion: z.literal(SUPPORTED_SCHEMA_VERSION),
  generatedAtUtc: z.string().max(60).nullish(),
  games: z.array(z.unknown()).max(MAX_GAMES),
});

/** Buffer | string → object. Tolerates a UTF-8 BOM (Windows tools write one). */
export function parseJsonText(text) {
  let s = Buffer.isBuffer(text) ? text.toString('utf8') : String(text ?? '');
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  try {
    return JSON.parse(s);
  } catch {
    throw new PlayniteFileError('That file is not valid JSON');
  }
}

/**
 * @param {unknown} json the parsed export object
 * @returns {{
 *   schemaVersion: 1,
 *   generatedAtUtc: string|null,
 *   total: number,
 *   entries: object[],        // validated entries, unknown keys stripped
 *   invalid: number,
 *   seenPlayniteIds: Set<string>, // every playniteId in the file, valid or not
 * }}
 */
export function parseExport(json) {
  if (!json || typeof json !== 'object' || Array.isArray(json)) {
    throw new PlayniteFileError('That is not a Playnite library export');
  }
  if (json.schemaVersion !== SUPPORTED_SCHEMA_VERSION) {
    throw new PlayniteFileError(
      `Unsupported Playnite export schemaVersion (${JSON.stringify(json.schemaVersion ?? null)}); expected 1`
    );
  }
  const top = topSchema.safeParse(json);
  if (!top.success) {
    const tooMany = top.error.issues.some((i) => i.path[0] === 'games' && i.code === 'too_big');
    throw new PlayniteFileError(
      tooMany ? `The export has more than ${MAX_GAMES} games` : 'That is not a Playnite library export'
    );
  }

  const entries = [];
  const seenPlayniteIds = new Set();
  let invalid = 0;
  for (const raw of top.data.games) {
    // An entry that fails validation still names a playniteId most of the
    // time; remembering it keeps its existing copy out of `notInFile`.
    if (raw && typeof raw === 'object' && typeof raw.playniteId === 'string' && raw.playniteId.trim()) {
      seenPlayniteIds.add(raw.playniteId.trim());
    }
    const r = entrySchema.safeParse(raw);
    if (!r.success) {
      invalid += 1;
      continue;
    }
    entries.push(r.data);
  }

  const generated = top.data.generatedAtUtc ?? null;
  return {
    schemaVersion: SUPPORTED_SCHEMA_VERSION,
    generatedAtUtc: generated,
    total: top.data.games.length,
    entries,
    invalid,
    seenPlayniteIds,
  };
}

export default { parseExport, parseJsonText, PlayniteFileError };
