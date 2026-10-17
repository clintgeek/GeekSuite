import React, { useMemo } from 'react';
import { Box, Typography, Card, CardContent } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { ResponsivePie } from '@nivo/pie';
import { categorizeBP, BP_STAGES } from '../../utils/bpUtils.js';
import { bpStageWords } from '../../utils/plainWords.js';

// Category name and color come from the one shared categoriser.
const getBPCategory = (systolic, diastolic) => {
  const category = categorizeBP(systolic, diastolic);
  return { name: category.stage, color: category.color };
};
const ORDER = Object.values(BP_STAGES);

/**
 * Readings by range, for the window the page's range toggle chose (review
 * D-1): the toggle sits above this card and the title names the window, so
 * the donut never shows an unstated span. The legend is in plain words —
 * "Normal · A little high · High (stage 1)".
 *
 * `windowLabel`: "last 30 days", "all time", …
 */
const BPCategoryDistribution = ({ bpLogs = [], windowLabel = '' }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const chartData = useMemo(() => {
    if (!bpLogs || bpLogs.length === 0) return [];

    // Count readings by category
    const categoryCounts = {};
    bpLogs.forEach(log => {
      const category = getBPCategory(log.systolic, log.diastolic);
      if (!categoryCounts[category.name]) {
        categoryCounts[category.name] = {
          count: 0,
          color: category.color
        };
      }
      categoryCounts[category.name].count++;
    });

    // Convert to Nivo format
    return Object.entries(categoryCounts)
      .sort(([a], [b]) => ORDER.indexOf(a) - ORDER.indexOf(b))
      .map(([name, data]) => ({
        id: name,
        label: bpStageWords(name).label,
        value: data.count,
        color: data.color
      }));
  }, [bpLogs]);

  if (chartData.length === 0) {
    return (
      <Card sx={{
        borderRadius: '20px',
        boxShadow: theme.shadows[1],
        border: `1px solid ${theme.palette.divider}`
      }}>
        <CardContent sx={{ p: 4 }}>
          <Box sx={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            height: 200,
            color: theme.palette.text.secondary
          }}>
            <Typography variant="body2">
              No readings{windowLabel ? ` in the ${windowLabel}` : ''}
            </Typography>
          </Box>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card sx={{
      borderRadius: '20px',
      boxShadow: theme.shadows[1],
      border: `1px solid ${theme.palette.divider}`
    }}>
      <CardContent sx={{ p: 3 }}>
        <Typography variant="h6" component="h2" data-testid="bp-donut-title" sx={{ fontWeight: 700, color: theme.palette.text.primary, mb: 2 }}>
          Readings by range{windowLabel ? `, ${windowLabel}` : ''}
        </Typography>

        {/* @nivo/pie forwards `role` to its <svg> but not `ariaLabel` (the line
            charts forward both), so the name lives on the wrapper and the svg
            steps out of the accessibility tree. */}
        <Box
          role="img"
          aria-label={`Readings by range${windowLabel ? `, ${windowLabel}` : ''}: ${chartData.map((d) => `${d.label} ${d.value}`).join(', ')}`}
          sx={{ height: 280 }}
        >
          <ResponsivePie
            data={chartData}
            role="presentation"
            margin={{ top: 20, right: 20, bottom: 20, left: 20 }}
            innerRadius={0.6}
            padAngle={2}
            cornerRadius={4}
            activeOuterRadiusOffset={8}
            colors={d => d.data.color}
            borderWidth={2}
            borderColor={{ from: 'color', modifiers: [['darker', 0.2]] }}
            enableArcLinkLabels={false}
            arcLabel={d => `${d.value}`}
            arcLabelsSkipAngle={10}
            arcLabelsTextColor="#ffffff"
            arcLabelsRadiusOffset={0.55}
            theme={{
              labels: {
                text: {
                  fontSize: 14,
                  fontWeight: 700
                }
              }
            }}
            tooltip={({ datum }) => (
              <Box sx={{
                backgroundColor: theme.palette.background.paper,
                border: `1px solid ${theme.palette.divider}`,
                borderRadius: '8px',
                padding: '8px 12px',
                boxShadow: theme.shadows[3]
              }}>
                <Typography variant="body2" sx={{ fontWeight: 600, color: theme.palette.text.primary }}>
                  {datum.label}
                </Typography>
                <Typography variant="body2" sx={{ color: theme.palette.text.secondary }}>
                  {datum.value} of {bpLogs.length} readings
                </Typography>
              </Box>
            )}
          />
        </Box>

        {/* Legend */}
        <Box data-testid="bp-donut-legend" sx={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 2,
          justifyContent: 'center',
          mt: 2
        }}>
          {chartData.map(item => (
            <Box key={item.id} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box sx={{
                width: 12,
                height: 12,
                borderRadius: '50%',
                backgroundColor: item.color
              }} />
              <Typography variant="caption" sx={{ color: theme.palette.text.secondary, fontWeight: 500 }}>
                {item.label} ({item.value})
              </Typography>
            </Box>
          ))}
        </Box>
      </CardContent>
    </Card>
  );
};

export default BPCategoryDistribution;
