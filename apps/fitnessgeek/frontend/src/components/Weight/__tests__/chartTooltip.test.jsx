/**
 * Review D-4 — the weight and body-composition chart tooltips on a phone:
 * not up on load, a width of their own, kept inside the chart at the edges;
 * a "lb" unit on the y-axis; mass axes at least ~10 lb tall.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

let lineProps = [];
// Stands in for nivo's slice, which hides its tooltip on touchend.
const sliceTouchEnd = vi.fn();
vi.mock('@nivo/line', () => ({
  ResponsiveLine: (props) => {
    lineProps.push(props);
    return <svg><rect data-testid="nivo-slice" onTouchEnd={sliceTouchEnd} /></svg>;
  },
}));

const { tooltipShift, massDomain } = await import('../chartTips.js');
const { default: WeightTimeline } = await import('../WeightTimeline.jsx');
const { default: BodyCompTrend, yRange } = await import('../../BodyComposition/BodyCompTrend.jsx');

const slice = (x, ymd = '2026-06-18') => ({
  x,
  points: [
    { id: 'a', seriesId: '7-day average', seriesColor: 'green', data: { xFormatted: ymd, yFormatted: 219.94 } },
    { id: 'b', seriesId: 'Readings', seriesColor: 'green', data: { xFormatted: ymd, yFormatted: 218.7 } },
  ],
});

const weightLogs = [
  { log_date: '2026-08-01', weight_value: 200 },
  { log_date: '2026-08-08', weight_value: 199.5 },
  { log_date: '2026-08-15', weight_value: 199 },
];

describe('tooltipShift', () => {
  it('right of the middle, a wide tooltip near the left of the cursor is pushed back inside', () => {
    // 358px chart, cursor at 190: nivo puts a 180px tooltip at 190-14-180 = -4.
    expect(tooltipShift({ cursorX: 190, width: 180, chartWidth: 358 })).toBe(8);
  });
  it('left of the middle, near the right edge, it moves left', () => {
    expect(tooltipShift({ cursorX: 170, width: 180, chartWidth: 358 })).toBe(-10);
  });
  it('with room, it stays where nivo put it', () => {
    expect(tooltipShift({ cursorX: 40, width: 170, chartWidth: 800 })).toBe(0);
    expect(tooltipShift({ cursorX: 700, width: 170, chartWidth: 800 })).toBe(0);
  });
});

describe('mass axes', () => {
  it('a 1 lb wobble gets at least a 10 lb axis', () => {
    const [lo, hi] = massDomain([140, 141, 140.5]);
    expect(hi - lo).toBeGreaterThanOrEqual(10);
    expect(lo).toBeLessThanOrEqual(140);
    expect(hi).toBeGreaterThanOrEqual(141);
  });
  it('body composition panels are 10 lb tall at least', () => {
    const [lo, hi] = yRange([{ y: 138 }, { y: 139.5 }]);
    expect(hi - lo).toBeGreaterThanOrEqual(10);
  });
  it('the weight chart is too', () => {
    lineProps = [];
    render(<WeightTimeline weightLogs={weightLogs} unit="lbs" />);
    const { yScale } = lineProps.at(-1);
    expect(yScale.max - yScale.min).toBeGreaterThanOrEqual(10);
  });
});

describe('the weight chart tooltip', () => {
  it('says the unit once on the y-axis', () => {
    render(<WeightTimeline weightLogs={weightLogs} unit="lbs" />);
    expect(screen.getByTestId('weight-y-unit')).toHaveTextContent('lb');
  });

  it('stays hidden until the chart is actually touched', () => {
    lineProps = [];
    render(<WeightTimeline weightLogs={weightLogs} unit="lbs" />);
    const Tip = lineProps.at(-1).sliceTooltip;
    // Nivo asks for the tooltip on any mouse move — including the one a
    // phone makes up after a tap elsewhere. Not armed: nothing.
    const { container } = render(<Tip slice={slice(100)} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('once touched: sentence-case day, min-width, rows that never wrap', () => {
    lineProps = [];
    const { container: chart } = render(<WeightTimeline weightLogs={weightLogs} unit="lbs" />);
    const box = screen.getByTestId('weight-y-unit').nextElementSibling;
    fireEvent.pointerDown(box);
    const Tip = lineProps.at(-1).sliceTooltip;
    render(<Tip slice={slice(100, '2025-06-18')} />);
    const tip = screen.getByTestId('chart-tooltip');
    expect(tip).toHaveTextContent('Jun 18, 2025');
    expect(tip).toHaveTextContent('7-day average219.9 lb');
    expect(tip).toHaveTextContent('Weigh-in218.7 lb');
    const style = window.getComputedStyle(tip);
    expect(style.whiteSpace).toBe('nowrap');
    expect(style.minWidth).toBe('168px');
    expect(chart).toBeTruthy();
  });
});

/**
 * A plain tap on a phone: pointerdown, pointerup, then a touch pointerleave
 * as the finger lifts. The leave used to disarm the tap that had just armed
 * it, so a tap alone never showed the tooltip (harness 53d/53e, d-fixes).
 */
