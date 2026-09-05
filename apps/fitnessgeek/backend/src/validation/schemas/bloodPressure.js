const { z } = require('zod');
const { logDateSchema } = require('./common');

// Mirrors models/BloodPressure.js bounds exactly.
const systolic = z.coerce.number({ invalid_type_error: 'systolic must be a number' }).min(70).max(200);
const diastolic = z.coerce.number({ invalid_type_error: 'diastolic must be a number' }).min(40).max(130);
const pulse = z.coerce.number({ invalid_type_error: 'pulse must be a number' }).min(40).max(200).nullable().optional();
const notes = z.string().max(500).optional();

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

module.exports = { createBPSchema, updateBPSchema };
