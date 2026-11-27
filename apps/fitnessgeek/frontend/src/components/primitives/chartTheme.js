/**
 * Shared Nivo chart theme for FitnessGeek.
 *
 * Daylight: the theme's font at 12px for axis text, a hairline grid in `divider`,
 * rounded tooltips with a hairline edge and a soft shadow. No axis domain
 * lines or tick marks — the data is the foreground.
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
        // A floating card with a hairline edge, at a readable size.
        fontSize: 14,
        borderRadius: '10px',
        border: `1px solid ${theme.palette.divider}`,
        boxShadow: '0 8px 24px rgba(16, 24, 40, 0.12)',
      },
    },
  };
};

export default buildChartTheme;
