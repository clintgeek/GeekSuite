/**
 * R128 — WeightTimeline passed `pointSize`, `lineWidth` and `pointBorderColor`
 * to `@nivo/line`'s `ResponsiveLine` as per-series functions. In @nivo/line
 * 0.99, `pointSize`/`lineWidth` are typed as a plain `number` (handed straight
 * to `strokeWidth` / `r = size / 2`), so a function yielded `<circle
 * r="NaN">` and the "Actual" series' points never rendered on `/weight`.
 * `pointBorderColor` IS function-capable (`InheritedColorConfig`), but nivo
 * calls it with the POINT datum, not the series — by the time it runs,
 * `point.color` already equals the shared `pointColor`, so `(line) =>
 * line.color` returned that shared fill color for every series rather than
 * each line's own color.
 *
 * jsdom can't actually paint the chart (nivo measures its container, which is
 * 0×0 there), so this mocks `@nivo/line`'s `ResponsiveLine` to capture the
 * props WeightTimeline passes it, and separately invokes the custom "points"
 * layer function (which replaced the built-in `'points'` layer, since
 * pointSize can't vary per series in this nivo version) with a synthetic
 * point set to prove it renders a real, finite `r` only for the "Actual"
 * series — never NaN, and never for Goal/Projection.
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

let capturedProps;
vi.mock('@nivo/line', () => ({
  ResponsiveLine: (props) => {
    capturedProps = props;
    return null;
  },
}));

import WeightTimeline from '../WeightTimeline.jsx';

const weightLogs = [
  { log_date: '2026-08-01', weight_value: 200 },
  { log_date: '2026-08-08', weight_value: 197 },
  { log_date: '2026-08-15', weight_value: 195 },
];

// A stand-in for the objects @nivo/line's own `useLine()` computes per point
// (id, seriesId, x, y, color, borderColor) — the shape the custom points
// layer destructures from `points`.
const syntheticPoints = [
  { id: 'p1', seriesId: 'Goal', x: 10, y: 10, color: 'grey', borderColor: 'grey' },
  { id: 'p2', seriesId: 'Actual', x: 20, y: 20, color: 'blue', borderColor: 'blue' },
  { id: 'p3', seriesId: 'Projection', x: 30, y: 30, color: 'orange', borderColor: 'orange' },
];

describe('WeightTimeline — @nivo/line prop shapes', () => {
  it('never passes a function for pointSize or lineWidth', () => {
    render(<WeightTimeline weightLogs={weightLogs} />);
    expect(capturedProps).toBeTruthy();

    expect(typeof capturedProps.lineWidth).toBe('number');
    expect(Number.isNaN(capturedProps.lineWidth)).toBe(false);

    // pointSize was removed outright (points are drawn by hand now, since the
    // library only accepts one size for the whole chart) — either way, it
    // must never be a function.
    expect(typeof capturedProps.pointSize).not.toBe('function');

    // colors legitimately stays a function — OrdinalColorScaleConfig supports
    // one, unlike pointSize/lineWidth.
    expect(typeof capturedProps.colors).toBe('function');
  });

  it('uses the object form of pointBorderColor, with the real field name', () => {
    render(<WeightTimeline weightLogs={weightLogs} />);
    expect(typeof capturedProps.pointBorderColor).not.toBe('function');
    // @nivo/line's Point type has `seriesColor`, never `serieColor` — the
    // old `(line) => line.color` also received the point, not the series, so
    // it was returning the shared pointColor rather than each series' color.
    expect(capturedProps.pointBorderColor).toEqual({ from: 'seriesColor' });
  });

  it('draws a real, non-NaN point radius only for the Actual series, never Goal/Projection', () => {
    render(<WeightTimeline weightLogs={weightLogs} />);

    const pointLayers = capturedProps.layers.filter((l) => typeof l === 'function');
    // Call every custom layer with a shared synthetic context: the Goal-line
    // dash layer only reads `series`/`lineGenerator` (both harmless no-ops
    // here), so this isolates the points layer without guessing which array
    // index it lives at.
    const ctx = { lineGenerator: () => 'M0,0', series: [], points: syntheticPoints };
    const rendered = pointLayers.flatMap((layer) => {
      const result = layer(ctx);
      return Array.isArray(result) ? result : [result];
    });
    const circles = rendered.filter((el) => el && el.type === 'circle');

    expect(circles).toHaveLength(1);
    expect(Number.isFinite(circles[0].props.r)).toBe(true);
    expect(circles[0].props.r).toBeGreaterThan(0);
    expect(syntheticPoints.find((p) => p.id === circles[0].key)?.seriesId).toBe('Actual');
  });
});
