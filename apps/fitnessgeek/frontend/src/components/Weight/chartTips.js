/**
 * The pure half of the weight and body-composition chart tooltips (review
 * D-4); the component is ChartTooltip in chartTooltip.jsx.
 */
import { useRef, useState } from 'react';

/** Nivo's own offset between the cursor and the tooltip. */
const NIVO_OFFSET = 14;
const EDGE_GAP = 4;

/**
 * How far to move a tooltip so it stays inside the chart. Nivo anchors it to
 * the cursor's right while the cursor is in the left half, and to its left
 * past the middle; a wide tooltip near either edge then hangs outside.
 *
 * @param {{cursorX: number, width: number, chartWidth: number}} m px, cursorX from the chart's left edge
 * @returns {number} px to translate horizontally (negative = left)
 */
export function tooltipShift({ cursorX, width, chartWidth }) {
  if (!(width > 0) || !(chartWidth > 0) || !Number.isFinite(cursorX)) return 0;
  if (cursorX < chartWidth / 2) {
    const right = cursorX + NIVO_OFFSET + width;
    return right > chartWidth - EDGE_GAP ? (chartWidth - EDGE_GAP) - right : 0;
  }
  const left = cursorX - NIVO_OFFSET - width;
  return left < EDGE_GAP ? EDGE_GAP - left : 0;
}

/**
 * A y-domain at least `minSpan` tall, centred on the data, so ±1 lb of scale
 * noise doesn't fill the panel and read as a cliff (review D-4: ~10 lb for
 * the mass charts).
 */
export function massDomain(values, minSpan = 10) {
  const ys = (values || []).filter((y) => Number.isFinite(y));
  if (!ys.length) return ['auto', 'auto'];
  const lo = Math.min(...ys);
  const hi = Math.max(...ys);
  const span = Math.max((hi - lo) * 1.24, minSpan);
  const mid = (lo + hi) / 2;
  return [Math.floor(mid - span / 2), Math.ceil(mid + span / 2)];
}

/**
 * Arms the tooltip only on a real touch or a real pointer movement over the
 * chart. Spread `handlers` on the box around the chart and read `armed()`
 * in the tooltip.
 */
export function useTooltipGuard() {
  const armedRef = useRef(false);
  const [, bump] = useState(0);
  const arm = (on) => {
    if (armedRef.current === on) return;
    armedRef.current = on;
    bump((n) => n + 1);
  };
  const handlers = {
    onPointerDown: () => arm(true),
    // Moves the browser makes up after a tap or a scroll don't move.
    onPointerMove: (e) => { if (e.movementX || e.movementY) arm(true); },
    onPointerLeave: () => arm(false),
  };
  return { armed: () => armedRef.current, handlers };
}

/** "Jun 18", or "Jun 18, 2025" when it isn't this year. `ymd` is YYYY-MM-DD. */
export function tooltipDay(ymd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(ymd || ''));
  if (!m) return '';
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const day = `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}`;
  return Number(m[1]) === new Date().getFullYear() ? day : `${day}, ${m[1]}`;
}
