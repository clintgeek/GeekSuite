/**
 * The BP donut's tooltip on a phone (harness 67a, d-fixes): a tap showed it,
 * and after a scroll it stayed up over the page, wrapped one word per line.
 * A scroll closes it now, and its lines never wrap.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';

let mounts = 0;
let lastProps = null;
vi.mock('@nivo/pie', async () => {
  const React = await import('react');
  return {
    ResponsivePie: (props) => {
      React.useEffect(() => { mounts += 1; }, []);
      lastProps = props;
      return null;
    },
  };
});

const { default: BPCategoryDistribution } = await import('../BPCategoryDistribution.jsx');

const logs = [
  { systolic: 118, diastolic: 74 },
  { systolic: 126, diastolic: 78 },
  { systolic: 131, diastolic: 80 },
];

describe('the BP donut tooltip', () => {
  it('a scroll closes a tooltip a tap opened', () => {
    mounts = 0;
    render(<BPCategoryDistribution bpLogs={logs} windowLabel="last 30 days" />);
    expect(mounts).toBe(1);
    const Tip = lastProps.tooltip;
    render(<Tip datum={{ label: 'Normal', value: 1 }} />);
    act(() => { window.dispatchEvent(new Event('scroll')); });
    // Remounted: nivo drops the tooltip it was holding.
    expect(mounts).toBe(2);
    // No tooltip up, nothing to close: a scroll leaves the pie alone.
    act(() => { window.dispatchEvent(new Event('scroll')); });
    expect(mounts).toBe(2);
  });

  it('keeps each line whole', () => {
    render(<BPCategoryDistribution bpLogs={logs} windowLabel="last 30 days" />);
    const Tip = lastProps.tooltip;
    render(<Tip datum={{ label: 'A little high', value: 1 }} />);
    expect(window.getComputedStyle(screen.getByText('1 of 3 readings').parentElement).whiteSpace).toBe('nowrap');
  });
});
