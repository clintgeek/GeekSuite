import { z } from 'zod';
import mongoose from 'mongoose';
import {
  idString,
  calendarDateField,
  historicalDateField,
  validateInput,
} from '../shared/validation.js';
import constantsModule from '@geeksuite/schemas/gamegeek/constants';

export { validateInput };

/**
 * Input validation for the gamegeek gateway (DOCS/GameGeekPlan.md). Same
 * machinery and rejection shape as every other module: a `GraphQLError` with
 * `extensions.code = 'BAD_USER_INPUT'` and `details [{path,message}]`.
 *
 * Every vocabulary (platform, storefront, copy format, mode, completion,
 * source) is an enum from `@geeksuite/schemas/gamegeek/constants` — never an
 * inline list. Shelves are checked for SHAPE here (a built-in, or
 * `custom-<slug>`); whether a custom shelf actually exists on the caller's
 * profile is a lookup, so the resolver owns it.
 *
 * Dates: `releaseDate`, `acquiredAt`, `startedAt`, `finishedAt` are historical
 * calendar days (a 1991 SNES cartridge is not a typo) — the 1000-01-01 floor.
 * `playedOn` is a calendar day the user is logging now-ish, so it keeps the
 * shared 2000 scheduling floor. All normalise to UTC midnight.
 *
 * Nothing here accepts a `householdId` or `userId`: every schema is
 * `.strict()`, so a smuggled tenant key is a rejection, not a silent drop.
 */

const {
  BUILT_IN_SHELVES,
  PLATFORMS,
  STOREFRONTS,
  COPY_FORMATS,
  GAME_MODES,
  GAME_SOURCES,
  COMPLETION_LEVELS,
  bounds,
} = constantsModule;

/** The advertised `games` sorts. Each has a resolver arm AND an order test. */
export const GAME_SORTS = Object.freeze(['title', 'dateAdded', 'releaseDate', 'rating', 'lastPlayed', 'hoursPlayed']);
export const SORT_DIRS = Object.freeze(['asc', 'desc']);
export const CREATE_GAMES_MAX = 200;
export const MAX_CUSTOM_SHELF_LABEL = 40;

const LIST_MAX = bounds.listMax.max;
const CUSTOM_SHELF_PATTERN = /^custom-[a-z0-9]+(?:-[a-z0-9]+)*$/;

const enumOf = (values) => z.enum([...values]);
const nullableEnum = (values) => enumOf(values).nullable().optional();

const text = (max) => z.string().trim().max(max);
const optionalText = (max) => text(max).nullable().optional();
const stringList = (itemMax) =>
  z.array(z.string().trim().min(1).max(itemMax)).max(LIST_MAX).nullable().optional();

const objectIdString = z
  .string()
  .trim()
  .refine((v) => mongoose.isValidObjectId(v) && /^[0-9a-fA-F]{24}$/.test(v), { message: 'must be a valid id' });

/** A shelf as a write target: built-in or `custom-<slug>`; null clears. */
export const shelfValue = z
  .string()
  .trim()
  .max(100)
  .refine((v) => BUILT_IN_SHELVES.includes(v) || CUSTOM_SHELF_PATTERN.test(v), {
    message: `must be one of ${BUILT_IN_SHELVES.join(', ')} or a custom-<slug> shelf`,
  });
const shelfArg = shelfValue.nullable().optional();

const hours = z.number().min(bounds.hours.min).max(bounds.hours.max);
const rating = z
  .number()
  .min(bounds.rating.min)
  .max(bounds.rating.max)
  .refine((v) => Number.isInteger(v * 2), { message: 'rating must be in half steps' });

// ── Game (catalog) ───────────────────────────────────────────────────────────

const seriesInput = z
  .object({
    name: optionalText(bounds.title.maxlength),
    index: z.number().min(0).max(10000).nullable().optional(),
  })
  .strict();

const timeToBeatInput = z
  .object({
    main: hours.nullable().optional(),
    extra: hours.nullable().optional(),
    complete: hours.nullable().optional(),
  })
  .strict();

const externalIdsInput = z
  .object({
    igdb: optionalText(128),
    steamAppId: optionalText(128),
    rawg: optionalText(128),
    gog: optionalText(128),
    epic: optionalText(128),
  })
  .strict();

const copyInput = z
  .object({
    id: idString.optional().nullable(),
    platform: enumOf(PLATFORMS),
    format: nullableEnum(COPY_FORMATS),
    storefront: nullableEnum(STOREFRONTS),
    acquiredAt: historicalDateField({ required: false }),
    notes: optionalText(500),
  })
  .strict();

const gameFields = {
  parentId: objectIdString.nullable().optional(),
  series: seriesInput.nullable().optional(),
  developers: stringList(200),
  publishers: stringList(200),
  releaseDate: historicalDateField({ required: false }),
  description: optionalText(bounds.description.maxlength),
  genres: stringList(bounds.tag.maxlength),
  tags: stringList(bounds.tag.maxlength),
  modes: z.array(enumOf(GAME_MODES)).max(GAME_MODES.length).nullable().optional(),
  maxLocalPlayers: z.number().int().min(1).max(64).nullable().optional(),
  platformsAvailable: z.array(enumOf(PLATFORMS)).max(PLATFORMS.length).nullable().optional(),
  timeToBeat: timeToBeatInput.nullable().optional(),
  externalIds: externalIdsInput.nullable().optional(),
  copies: z.array(copyInput).max(LIST_MAX).nullable().optional(),
  source: nullableEnum(GAME_SOURCES),
};

