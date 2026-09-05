import { z } from 'zod';
import { logDateSchema } from './common.js';

// Mirrors models/Weight.js (`min: 0, max: 1000`), with a positive floor
// instead of `min: 0`. Safe: the controller already treats a falsy
// weight_value (including 0) as "missing" (`if (!weight_value)`), so nothing
// that was previously accepted stops being accepted.
const weightValue = z.coerce
  .number({ invalid_type_error: 'weight_value must be a number' })
  .positive('weight_value must be greater than 0')
  .max(1000, 'weight_value must be 1000 or less');

const notes = z.string().max(500).optional();
// The Weight model has no per-entry unit field — display unit lives on
// UserSettings.units.weight, and the raw number is stored as whatever unit
// the user was in when they logged it. There is nothing to enum-validate.

const createWeightSchema = z.object({
  weight_value: weightValue,
  log_date: logDateSchema.optional(),
  notes,
}).strict();

const updateWeightSchema = z.object({
  weight_value: weightValue.optional(),
  log_date: logDateSchema.optional(),
  notes,
}).strict();

export { createWeightSchema, updateWeightSchema };
export default { createWeightSchema, updateWeightSchema };
