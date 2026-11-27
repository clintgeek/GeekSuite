/**
 * Blood pressure utility functions
 */

import { createFitnessTheme } from '../theme/theme.jsx';

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
 * Colours come from the theme (see BP_TONES): Normal = success, Elevated =
 * warning, Stage 1 / Stage 2 / Crisis = error, Unknown = muted ink. `tone` names
 * the job; `color` is that tone in the given mode, so a caller passes
 * `theme.palette.mode` and never draws a day colour at night.
 *
 * @param {number} systolic
 * @param {number} diastolic
 * @param {'light'|'dark'} [mode]
 * @returns {{stage: string, category: string, color: string, tone: string}}
 */
/**
 * The tones come from the theme's own palette (no literal colours here), so a
 * change to `success` / `warning` / `error` in theme/theme.jsx reaches every
 * screen that draws a reading. One small set (THEME_REVIEW_2026-11 item 7):
 * Normal = success, A little high (Elevated) = warning, High (Stage 1, Stage 2,
 * Crisis) = error. `tomato` stays a tone NAME for Stage 1 (BPInsights keys its
 * wording on `error` vs the rest) but is drawn in the error colour. Always pair
 * the colour with the plain word.
 */
const toneSet = (mode) => {
  const p = createFitnessTheme(mode).palette;
  return {
    success: p.success.main,
    warning: p.warning.main,
    tomato: p.error.main,
    error: p.error.main,
    muted: p.text.muted,
  };
};

export const BP_TONES = Object.freeze({
  light: Object.freeze(toneSet('light')),
  dark: Object.freeze(toneSet('dark')),
});

/** The colour for a BP tone in one mode. */
export const bpToneColor = (tone, mode = 'light') => {
  const set = BP_TONES[mode === 'dark' ? 'dark' : 'light'];
  return set[tone] || set.muted;
};

export const categorizeBP = (systolic, diastolic, mode = 'light') => {
  const result = (stage, tone) => ({ stage, category: stage, tone, color: bpToneColor(tone, mode) });
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
    return result('Unknown', 'muted');
  }

  const sys = Number(systolic);
  const dia = Number(diastolic);

  if (!Number.isFinite(sys) || !Number.isFinite(dia)) {
    return result('Unknown', 'muted');
  }

  // A physiologically impossible reading is a data error, not a category — and
  // a zero or negative value is what a half-filled form looks like.
  if (sys <= 0 || dia <= 0) {
    return result('Unknown', 'muted');
  }

  if (sys > 180 || dia > 120) {
    return result(BP_STAGES.CRISIS, 'error');
  }
  if (sys >= 140 || dia >= 90) {
    return result(BP_STAGES.STAGE_2, 'error');
  }
  if (sys >= 130 || dia >= 80) {
    return result(BP_STAGES.STAGE_1, 'tomato');
  }
  if (sys >= 120) {
    // Reaching here means diastolic is already below 80.
    return result(BP_STAGES.ELEVATED, 'warning');
  }
  return result(BP_STAGES.NORMAL, 'success');
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