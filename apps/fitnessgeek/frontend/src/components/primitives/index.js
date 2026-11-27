// ─── FitnessGeek Design Primitives ──────────────────────────────
//
// Shared building blocks that encode the app's look ("Daylight"):
//   - One card (Surface), and the card grammar: title row, hairline, fact
//     rows, tag, rounded bar (Label.jsx; names kept from the old look)
//   - A progress ring (Ring) and a health-number tile (MetricTile)
//   - Tabular figures for numbers (StatNumber)
//   - Sentence-case section labels — no ALL-CAPS tick labels (SectionLabel)
//   - Consistent empty states (EmptyState)
//
// Adopt these everywhere. New features inherit the aesthetic automatically.

export { default as Surface } from './Surface.jsx';
export { LabelPanel, Rule, FactHeadline, FactRow, FactColumnHead, LabelBar, Tag, ListRow } from './Label.jsx';
export { default as Page } from './Page.jsx';
export { default as Ring } from './Ring.jsx';
export { default as MetricTile } from './MetricTile.jsx';
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