const titleRequired = z.string().trim().min(1).max(bounds.title.maxlength);

/** Create: title required. */
export const createGameInput = z.object({ title: titleRequired, ...gameFields }).strict();
/** Update: title optional but NEVER nullable (`Game.title: String!`). */
export const updateGameInput = z.object({ title: titleRequired.optional(), ...gameFields }).strict();

export const createGameArgsSchema = z.object({ input: createGameInput, shelf: shelfArg }).strict();

export const createGamesArgsSchema = z
  .object({
    inputs: z.array(createGameInput).min(1).max(CREATE_GAMES_MAX, {
      message: `at most ${CREATE_GAMES_MAX} games per call`,
    }),
    shelf: shelfArg,
  })
  .strict();

export const updateGameArgsSchema = z.object({ id: idString, input: updateGameInput }).strict();
export const gameIdArgsSchema = z.object({ id: idString }).strict();

// ── Queries ──────────────────────────────────────────────────────────────────

export const gamesArgsSchema = z
  .object({
    page: z.number().int().min(1).nullable().optional(),
    // Clamped (1..100) by the resolver, not rejected — like bookgeek's books.
    limit: z.number().int().nullable().optional(),
    q: optionalText(200),
    shelf: z
      .string()
      .trim()
      .max(100)
      .refine((v) => v === '' || v === 'unshelved' || BUILT_IN_SHELVES.includes(v) || CUSTOM_SHELF_PATTERN.test(v), {
        message: 'unknown shelf filter',
      })
      .nullable()
      .optional(),
    platform: z
      .union([enumOf(PLATFORMS), z.literal('')])
      .nullable()
      .optional(),
    owned: z.enum(['true', 'false', '']).nullable().optional(),
    // Unknown sort is a rejection, never a silent fallback to title.
    sort: enumOf(GAME_SORTS).nullable().optional(),
    sortDir: z
      .string()
      .trim()
      .transform((v) => v.toLowerCase())
      .pipe(enumOf(SORT_DIRS))
      .nullable()
      .optional(),
  })
  .strict();

// ── Per-user state ───────────────────────────────────────────────────────────

export const setGameStateArgsSchema = z
  .object({
    gameId: idString,
    input: z
      .object({
        shelf: shelfArg,
        rating: rating.nullable().optional(),
        review: optionalText(bounds.review.maxlength),
        notes: optionalText(bounds.notes.maxlength),
        progress: z.number().min(bounds.progress.min).max(bounds.progress.max).nullable().optional(),
        hoursPlayed: hours.nullable().optional(),
        favorite: z.boolean().nullable().optional(),
      })
      .strict(),
  })
  .strict();

export const logGameSessionArgsSchema = z
  .object({
    gameId: idString,
    input: z
      .object({
        playedOn: calendarDateField({ required: true }),
        minutes: z.number().int().min(bounds.sessionMinutes.min).max(bounds.sessionMinutes.max),
        platform: nullableEnum(PLATFORMS),
        note: optionalText(500),
      })
      .strict(),
  })
  .strict();

export const deleteGameSessionArgsSchema = z.object({ gameId: idString, sessionId: idString }).strict();

export const saveGamePlaythroughArgsSchema = z
  .object({
    gameId: idString,
    input: z
      .object({
        id: idString.nullable().optional(),
        startedAt: historicalDateField({ required: false }),
        finishedAt: historicalDateField({ required: false }),
        hours: hours.nullable().optional(),
        platform: nullableEnum(PLATFORMS),
        difficulty: optionalText(60),
        completion: nullableEnum(COMPLETION_LEVELS),
        notes: optionalText(1000),
      })
      .strict()
      .refine((p) => !(p.startedAt && p.finishedAt) || p.finishedAt >= p.startedAt, {
        message: 'finishedAt must not be before startedAt',
        path: ['finishedAt'],
      }),
  })
  .strict();

export const deleteGamePlaythroughArgsSchema = z.object({ gameId: idString, playthroughId: idString }).strict();

// ── Profile ──────────────────────────────────────────────────────────────────

export const saveGameProfileArgsSchema = z
  .object({
    input: z
      .object({
        platformsOwned: z.array(enumOf(PLATFORMS)).max(PLATFORMS.length).nullable().optional(),
        defaultPlatform: z.union([enumOf(PLATFORMS), z.literal('')]).nullable().optional(),
        // A 64-bit SteamID: exactly 17 digits. '' or null clears.
        steamId: z
          .string()
          .trim()
          .refine((v) => v === '' || /^\d{17}$/.test(v), { message: 'steamId must be 17 digits' })
          .nullable()
          .optional(),
      })
      .strict(),
  })
  .strict();

export const addGameShelfArgsSchema = z.object({ label: z.string().max(100) }).strict();
export const removeGameShelfArgsSchema = z.object({ id: z.string().max(256) }).strict();

export const saveGameFilterArgsSchema = z
  .object({
    input: z
      .object({
        id: idString.nullable().optional(),
        name: z.string().trim().min(1, { message: 'Filter name is required' }).max(80),
        sortBy: nullableEnum(GAME_SORTS),
        sortDir: nullableEnum(SORT_DIRS),
        searchQuery: optionalText(200),
        shelfFilter: optionalText(100),
        platformFilter: optionalText(40),
        ownedFilter: z.enum(['true', 'false', 'all', '']).nullable().optional(),
      })
      .strict(),
  })
  .strict();

export const deleteGameFilterArgsSchema = z.object({ id: idString }).strict();
