import { z } from 'zod';
import { validateInput } from '../shared/validation.js';

/**
 * fitnessgeek's own validation.js, alongside notegeek/bujogeek/bookgeek/
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
