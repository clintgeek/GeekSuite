import { z } from 'zod';
import { bloodPressureBounds } from '@geeksuite/schemas/fitnessgeek/bloodPressure';
import { logDateSchema } from './common.js';

// The bounds come from the schema itself rather than being restated here. This
// file used to carry the comment "Mirrors models/BloodPressure.js bounds
// exactly", which is a hand-sync in a different language — the same failure
// mode that consolidation is meant to end. @geeksuite/schemas is now the one
// place the numbers live, for both the Mongoose validators and this zod layer.
const { systolic: SYS, diastolic: DIA, pulse: PULSE, notes: NOTES } = bloodPressureBounds;

const systolic = z.coerce.number({ invalid_type_error: 'systolic must be a number' }).min(SYS.min).max(SYS.max);
const diastolic = z.coerce.number({ invalid_type_error: 'diastolic must be a number' }).min(DIA.min).max(DIA.max);
const pulse = z.coerce.number({ invalid_type_error: 'pulse must be a number' }).min(PULSE.min).max(PULSE.max).nullable().optional();
const notes = z.string().max(NOTES.maxlength).optional();

// bloodPressureController requires systolic/diastolic on BOTH create and
// update (updateBPLog re-checks `!systolic || !diastolic` even though it
// reads an existing document first) and requires systolic > diastolic on
// both — so create and update share one shape.
function systolicAboveDiastolic(data, ctx) {
  if (data.systolic <= data.diastolic) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['systolic'],
      message: 'systolic must be higher than diastolic',
    });
  }
}

const bpFields = {
  systolic,
  diastolic,
  pulse,
  log_date: logDateSchema.optional(),
  notes,
};

const createBPSchema = z.object(bpFields).strict().superRefine(systolicAboveDiastolic);
const updateBPSchema = z.object(bpFields).strict().superRefine(systolicAboveDiastolic);

export { createBPSchema, updateBPSchema };
export default { createBPSchema, updateBPSchema };
