export {
  toUtcMidnight,
  utcMidnightToday,
  utcDayRange,
  utcDateString,
  displayCalendarDate,
  localDateString,
  localDateStringDaysAgo,
  startOfLocalDay,
} from './dates.js';

export {
  KG_PER_LB,
  CM_PER_IN,
  BMR_CALC_VERSION,
  ACTIVITY_MULTIPLIERS,
  lbToKg,
  inToCm,
  mifflinStJeorBMR,
  katchMcArdleBMR,
  resolveBmr,
  tdeeFromBMR,
  isPlanCalculationStale,
} from './energy.js';

export {
  BODY_COMP_FIELDS,
  CURRENT_WINDOW_DAYS,
  CHANGE_WINDOW_DAYS,
  CHANGE_MIN_GAP_DAYS,
  TARGET_MAX_SCAN_AGE_DAYS,
  leanMassLb,
  bodyCompCurrent,
  bodyCompChange,
  leanMassForTargets,
  rollingMean,
} from './bodyComp.js';

export {
  DEFAULT_PROTEIN_G_PER_LB_GOAL,
  DEFAULT_FAT_G_PER_LB_GOAL,
  DEFAULT_PROTEIN_G_PER_LB_LEAN,
  macroRules,
  macrosForCalories,
  deriveMacroTargets,
} from './macros.js';
