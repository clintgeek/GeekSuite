import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Typography, Card, CardContent } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { ResponsivePie } from '@nivo/pie';
import { categorizeBP, BP_STAGES } from '../../utils/bpUtils.js';
import { bpStageWords } from '../../utils/plainWords.js';

// Category name and color come from the one shared categoriser.
const getBPCategory = (systolic, diastolic, mode) => {
  const category = categorizeBP(systolic, diastolic, mode);
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
 *
 * THE TOOLTIP LETS GO. On a phone, a tap on a slice shows its tooltip, and
 * nothing ever told nivo the finger had gone: it stayed up over the page
 * after a scroll, squeezed to one word per line at the card's edge. A scroll
 * now closes it (the pie is remounted, which is the only way nivo lets go
 * of a tooltip from outside), and its lines never wrap.
 */
const BPCategoryDistribution = ({ bpLogs = [], windowLabel = '' }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const [pieKey, setPieKey] = useState(0);
  const tipShown = useRef(false);
  useEffect(() => {
    const close = () => {
      if (!tipShown.current) return;
      tipShown.current = false;
      setPieKey((k) => k + 1);
    };
    window.addEventListener('scroll', close, true);
    return () => window.removeEventListener('scroll', close, true);
  }, []);
  const chartData = useMemo(() => {
    if (!bpLogs || bpLogs.length === 0) return [];

    // Count readings by category
    const categoryCounts = {};
    bpLogs.forEach(log => {
      const category = getBPCategory(log.systolic, log.diastolic, theme.palette.mode);
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
  }, [bpLogs, theme.palette.mode]);

  if (chartData.length === 0) {
    return (
      <Card>
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
    <Card>
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
            key={pieKey}
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
            // The stage tones are deep by day (paper on them 5:1 and up)
            // and pale at night, where the walnut reads on them instead.
            arcLabelsTextColor={isDark ? theme.palette.background.default : theme.palette.background.paper}
            arcLabelsRadiusOffset={0.55}
            theme={{
              labels: {
                text: {
                  fontSize: 14,
                  fontWeight: 700
                }
              }
            }}
            tooltip={({ datum }) => {
              tipShown.current = true;
              return (
                <Box data-testid="bp-donut-tooltip" sx={{
                  whiteSpace: 'nowrap',
                  backgroundColor: theme.palette.background.paper,
                  border: `1px solid ${theme.palette.divider}`,
                  borderRadius: '12px',
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
              );
            }}
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
