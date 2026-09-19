/**
 * BPReport's per-category day-count loop (~line 340-354) colored every count
 * with a hardcoded `categorizeBP(120, 80).color` (Stage 1's orange) instead
 * of the loop's own category. So a Normal count and a Crisis count both
 * rendered in the same wrong orange.
 *
 * This renders one Normal reading and two Crisis readings and asserts each
 * count swatch uses ITS OWN category's color — which fails against the old
 * hardcoded color (both would be Stage 1 orange, #f97316).
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import BPReport from '../BPReport.jsx';
import { categorizeBP } from '../../../utils/bpUtils.js';

const NORMAL_COLOR = categorizeBP(118, 76).color;
const CRISIS_COLOR = categorizeBP(190, 70).color;
const STAGE_1_ORANGE = categorizeBP(120, 80).color; // the old hardcoded value

describe('BPReport summary — per-category color', () => {
  it('colors the Normal count green and the Crisis count red, not both orange', () => {
    render(
      <BPReport
        bpLogs={[
          { id: 'a', systolic: 118, diastolic: 76, log_date: '2026-06-01T00:00:00.000Z' },
          { id: 'b', systolic: 190, diastolic: 70, log_date: '2026-06-02T00:00:00.000Z' },
          { id: 'c', systolic: 190, diastolic: 70, log_date: '2026-06-03T00:00:00.000Z' },
        ]}
        onClose={() => {}}
      />
    );

    const normalCount = screen.getByText('1').closest('div').querySelector('h4, [class*="MuiTypography-h4"]') || screen.getByText('1');
    const crisisCount = screen.getByText('2').closest('div').querySelector('h4, [class*="MuiTypography-h4"]') || screen.getByText('2');

    expect(normalCount).toHaveStyle({ color: NORMAL_COLOR });
    expect(crisisCount).toHaveStyle({ color: CRISIS_COLOR });
    // The tell: under the bug, both of these would equal Stage 1's orange.
    expect(NORMAL_COLOR).not.toBe(STAGE_1_ORANGE);
    expect(crisisCount).not.toHaveStyle({ color: STAGE_1_ORANGE });
  });
});
