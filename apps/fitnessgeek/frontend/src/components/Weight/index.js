// New modern components
export { default as WeightGoalWizard } from './WeightGoalWizard.jsx';
export { default as WeightTimeline } from './WeightTimeline.jsx';
export { default as WeightProgress } from './WeightProgress.jsx';
export { default as QuickAddWeight } from './QuickAddWeight.jsx';
export { default as WeightLogList } from './WeightLogList.jsx';

// Legacy components (to be deprecated)
//
// Q52a deleted the five chart modules that used to live here —
// WeightChart / WeightSparkline (Recharts) and their WeightChartNivo /
// WeightSparklineNivo twins. Nothing imported this barrel, and Weight.jsx's
// own header explains why that was worse than merely dead: no package in
// this workspace declares `sideEffects: false`, so rollup kept every
// re-exported module's top-level side effects and a chart library could ride
// into a chunk that had shaken its bindings. WeightTimeline is the one
// weight chart the app renders.
export { default as WeightProgressRing } from './WeightProgressRing.jsx';
export { default as ProgressTracker } from './ProgressTracker.jsx';
export { default as ChartSelector } from './ChartSelector.jsx';
