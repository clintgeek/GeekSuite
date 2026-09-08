import { z } from 'zod';
import { storyIdParamsSchema, boundedName, boundedText } from './common.js';

// Story.status enum, from models/Story.js.
const STORY_STATUSES = ['active', 'paused', 'completed', 'abandoned', 'setup'];

// `provider` + `model` together are the player's PIN — a row they chose from
// aiGeek's alive-model list (`GET /api/ai/models/alive`). Absent means
// "Automatic", which is the default and the common case.
//
// There is no enum to check them against here and there deliberately never
// will be: the alive list is discovered nightly by aiGeek's catalog job, and a
// hard-coded list of model ids in this repo is exactly what Phase 2 removed.
// Bound them as short identifier strings; a pin aiGeek cannot honour degrades
// to the automatic pick with a `pin_unavailable` hint, which the turn reports
// as a one-line notice rather than a failure.
const provider = z.string().trim().max(100).optional();
const model = z.string().trim().max(200).optional();

// storyController.startStory requires `prompt` (`if (!prompt) return 400`);
// title/genre/description all fall back to a default when omitted. Bounds:
// prompt is free-form narration input (generous, per TODO_ORDER #22's
// "content strings <= 20000" guidance); title/genre are name-ish; description
// is a blurb, not narration, so a tighter bound.
const startStorySchema = z.object({
  prompt: boundedText(20000).trim().min(1, 'prompt is required'),
  title: boundedName(200).optional(),
  genre: boundedName(100).optional(),
  description: boundedText(5000).optional(),
  provider,
  model,
}).strict();

// storyController.continueStory reads `userInput.startsWith('/')` with no
// prior null-check today — a missing/empty userInput throws inside the
// route's try/catch and surfaces as a 500. Requiring a non-empty string here
// turns that into a clean 400 instead; every other accepted value (including
// slash-commands like "/checkpoint ...") is unaffected.
const continueStorySchema = z.object({
  userInput: boundedText(20000).min(1, 'userInput is required'),
  provider,
  model,
  debug: z.boolean().optional(),
}).strict();

// storyController.updateStoryStatus writes `req.body.status` straight onto
// the Mongoose document with no check today; an invalid value fails at save()
// with a Mongoose ValidationError (500). Enum matches Story.status exactly.
const updateStoryStatusSchema = z.object({
  status: z.enum(STORY_STATUSES),
}).strict();

export { storyIdParamsSchema, startStorySchema, continueStorySchema, updateStoryStatusSchema };
export default { storyIdParamsSchema, startStorySchema, continueStorySchema, updateStoryStatusSchema };
