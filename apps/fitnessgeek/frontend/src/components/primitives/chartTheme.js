/**
 * Shared Nivo chart theme for FitnessGeek.
 *
 * Typography locked to JetBrains Mono for axis values, tabular-nums,
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
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 10,
    axis: {
      domain: { line: { stroke: 'transparent' } },
      ticks: {
        line: { stroke: 'transparent' },
        text: {
          fill: muted,
          fontSize: 10,
          fontFamily: "'JetBrains Mono', monospace",
          fontWeight: 500,
          letterSpacing: '0.02em',
        },
      },
      legend: { text: { fill: muted, fontSize: 10 } },
    },
    grid: {
      line: {
        stroke: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(28, 25, 23, 0.05)',
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
        fontSize: 12,
        borderRadius: 8,
        border: `1px solid ${theme.palette.divider}`,
      },
    },
  };
};

export default buildChartTheme;
