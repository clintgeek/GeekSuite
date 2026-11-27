/**
 * Shared Nivo chart theme for FitnessGeek.
 *
 * The Label: Archivo at 12px for axis text, a hairline grid in `divider`,
 * square tooltips with a 2px ink border and no shadow. No axis domain lines
 * or tick marks — the data is the foreground.
 *
 * Usage:
 *   const theme = useTheme();
 *   const chartTheme = useMemo(() => buildChartTheme(theme), [theme]);
 *   <ResponsiveLine theme={chartTheme} ... />
 */
export const buildChartTheme = (theme) => {
  const muted = theme.palette.text.secondary;

  return {
    background: 'transparent',
    textColor: muted,
    fontFamily: theme.typography.fontFamily,
    fontSize: 12,
    axis: {
      domain: { line: { stroke: 'transparent' } },
      ticks: {
        line: { stroke: 'transparent' },
        text: {
          fill: muted,
          fontSize: 12,
          fontFamily: theme.typography.fontFamily,
          fontWeight: 500,
          letterSpacing: '0.02em',
        },
      },
      legend: { text: { fill: muted, fontSize: 12 } },
    },
    grid: {
      line: {
        stroke: theme.palette.divider,
        strokeWidth: 1,
      },
    },
    crosshair: {
      line: {
        stroke: muted,
        strokeWidth: 1,
        strokeOpacity: 0.3,
        strokeDasharray: '4 4',
      },
    },
    tooltip: {
      container: {
        background: theme.palette.background.paper,
        color: theme.palette.text.primary,
        // A square label with a 2px ink border, at a readable size.
        fontSize: 14,
        borderRadius: 0,
        border: `2px solid ${theme.palette.text.primary}`,
        boxShadow: 'none',
      },
    },
  };
};

export default buildChartTheme;
