import React, { useMemo } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  useTheme,
  useMediaQuery
} from '@mui/material';
import { ResponsiveLine } from '@nivo/line';

const BPChartNivo = ({ data, unit = 'mmHg' }) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  // Smart algorithm to determine optimal tick frequency
  const getOptimalTickValues = (dataPoints) => {
    if (!dataPoints || dataPoints.length === 0) return [];

    const totalPoints = dataPoints.length;
    const firstDate = new Date(dataPoints[0].fullDate);
    const lastDate = new Date(dataPoints[dataPoints.length - 1].fullDate);
    const daysSpan = Math.ceil((lastDate - firstDate) / (1000 * 60 * 60 * 24));

    // Determine optimal number of labels based on time span and data density
    let optimalLabels;

    if (daysSpan <= 7) {
      // Week or less: show all points (up to 7)
      optimalLabels = Math.min(totalPoints, 7);
    } else if (daysSpan <= 30) {
      // Month: show every 3-5 days
      optimalLabels = Math.min(Math.ceil(totalPoints / 3), 10);
    } else if (daysSpan <= 90) {
      // Quarter: show every 7-10 days
      optimalLabels = Math.min(Math.ceil(totalPoints / 5), 12);
    } else if (daysSpan <= 365) {
      // Year: show every 2-4 weeks
      optimalLabels = Math.min(Math.ceil(totalPoints / 10), 15);
    } else {
      // More than a year: show monthly or quarterly
      optimalLabels = Math.min(Math.ceil(totalPoints / 20), 20);
    }

    // Ensure we have at least 2 labels and at most totalPoints
    optimalLabels = Math.max(2, Math.min(optimalLabels, totalPoints));

    // Calculate step size to distribute labels evenly
    const step = Math.max(1, Math.floor(totalPoints / optimalLabels));

    // Generate tick values
    const tickValues = [];
    for (let i = 0; i < totalPoints; i += step) {
      tickValues.push(dataPoints[i].date);
    }

    // Always include the last point if it's not already included
    if (tickValues.length > 0 && tickValues[tickValues.length - 1] !== dataPoints[dataPoints.length - 1].date) {
      tickValues.push(dataPoints[dataPoints.length - 1].date);
    }

    return tickValues;
  };

  // Transform data for Nivo
  const chartData = useMemo(() => {
    if (!data || data.length === 0) return [];

    // Sort data by date
    const sortedData = [...data]
      .filter(item => {
        const s = parseFloat(item.systolic);
        const d = parseFloat(item.diastolic);
        const date = new Date(item.log_date);
        return !isNaN(s) && !isNaN(d) && !isNaN(date.getTime());
      })
      .sort((a, b) => new Date(a.log_date) - new Date(b.log_date))
      .map(item => ({
        date: new Date(item.log_date).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric'
        }),
        systolic: parseFloat(item.systolic),
        diastolic: parseFloat(item.diastolic),
        fullDate: item.log_date
      }));

    const result = [
      {
        id: 'Systolic',
        color: '#ef4444',
        data: sortedData.map(item => ({
          x: item.date,
          y: item.systolic
        }))
      },
      {
        id: 'Diastolic',
        color: '#0D9488',
        data: sortedData.map(item => ({
          x: item.date,
          y: item.diastolic
        }))
      },
      // Reference lines for BP categories
      {
        id: 'Normal (120/80)',
        color: '#10b981',
        data: sortedData.map(item => ({
          x: item.date,
          y: 120
        }))
      },
      {
        id: 'Elevated (130)',
        color: '#f59e0b',
        data: sortedData.map(item => ({
          x: item.date,
          y: 130
        }))
      },
      {
        id: 'Stage 1 (140)',
        color: '#f97316',
        data: sortedData.map(item => ({
          x: item.date,
          y: 140
        }))
      }
    ];

    return result;
  }, [data, theme.palette]);

  // Get optimal tick values
  const optimalTickValues = useMemo(() => {
    if (!data || data.length === 0) return [];

    const sortedData = [...data]
      .sort((a, b) => new Date(a.log_date) - new Date(b.log_date))
      .map(item => ({
        date: new Date(item.log_date).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric'
        }),
        fullDate: item.log_date
      }));

    return getOptimalTickValues(sortedData);
  }, [data]);

  if (chartData.length === 0) {
    return (
      <Card sx={{
        borderRadius: '20px',
        boxShadow: theme.shadows[1],
        border: `1px solid ${ theme.palette.divider }`
      }}>
        <CardContent sx={{ p: 4 }}>
          <Box sx={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            height: 300,
            color: theme.palette.text.secondary
          }}>
            <Typography variant="body2">
              No blood pressure data available
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
      border: `1px solid ${ theme.palette.divider }`
    }}>
      <CardContent sx={{ p: 3 }}>
        <Box sx={{ height: isMobile ? 200 : 220 }}>
          <ResponsiveLine
            data={chartData}
            margin={{ top: 20, right: 30, left: 50, bottom: 50 }}
            xScale={{ type: 'point' }}
            yScale={{
              type: 'linear',
              min: 60,
              max: 180,
              stacked: false
            }}
            axisTop={null}
            axisRight={null}
            axisBottom={{
              tickSize: 5,
              tickPadding: 5,
              tickRotation: isMobile ? -30 : 0,
              tickValues: optimalTickValues
            }}
            axisLeft={{
              tickSize: 5,
              tickPadding: 5,
              tickRotation: 0,
              legend: `Blood Pressure (${ unit })`,
              legendOffset: -40,
              legendPosition: 'middle'
            }}
            enableGridX={true}
            enableGridY={true}
            gridXValues={chartData[0]?.data?.map(d => d.x) || []}
            gridYValues={[60, 80, 90, 120, 130, 140, 160, 180]}
            pointColor={{ theme: 'background' }}
            pointBorderWidth={2}
            pointBorderColor={{ from: 'serieColor' }}
            pointLabelYOffset={-12}
            enableArea={false}
            useMesh={true}
            enableSlices={false}
            // Style reference lines differently from actual readings
            colors={(serie) => serie.color}
            lineWidth={(serie) => {
              // Reference lines are thin
              if (serie.id.includes('Normal') || serie.id.includes('Elevated') || serie.id.includes('Stage')) {
                return 1.5;
              }
              // Actual readings are thick
              return 3;
            }}
            pointSize={(serie) => {
              // Reference lines have no points
              if (serie.id.includes('Normal') || serie.id.includes('Elevated') || serie.id.includes('Stage')) {
                return 0;
              }
              // Actual readings have visible points
              return isMobile ? 5 : 7;
            }}
            enablePointLabel={false}
            defs={[
              {
                id: 'dashedLine',
                type: 'patternLines',
                background: 'transparent',
                color: 'inherit',
                rotation: 0,
                lineWidth: 2,
                spacing: 6
              }
            ]}
            fill={[
              { match: { id: 'Normal (120/80)' }, id: 'dashedLine' },
              { match: { id: 'Elevated (130)' }, id: 'dashedLine' },
              { match: { id: 'Stage 1 (140)' }, id: 'dashedLine' }
            ]}
            tooltip={({ point }) => {
              // Find all values for the same date
              const systolicPoint = chartData.find(serie => serie.id === 'systolic')?.data.find(d => d.x === point.data.x);
              const diastolicPoint = chartData.find(serie => serie.id === 'diastolic')?.data.find(d => d.x === point.data.x);

              return (
                <div style={{
                  backgroundColor: theme.palette.background.paper,
                  border: `1px solid ${ theme.palette.divider }`,
                  borderRadius: 6,
                  padding: 12,
                  boxShadow: theme.shadows[4],
                  minWidth: 120,
                  color: theme.palette.text.primary,
                  fontSize: '12px'
                }}>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>
                    {point?.data?.x || 'Unknown Date'}
                  </div>
                  {systolicPoint && (
                    <div style={{ color: theme.palette.error.main, fontWeight: 500, marginBottom: 2 }}>
                      Systolic: {systolicPoint.y} {unit}
                    </div>
                  )}
                  {diastolicPoint && (
                    <div style={{ color: theme.palette.info.main, fontWeight: 500 }}>
                      Diastolic: {diastolicPoint.y} {unit}
                    </div>
                  )}
                </div>
              );
            }}
            theme={{
              axis: {
                ticks: {
                  text: {
                    fill: theme.palette.text.secondary,
                    fontSize: isMobile ? 10 : 12
                  }
                },
                legend: {
                  text: {
                    fill: theme.palette.text.primary,
                    fontSize: isMobile ? 10 : 12,
                    fontWeight: 600
                  }
                }
              },
              grid: {
                line: {
                  stroke: theme.palette.divider,
                  strokeWidth: 1,
                  opacity: 0.3
                }
              },
              tooltip: {
                container: {
                  background: theme.palette.background.paper,
                  color: theme.palette.text.primary,
                  fontSize: 12,
                  borderRadius: 4,
                  boxShadow: theme.shadows[4]
                }
              }
            }}
            curve="monotoneX"
            crosshairType="cross"
            layers={[
              'grid',
              'axes',
              'areas',
              'lines',
              'points',
              'mesh',
              'legends',
              'annotations'
            ]}
            // Add shaded areas for normal ranges
            areaBaselineValue={0}
            areaOpacity={0.1}
            areaBlendMode="normal"
          // areaGenerator={() => {
          //   // Create shaded areas for normal BP ranges
          //   const normalSystolicArea = {
          //     id: 'normal-systolic',
          //     color: theme.palette.success.main,
          //     data: chartData[0]?.data?.map(point => ({
          //       x: point.x,
          //       y: 120 // Normal systolic upper bound
          //     })) || []
          //   };

          //   const normalDiastolicArea = {
          //     id: 'normal-diastolic',
          //     color: theme.palette.success.main,
          //     data: chartData[0]?.data?.map(point => ({
          //       x: point.x,
          //       y: 80 // Normal diastolic upper bound
          //     })) || []
          //   };

          //   return [normalSystolicArea, normalDiastolicArea];
          // }}
          />
        </Box>

        {/* Legend */}
        <Box sx={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'center',
          gap: { xs: 1.5, sm: 2 },
          mt: 2
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Box sx={{ width: 20, height: 3, backgroundColor: '#ef4444', borderRadius: 1 }} />
            <Typography variant="caption" sx={{ fontWeight: 600 }}>Systolic</Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Box sx={{ width: 20, height: 3, backgroundColor: '#0D9488', borderRadius: 1 }} />
            <Typography variant="caption" sx={{ fontWeight: 600 }}>Diastolic</Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Box sx={{ width: 20, height: 2, borderTop: '2px dashed #10b981' }} />
            <Typography variant="caption" sx={{ color: theme.palette.text.secondary }}>Normal (120)</Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Box sx={{ width: 20, height: 2, borderTop: '2px dashed #f59e0b' }} />
            <Typography variant="caption" sx={{ color: theme.palette.text.secondary }}>Elevated (130)</Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Box sx={{ width: 20, height: 2, borderTop: '2px dashed #f97316' }} />
            <Typography variant="caption" sx={{ color: theme.palette.text.secondary }}>Stage 1 (140)</Typography>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
};

export default BPChartNivo;