// React builds onPointerLeave from pointerout with a relatedTarget outside.
const pointer = (type, el, pointerType) => {
  const leave = type === 'pointerleave';
  const event = new Event(leave ? 'pointerout' : type, { bubbles: true });
  Object.defineProperty(event, 'pointerType', { value: pointerType });
  if (leave) Object.defineProperty(event, 'relatedTarget', { value: document.body });
  fireEvent(el, event);
};
describe('a touch on the weight chart', () => {
  const tipAfter = (steps) => {
    lineProps = [];
    render(<WeightTimeline weightLogs={weightLogs} unit="lbs" />);
    const box = screen.getByTestId('weight-y-unit').nextElementSibling;
    steps(box);
    const Tip = lineProps.at(-1).sliceTooltip;
    return render(<Tip slice={slice(100)} />).container;
  };

  it('a plain tap shows the tooltip: the finger lifting is not leaving', () => {
    const container = tipAfter((box) => {
      pointer('pointerdown', box, 'touch');
      pointer('pointerup', box, 'touch');
      pointer('pointerleave', box, 'touch');
    });
    expect(container).not.toBeEmptyDOMElement();
  });

  it('a touch that becomes a scroll shows nothing', () => {
    const container = tipAfter((box) => {
      pointer('pointerdown', box, 'touch');
      pointer('pointercancel', box, 'touch');
      pointer('pointerleave', box, 'touch');
    });
    expect(container).toBeEmptyDOMElement();
  });

  it("a tap's touchend never reaches nivo's slice, which would hide the tooltip", () => {
    sliceTouchEnd.mockClear();
    render(<WeightTimeline weightLogs={weightLogs} unit="lbs" />);
    const box = screen.getByTestId('weight-y-unit').nextElementSibling;
    const slice = screen.getByTestId('nivo-slice');
    pointer('pointerdown', slice, 'touch');
    fireEvent.touchEnd(slice);
    expect(sliceTouchEnd).not.toHaveBeenCalled();
    // A touch that became a scroll: nivo may hide it.
    pointer('pointerdown', slice, 'touch');
    pointer('pointercancel', slice, 'touch');
    fireEvent.touchEnd(slice);
    expect(sliceTouchEnd).toHaveBeenCalledTimes(1);
    expect(box).toBeTruthy();
  });

  it('a mouse leaving the chart still hides it', () => {
    const container = tipAfter((box) => {
      pointer('pointerdown', box, 'mouse');
      pointer('pointerleave', box, 'mouse');
    });
    expect(container).toBeEmptyDOMElement();
  });
});

describe('the body-composition tooltip', () => {
  const scans = [
    { log_date: '2026-09-15T00:00:00.000Z', weight_value: 220, body_fat_mass_lb: 80 },
    { log_date: '2026-09-24T00:00:00.000Z', weight_value: 219.9, body_fat_mass_lb: 79.5 },
  ];
  it('has a unit, waits for a touch, then shows in rows that never wrap', () => {
    lineProps = [];
    render(<BodyCompTrend scans={scans} />);
    expect(screen.getByTestId('bodycomp-y-unit')).toHaveTextContent('lb');
    const Tip = lineProps[0].sliceTooltip;
    const { container } = render(<Tip slice={slice(50)} />);
    expect(container).toBeEmptyDOMElement();
  });
});
