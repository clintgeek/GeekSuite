import React, { useMemo } from 'react';
import { Box, Typography, Card, CardContent } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { ResponsivePie } from '@nivo/pie';

// BP Categories based on AHA guidelines
const getBPCategory = (systolic, diastolic) => {
  if (systolic < 120 && diastolic < 80) {
    return { name: 'Normal', color: '#10b981' };
  } else if (systolic >= 120 && systolic < 130 && diastolic < 80) {
    return { name: 'Elevated', color: '#f59e0b' };
  } else if ((systolic >= 130 && systolic < 140) || (diastolic >= 80 && diastolic < 90)) {
    return { name: 'Stage 1', color: '#f97316' };
  } else if (systolic >= 140 || diastolic >= 90) {
    return { name: 'Stage 2', color: '#ef4444' };
  } else if (systolic >= 180 || diastolic >= 120) {
    return { name: 'Crisis', color: '#dc2626' };
  }
  return { name: 'Unknown', color: '#78716C' };
};

const BPCategoryDistribution = ({ bpLogs = [] }) => {
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
    return Object.entries(categoryCounts).map(([name, data]) => ({
      id: name,
      label: name,
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
              No data for category distribution
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
        <Typography variant="h6" sx={{ fontWeight: 700, color: theme.palette.text.primary, mb: 2 }}>
          Category Distribution
        </Typography>

        <Box sx={{ height: 280 }}>
          <ResponsivePie
            data={chartData}
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
                  {datum.value} readings ({Math.round((datum.value / bpLogs.length) * 100)}%)
                </Typography>
              </Box>
            )}
          />
        </Box>

        {/* Legend */}
        <Box sx={{
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
