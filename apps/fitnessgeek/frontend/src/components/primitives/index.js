// ─── FitnessGeek Design Primitives ──────────────────────────────
//
// Shared building blocks that encode the app's aesthetic:
//   - Editorial serif for human voice (DisplayHeading)
//   - JetBrains Mono for numeric precision (StatNumber)
//   - Uppercase tick labels for section hierarchy (SectionLabel)
//   - Single card variant system (Surface)
//   - Consistent empty states (EmptyState)
//
// Adopt these everywhere. New features inherit the aesthetic automatically.

export { default as Surface } from './Surface.jsx';
export { default as StatNumber } from './StatNumber.jsx';
export { default as SectionLabel } from './SectionLabel.jsx';
export { default as DisplayHeading } from './DisplayHeading.jsx';
export { default as EmptyState } from './EmptyState.jsx';
export { default as SurfaceSkeleton } from './SurfaceSkeleton.jsx';
export { default as PageEnter } from './PageEnter.jsx';
export { buildChartTheme } from './chartTheme.js';
