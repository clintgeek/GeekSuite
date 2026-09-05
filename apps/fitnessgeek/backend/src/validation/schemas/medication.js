const { z } = require('zod');
const { logDateSchema } = require('./common');

const MED_TYPES = ['rx', 'otc', 'supplement'];
const TIME_OF_DAY = ['morning', 'afternoon', 'evening', 'bedtime'];

// The controller lowercases and validates med_type itself
// (`['rx','otc','supplement'].includes((body.med_type||'').toLowerCase())`),
// falling back to 'rx' on anything that doesn't match — including case
// variants like "RX". Preprocess-lowercase here so a case variant still
// passes (matches today's behavior); an outright invalid value (e.g.
// "prescription") now gets rejected with 400 instead of being silently
// rewritten to 'rx'. See the report for why that's called out as a change.
const medType = z.preprocess(
  (val) => (typeof val === 'string' ? val.toLowerCase() : val),
  z.enum(MED_TYPES),
).optional();

const nullableString = (max) => z.string().trim().max(max).nullable().optional();

const baseFields = {
  is_supplement: z.boolean().optional(),
  med_type: medType,
  rxcui: nullableString(64),
  ingredient_name: nullableString(200),
  brand_name: nullableString(200),
  form: nullableString(100),
  route: nullableString(100),
  strength: nullableString(100),
  dose_value: z.coerce.number().min(0).max(100000).nullable().optional(),
  dose_unit: nullableString(50),
  sig: nullableString(500),
  times_of_day: z.array(z.enum(TIME_OF_DAY)).max(TIME_OF_DAY.length).optional(),
  suggested_indications: z.array(z.string().max(200)).max(50).optional(),
  user_indications: z.array(z.string().max(200)).max(50).optional(),
  supply_start_date: logDateSchema.nullable().optional(),
  days_supply: z.coerce.number().int().min(1).max(3650).nullable().optional(),
  notes: z.string().max(500).optional(),
};

// POST / requires display_name (route: `if (!payload.display_name) return 400`).
const createMedicationSchema = z.object({
  ...baseFields,
  display_name: z.string().trim().min(1, 'display_name is required').max(200),
}).strict();

// PUT /:id keeps the existing value when display_name is omitted
// (`body.display_name ?? med.display_name`), so it stays optional here.
const updateMedicationSchema = z.object({
  ...baseFields,
  display_name: z.string().trim().min(1).max(200).optional(),
}).strict();

module.exports = { createMedicationSchema, updateMedicationSchema };
