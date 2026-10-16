/**
 * The checks both blood-pressure forms (AddBPDialog, QuickAddBP's card) run
 * before saving, in one place so their words can't drift apart.
 *
 * Mirrors `bloodPressureBounds` in `@geeksuite/schemas/fitnessgeek/bloodPressure.js`
 * (the actual source of truth, shared by the backend model and its zod request
 * validator). That package is CJS and mongoose-oriented, built for the two
 * Node backends that write this collection — it is not a frontend dependency
 * and pulling it into this bundle isn't the fix. These are typo guards, not a
 * clinical range (a genuine hypertensive-crisis reading must be storable), so
 * keeping this copy in sync is a matter of updating four numbers, not logic;
 * if the backend's bounds ever move, update these to match.
 */
export const SYS_BOUNDS = { min: 60, max: 300 };
export const DIA_BOUNDS = { min: 30, max: 200 };
export const PULSE_BOUNDS = { min: 30, max: 250 };

/** What a person reads when a reading already sits at that minute (C1). */
export const DUPLICATE_MESSAGE = 'You already saved a reading at that time.';

/**
 * @returns {{ error: string } | { systolic: number, diastolic: number, pulse: number|null }}
 */
export function validateBPForm({ systolic, diastolic, pulse }) {
  if (!systolic || !diastolic) {
    return { error: 'Enter both the top and bottom numbers.' };
  }
  const sys = parseInt(systolic, 10);
  const dia = parseInt(diastolic, 10);
  const pul = pulse ? parseInt(pulse, 10) : null;
  if (Number.isNaN(sys) || Number.isNaN(dia)) {
    return { error: 'Those need to be whole numbers.' };
  }
  if (sys < SYS_BOUNDS.min || sys > SYS_BOUNDS.max) {
    return { error: `The top number should be between ${SYS_BOUNDS.min} and ${SYS_BOUNDS.max}.` };
  }
  if (dia < DIA_BOUNDS.min || dia > DIA_BOUNDS.max) {
    return { error: `The bottom number should be between ${DIA_BOUNDS.min} and ${DIA_BOUNDS.max}.` };
  }
  if (sys <= dia) {
    return { error: 'The top number should be bigger than the bottom number.' };
  }
  if (pulse && (Number.isNaN(pul) || pul < PULSE_BOUNDS.min || pul > PULSE_BOUNDS.max)) {
    return { error: `Pulse should be between ${PULSE_BOUNDS.min} and ${PULSE_BOUNDS.max}.` };
  }
  return { systolic: sys, diastolic: dia, pulse: pul };
}
