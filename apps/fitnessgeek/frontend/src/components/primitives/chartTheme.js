/**
 * Shared Nivo chart theme for FitnessGeek.
 *
 * Typography inherits the app face (Nunito) for axis values, tabular-nums,
 * muted colors. Invisible grid (dotted, 5% opacity). No axis domain
 * lines, no tick marks — the data is the foreground, the chrome disappears.
 *
 * Usage:
 *   const theme = useTheme();
 *   const chartTheme = useMemo(() => buildChartTheme(theme), [theme]);
 *   <ResponsiveLine theme={chartTheme} ... />
 */
export const buildChartTheme = (theme) => {
  const isDark = theme.palette.mode === 'dark';
  const muted = theme.palette.text.secondary;

  return {
    background: 'transparent',
    textColor: muted,
    fontFamily: "inherit",
    fontSize: 10,
    axis: {
      domain: { line: { stroke: 'transparent' } },
      ticks: {
        line: { stroke: 'transparent' },
        text: {
          fill: muted,
          fontSize: 10,
          fontFamily: "inherit",
          fontWeight: 500,
          letterSpacing: '0.02em',
        },
      },
      legend: { text: { fill: muted, fontSize: 10 } },
    },
    grid: {
      line: {
        stroke: isDark ? 'rgba(247, 237, 224, 0.08)' : 'rgba(92, 64, 32, 0.12)',
        strokeWidth: 1,
        strokeDasharray: '2 4',
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
        // The same paper card as every other tooltip in the app, at a
        // readable size.
        fontSize: 14,
        borderRadius: 12,
        border: `1px solid ${theme.palette.cardBorder || theme.palette.divider}`,
        boxShadow: isDark ? '0 10px 24px -12px rgba(0, 0, 0, 0.7)' : '0 10px 24px -14px rgba(92, 64, 32, 0.3)',
      },
    },
  };
};

export default buildChartTheme;
