// New modern components
export { default as WeightGoalWizard } from './WeightGoalWizard.jsx';
export { default as WeightTimeline } from './WeightTimeline.jsx';
export { default as WeightProgress } from './WeightProgress.jsx';
export { default as QuickAddWeight } from './QuickAddWeight.jsx';
export { default as WeightLogList } from './WeightLogList.jsx';

// Q52a deleted the five legacy chart modules (WeightChart / WeightSparkline
// and their Nivo twins); the body-data pass (FITNESSGEEK_BODY_DATA_PLAN F10)
// deleted the last three dead ones — WeightProgressRing, ProgressTracker and
// ChartSelector — after a grep showed nothing imported them. Weight.jsx
// imports by file, not through this barrel: no package in this workspace
// declares `sideEffects: false`, so a chart module re-exported here can ride
// @nivo/line into a chunk that shook its bindings.
