import React, { useLayoutEffect, useRef, useState } from 'react';
import { Box, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { tooltipShift } from './chartTips.js';

/**
 * The weight and body-composition charts' tooltip (review D-4).
 *
 * On a phone it used to come up by itself when the page loaded (a phone's
 * tap leaves an emulated mouse behind, and nivo answers mouse moves), clip
 * off the left edge (nivo flips it to the cursor's left past the middle,
 * whatever its width), and — with no width of its own — wrap one word per
 * line ("Sep / 24 / 7- / day / avg").
 *
 *   - `useTooltipGuard` (chartTips.js): no tooltip until the person actually touches or
 *     moves over the chart; it goes again when the pointer leaves.
 *   - `ChartTooltip`: a min-width, rows that never wrap, and a shift that
 *     keeps it inside the chart at either edge.
 */

/**
 * @param {{chartRef: React.RefObject<HTMLElement>, marginLeft: number, x: number, title: string,
 *   rows: Array<{key: string, label: string, value: string, color?: string}>}} props
 *   `x` is the slice's position inside the plot (nivo's `slice.x`).
 */
function ChartTooltip({ chartRef, marginLeft = 0, x = 0, title, rows = [] }) {
  const theme = useTheme();
  const ref = useRef(null);
  const [shift, setShift] = useState(0);

  useLayoutEffect(() => {
    const width = ref.current?.offsetWidth || 0;
    const chartWidth = chartRef?.current?.offsetWidth || 0;
    setShift(tooltipShift({ cursorX: marginLeft + x, width, chartWidth }));
  }, [chartRef, marginLeft, x, title, rows.length]);

  return (
    <Box
      ref={ref}
      data-testid="chart-tooltip"
      sx={{
        transform: shift ? `translateX(${shift}px)` : undefined,
        background: theme.palette.background.paper,
        px: 1.5,
        py: 1,
        borderRadius: 1.5,
        border: `1px solid ${theme.palette.divider}`,
        boxShadow: theme.shadows[4],
        minWidth: 168,
        whiteSpace: 'nowrap',
      }}
    >
      <Typography sx={{ fontSize: '0.8125rem', fontWeight: 700, color: 'text.secondary', mb: 0.5 }}>
        {title}
      </Typography>
      {rows.map((row) => (
        <Box key={row.key} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            {row.color && <Box sx={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: row.color, flexShrink: 0 }} />}
            <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary', fontWeight: 600 }}>{row.label}</Typography>
          </Box>
          <Typography sx={{ fontSize: '0.8125rem', fontWeight: 700, color: 'text.primary', fontVariantNumeric: 'tabular-nums' }}>
            {row.value}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}

export default ChartTooltip;
