import { z } from 'zod';
import { validateInput } from '../shared/validation.js';

/**
 * fitnessgeek's own validation.js, alongside notegeek/todogeek/bookgeek/
 * flockgeek's — see `../shared/validation.js` for the shared machinery
 * (`validateInput`'s `GraphQLError`/`BAD_USER_INPUT` shape).
 *
 * Currently just the one schema: query-side search text, which reaches
 * mongod as regex source. `resolvers.js`'s `escapeRegex` (added for
 * `fitnessFoods` during tonight's ReDoS pass) neutralizes the regex
 * metacharacters; this schema puts a sane upper bound on the text itself
 * before it gets that far — same 200-char ceiling on `fitnessMeals(search:)`
 * as `fitnessFoods(search:)` gets from its own model-layer `.limit()` call.
 * (BURN_REVIEW_2 #13.)
 */
// No `.min(1)`: an empty string is exactly what an empty search box sends
// (`FoodSearch.jsx` et al. call `getMeals(null, searchQuery)` with whatever is
// currently typed), and it must mean "list everything", not "bad input" — the
// resolver's `if (args.search)` already treats '' the same as null/undefined.
const searchTextSchema = z.string().trim().max(200).nullable().optional();

export const fitnessMealsArgsSchema = z.object({
  mealType: z.string().trim().min(1).max(100).nullable().optional(),
  search: searchTextSchema,
});

export const validateFitnessMealsArgs = validateInput(fitnessMealsArgsSchema);

/**
 * `parseFoodEntry(text:, date:)` — natural-language quick-add (AI_IDEAS.md #2).
 *
 * `text` is the one thing in this module that reaches a *model*, so the bound
 * is a cost control as much as an input check: 500 characters is a generous
 * "what I ate" sentence and a cheap prompt. It is not a search string and
 * never reaches mongod as a regex — the fragments it produces are search
 * *queries* the frontend runs through the existing food search, which does its
 * own escaping.
 *
 * `date` is the caller's local wall clock (`YYYY-MM-DDTHH:mm`) and only the
 * hour is read from it, to pick a meal type — see `quickAddParser.js`'s hour
 * bands for why the server cannot infer that itself. A bare `YYYY-MM-DD` is
 * accepted and simply carries no hour. It is deliberately validated as a
 * bounded string rather than a date: an unparseable value degrades to the
 * documented UTC-hour fallback, and refusing the whole query over a clock hint
 * would be a worse trade than guessing "snack".
 */
export const parseFoodEntryArgsSchema = z.object({
  text: z.string().trim().min(1).max(500),
  date: z.string().trim().max(40).nullable().optional(),
});

export const validateParseFoodEntryArgs = validateInput(parseFoodEntryArgsSchema);

/**
 * `updateFitnessUserSettings(input: { experience })` — Simple and Full
 * (apps/fitnessgeek/DOCS/SIMPLE_AND_FULL_PLAN.md).
 *
 * The rest of `FitnessUserSettingsInput` is free-form `FitnessJSON` handed to
 * a strict-mode model, which DROPS an unknown path silently and — because
 * `updateSettings` does not run validators on update — would store an
 * out-of-enum `mode` as-is. This sub-document is small and new, so it gets a
 * real contract: known keys only (`.strict()` refuses a typo instead of
 * losing it), the two enums, a bounded name. `mode: null` is allowed and
 * means "I never chose" — the app then decides from the person's history.
 */
export const experienceInputSchema = z.object({
  mode: z.enum(['simple', 'full']).nullable().optional(),
  larger_text: z.boolean().optional(),
  first_run_done: z.boolean().optional(),
  preferred_name: z.string().trim().max(40).nullable().optional(),
  goal: z.enum(['lose', 'maintain', 'track']).nullable().optional(),
}).strict();

export const validateExperienceInput = validateInput(experienceInputSchema);
