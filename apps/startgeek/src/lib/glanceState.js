// glanceState.js — which of five things the module row should draw
// (SUITE_REVIEW_2026-11 §2: a failed load must not look like an empty day).
//
// Before: ModuleGrid read only `data` and `loading`; a failed first load left
// `data` null and the row returned nothing — Tasks, Fitness and Reading simply
// vanished, which reads as "nothing due today". A failed background refresh
// kept the old rows with no hint they were old.
//
// The decision is the suite's `geekLoadStatus` (packages/ui), imported by
// path because @geeksuite/ui's package entry pulls in MUI, which this app
// does not use.

import { geekLoadStatus } from '../../../../packages/ui/src/feedback/loadStatus.js'

/**
 * @param {{ data?: unknown, loading?: boolean, error?: unknown }} glance
 * @returns {'loading' | 'error' | 'stale' | 'ready' | 'empty'}
 *   'error'  nothing to show and the load failed → "Couldn't load today" + Retry
 *   'stale'  rows from an earlier load, the latest refresh failed → rows + a hint
 *   'empty'  loaded, and the snapshot is missing → nothing
 */
export function glanceRowState({ data, loading = false, error = null } = {}) {
  const status = geekLoadStatus({ data, loading, error, isEmpty: (d) => d == null })
  if (status === 'ready' && error) return 'stale'
  return status
}
