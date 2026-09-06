/**
 * R128 — BPChartNivo passed `pointSize` and `lineWidth` to `@nivo/line`'s
 * `ResponsiveLine` as per-series functions. In @nivo/line 0.99 both props are
 * typed as a plain `number` (handed straight to `strokeWidth` / `r = size / 2`
 * in `DotsItem`), not a function — so a function yielded `<circle r="NaN">`
 * and the Systolic/Diastolic points never rendered on `/blood-pressure`.
 *
 * jsdom can't actually paint the chart (nivo measures its container, which is
 * 0×0 there), so this mocks `@nivo/line`'s `ResponsiveLine` to capture the
 * props BPChartNivo passes it, and separately invokes the custom "points"
 * layer function (which replaced the built-in `'points'` layer, since
 * pointSize can't vary per series in this nivo version) with a synthetic
 * point set to prove it renders real, finite `r` values for the real series
 * only — never NaN, and never for the reference-band series.
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

import BPChartNivo from '../BPChartNivo.jsx';

const sampleData = [
  { log_date: '2026-08-01', systolic: '122', diastolic: '80' },
  { log_date: '2026-08-08', systolic: '130', diastolic: '84' },
  { log_date: '2026-08-15', systolic: '118', diastolic: '76' },
];

// A stand-in for the objects @nivo/line's own `useLine()` computes per point
// (id, seriesId, x, y, color, borderColor) — the real shape the custom points
// layer destructures from `points` regardless of which library version wires
// it up. Includes one point per reference band plus the two real series, the
// same shape the component's own `lines` array produces.
const syntheticPoints = [
  { id: 'p1', seriesId: 'Stage 1 (140)', x: 10, y: 10, color: 'red', borderColor: 'red' },
  { id: 'p2', seriesId: 'Elevated (130)', x: 20, y: 20, color: 'orange', borderColor: 'orange' },
  { id: 'p3', seriesId: 'Normal (120)', x: 30, y: 30, color: 'green', borderColor: 'green' },
  { id: 'p4', seriesId: 'Systolic', x: 40, y: 40, color: 'crimson', borderColor: 'crimson' },
  { id: 'p5', seriesId: 'Diastolic', x: 50, y: 50, color: 'teal', borderColor: 'teal' },
];

describe('BPChartNivo — @nivo/line prop shapes', () => {
  it('never passes a function for pointSize or lineWidth', () => {
    render(<BPChartNivo data={sampleData} />);
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
    render(<BPChartNivo data={sampleData} />);
    expect(typeof capturedProps.pointBorderColor).not.toBe('function');
    // @nivo/line's Point type has `seriesColor`, never `serieColor` — the
    // component previously asked for a field that doesn't exist.
    expect(capturedProps.pointBorderColor).toEqual({ from: 'seriesColor' });
  });

  it('draws real, non-NaN point radii only for Systolic/Diastolic, never the reference bands', () => {
    render(<BPChartNivo data={sampleData} />);

    const pointLayers = capturedProps.layers.filter((l) => typeof l === 'function');
    // Call every custom layer with a shared synthetic context: the ref-line
    // and data-line layers only read `series`/`lineGenerator` (both harmless
    // no-ops here), so this isolates the points layer without guessing which
    // array index it lives at.
    const ctx = { lineGenerator: () => 'M0,0', series: [], points: syntheticPoints };
    const rendered = pointLayers.flatMap((layer) => {
      const result = layer(ctx);
      return Array.isArray(result) ? result : [result];
    });
    const circles = rendered.filter((el) => el && el.type === 'circle');

    expect(circles).toHaveLength(2);
    circles.forEach((circle) => {
      expect(Number.isFinite(circle.props.r)).toBe(true);
      expect(circle.props.r).toBeGreaterThan(0);
      expect(['Systolic', 'Diastolic']).toContain(
        syntheticPoints.find((p) => p.id === circle.key)?.seriesId
      );
    });
  });
});
