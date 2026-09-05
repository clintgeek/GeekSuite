import React, { Suspense } from 'react';
import SurfaceSkeleton from './SurfaceSkeleton.jsx';

/**
 * SuspenseSurface — the shared boundary for in-page `React.lazy` islands.
 *
 * Route-level laziness already has its own fallback (`App.jsx`'s
 * `LoadingFallback`, a centred spinner filling the viewport). That is the
 * right surface when there is no page yet. It is the wrong one *inside* a
 * page that has already painted: a full-height spinner where a card belongs
 * makes the layout jump.
 *
 * So the in-page boundary reuses `SurfaceSkeleton` — the same Studio Slate
 * card the rest of the app loads into — and reserves the block's height, which
 * is what stops a chart popping in and shoving the log list down the page.
 *
 * Use it around anything lazy that renders in place: charts, tab panels,
 * report dialogs.
 */
const SuspenseSurface = ({ children, rows = 3, height = 'auto', showHeader = true, variant = 'card' }) => (
  <Suspense fallback={<SurfaceSkeleton rows={rows} height={height} showHeader={showHeader} variant={variant} />}>
    {children}
  </Suspense>
);

export default SuspenseSurface;
