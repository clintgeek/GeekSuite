/**
 * Blood pressure utility functions
 */

/**
 * Categorize blood pressure readings based on AHA (American Heart Association) guidelines
 * @param {number} systolic - Systolic blood pressure
 * @param {number} diastolic - Diastolic blood pressure
 * @returns {Object} Object with stage and color properties
 */
export const BP_STAGES = Object.freeze({
  NORMAL: 'Normal',
  ELEVATED: 'Elevated',
  STAGE_1: 'Stage 1',
  STAGE_2: 'Stage 2',
  CRISIS: 'Crisis',
});

/**
 * The one blood-pressure categoriser. Every screen must use this.
 *
 * WHY THIS IS THE ONLY ONE
 * ------------------------
 * On 2026-09-19 this app had FOUR implementations of this function and all four
 * were wrong, each differently:
 *
 *   - `BPLogList` used `systolic < 140 || diastolic < 90` for Stage 1, so a
 *     reading of 190/70 satisfied the diastolic half and was labelled Stage 1 —
 *     the mildest non-normal tier — in orange, on the daily log, which is the
 *     one screen whose job is a danger-at-a-glance read. 120/80 was labelled
 *     Stage 1 too. The condition was wrong for almost every input.
 *   - `BPInsights` and `BPCategoryDistribution` tested Stage 2 (`>= 140`) BEFORE
 *     Crisis (`>= 180`), so the Crisis branch was unreachable: nothing above 180
 *     could ever get past the Stage 2 test.
 *   - `bpUtils.categorizeBP` had no Crisis tier at all and returned 'Unknown'.
 *   - `AddBPDialog`/`QuickAddBP` added a non-standard "High Normal" band, so the
 *     category shown while typing could disagree with the saved row.
 *
 * ORDER IS THE SAFETY PROPERTY
 * ----------------------------
 * The bands overlap by design — AHA Stage 2 is "140+ OR 90+", and 190/70 is
 * Stage 2 on systolic alone while its diastolic sits in the normal range. The
 * only safe evaluation order is therefore MOST SEVERE FIRST, so a reading lands
 * in the worst band it qualifies for rather than the first one it happens to
 * match. Every bug above was an ordering or operator mistake, not a threshold
 * mistake. Do not reorder these branches.
 *
 * Thresholds follow the AHA's published categories. Crisis is "higher than 180
 * and/or higher than 120" — strictly greater, which is why 180/120 is Stage 2
 * and 181/121 is Crisis.
 *
 * @param {number} systolic
 * @param {number} diastolic
 * @returns {{stage: string, category: string, color: string}}
 */
export const categorizeBP = (systolic, diastolic) => {
  // A missing or unparseable reading is not a category. Saying "Normal" here
  // would be the same class of lie the bugs above told.
  //
  // `Number()` alone is not enough, and the first version of this function got
  // it wrong: `Number('')` and `Number(null)` are both `0`, which is finite, so
  // a cleared form field or a null column read as a real "0/0" reading and came
  // back **Normal** — green, reassuring, and about no measurement at all. Empty
  // and null are rejected before any coercion happens.
  const blank = (v) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
  if (blank(systolic) || blank(diastolic)) {
    return { stage: 'Unknown', category: 'Unknown', color: '#78716C' };
  }

  const sys = Number(systolic);
  const dia = Number(diastolic);

  if (!Number.isFinite(sys) || !Number.isFinite(dia)) {
    return { stage: 'Unknown', category: 'Unknown', color: '#78716C' };
  }

  // A physiologically impossible reading is a data error, not a category — and
  // a zero or negative value is what a half-filled form looks like.
  if (sys <= 0 || dia <= 0) {
    return { stage: 'Unknown', category: 'Unknown', color: '#78716C' };
  }

  if (sys > 180 || dia > 120) {
    return { stage: BP_STAGES.CRISIS, category: BP_STAGES.CRISIS, color: '#dc2626' };
  }
  if (sys >= 140 || dia >= 90) {
    return { stage: BP_STAGES.STAGE_2, category: BP_STAGES.STAGE_2, color: '#ef4444' };
  }
  if (sys >= 130 || dia >= 80) {
    return { stage: BP_STAGES.STAGE_1, category: BP_STAGES.STAGE_1, color: '#f97316' };
  }
  if (sys >= 120) {
    // Reaching here means diastolic is already below 80.
    return { stage: BP_STAGES.ELEVATED, category: BP_STAGES.ELEVATED, color: '#f59e0b' };
  }
  return { stage: BP_STAGES.NORMAL, category: BP_STAGES.NORMAL, color: '#10b981' };
};

/**
 * Get blood pressure category description
 * @param {string} stage - Blood pressure stage
 * @returns {string} Description of the stage
 */
export const getBPStageDescription = (stage) => {
  const descriptions = {
    'Normal': 'Blood pressure is within normal range',
    'Elevated': 'Blood pressure is elevated but not yet hypertensive',
    'Stage 1': 'Stage 1 hypertension - moderate elevation',
    'Stage 2': 'Stage 2 hypertension - significant elevation',
    'Unknown': 'Unable to categorize blood pressure reading'
  };

  return descriptions[stage] || descriptions['Unknown'];
};

/**
 * Get blood pressure ranges for each category
 * @returns {Object} Object with category ranges
 */
export const getBPRanges = () => {
  return {
    'Normal': { systolic: '< 120', diastolic: '< 80' },
    'Elevated': { systolic: '120-129', diastolic: '< 80' },
    'Stage 1': { systolic: '130-139', diastolic: '80-89' },
    'Stage 2': { systolic: '≥ 140', diastolic: '≥ 90' }
  };
};