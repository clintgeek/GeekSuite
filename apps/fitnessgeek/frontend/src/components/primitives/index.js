// ─── FitnessGeek Design Primitives ──────────────────────────────
//
// Shared building blocks that encode the app's aesthetic (The Label):
//   - The label grammar: panel, rules, fact rows, tag, bar (Label.jsx)
//   - Heavy grotesque headings in plain words (DisplayHeading)
//   - Tabular figures for numbers (StatNumber)
//   - Sentence-case section labels — no ALL-CAPS tick labels (SectionLabel)
//   - Single card variant system (Surface)
//   - Consistent empty states (EmptyState)
//
// Adopt these everywhere. New features inherit the aesthetic automatically.

export { default as Surface } from './Surface.jsx';
export { LabelPanel, Rule, FactHeadline, FactRow, FactColumnHead, LabelBar, Tag, ListRow } from './Label.jsx';
export { default as Page } from './Page.jsx';
export { default as StatNumber } from './StatNumber.jsx';
export { default as SectionLabel } from './SectionLabel.jsx';
export { default as DisplayHeading } from './DisplayHeading.jsx';
export { default as PremiumDialog } from './PremiumDialog.jsx';
export { default as EmptyState } from './EmptyState.jsx';
export { default as SurfaceSkeleton } from './SurfaceSkeleton.jsx';
export { default as SuspenseSurface } from './SuspenseSurface.jsx';
export { default as PageEnter } from './PageEnter.jsx';
export { default as DateField } from './DateField.jsx';
export { buildChartTheme } from './chartTheme.js';
