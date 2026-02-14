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

const WeightChartNivo = ({ data, goalLine, startWeight, targetWeight, startDate, goalDate, unit = 'lbs' }) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  // Transform data for Nivo
  const chartData = useMemo(() => {
    const result = [];

    if (data && data.length > 0) {
      // Sort data by date and map for chart
      const sortedData = [...data]
        .sort((a, b) => new Date(a.log_date) - new Date(b.log_date))
        .map(item => {
          try {
            return {
              date: goalLine && startDate && goalDate ?
                new Date(item.log_date) :
                new Date(item.log_date).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric'
                }),
              value: parseFloat(item.weight_value) || 0,
              fullDate: item.log_date
            };
          } catch (error) {
            console.error('Error processing weight data item:', item, error);
            return null;
          }
        })
        .filter(item => item !== null);

      result.push({
        id: 'weight',
        color: theme.palette.primary.main,
        data: sortedData.map(item => ({ x: item.date, y: item.value }))
      });
    }

    // Add goal line only for goal display: always two points, start and finish of goal period
    if (goalLine && startWeight != null && targetWeight != null && startDate && goalDate) {
      try {
        const firstDate = new Date(startDate);
        const goalDateObj = new Date(goalDate);

        // Create goal line data points that span the entire goal period
        const goalStartDate = new Date(firstDate);
        const goalEndDate = new Date(goalDateObj);

        const goalData = [
          {
            x: goalStartDate,
            y: parseFloat(startWeight) || 0
          },
          {
            x: goalEndDate,
            y: parseFloat(targetWeight) || 0
          }
        ];

        result.push({
          id: 'goal',
          color: theme.palette.secondary.main,
          data: goalData
        });
      } catch (error) {
        console.error('Error creating goal line:', error);
      }
    }

    return result;
  }, [data, goalLine, startWeight, targetWeight, startDate, goalDate, theme.palette]);



  if (chartData.length === 0 && !(goalLine && startDate && goalDate && startWeight != null && targetWeight != null)) {
    return (
      <Card sx={{
        width: '100%',
        backgroundColor: 'background.paper',
        borderRadius: 2,
        boxShadow: 1,
        border: 'none'
      }}>
        <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
          <Box sx={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            height: 300,
            color: 'text.secondary'
          }}>
            <Typography variant="body2">
              No weight data available
            </Typography>
          </Box>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card sx={{
      width: '100%',
      backgroundColor: 'background.paper',
      borderRadius: 2,
      boxShadow: 1,
      border: 'none'
    }}>
      <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
        <Box sx={{ height: isMobile ? 250 : 300 }}>
          <ResponsiveLine
            data={chartData.length > 0 ? chartData : [
              { id: 'weight', color: theme.palette.primary.main, data: [] },
              { id: 'goal', color: theme.palette.secondary.main, data: [
                { x: new Date(startDate), y: parseFloat(startWeight) || 0 },
                { x: new Date(goalDate), y: parseFloat(targetWeight) || 0 }
              ]}
            ]}
            margin={{ top: 20, right: 30, left: 70, bottom: 50 }}
            xScale={{
              type: goalLine && startDate && goalDate ? 'time' : 'point',
              ...(goalLine && startDate && goalDate ? {
                format: '%b %d',
                useUTC: false,
                min: startDate ? new Date(startDate) : undefined,
                max: goalDate ? new Date(goalDate) : undefined
              } : {})
            }}
            yScale={{
              type: 'linear',
              min: 'auto',
              max: 'auto',
              stacked: false
            }}
            axisTop={null}
            axisRight={null}
            axisBottom={{
              tickSize: 5,
              tickPadding: 5,
              tickRotation: isMobile ? -45 : 0,
              ...(goalLine && startDate && goalDate ? {
                format: '%b %d'
              } : {
                // Limit labels for different time ranges to prevent overlap
                tickValues: (() => {
                  if (!data || data.length === 0) return undefined;

                  const sortedData = [...data].sort((a, b) => new Date(a.log_date) - new Date(b.log_date));
                  const startDate = new Date(sortedData[0].log_date);
                  const endDate = new Date(sortedData[sortedData.length - 1].log_date);
                  const daysDiff = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));

                  // Determine how many labels to show based on time range
                  let maxLabels;
                  if (daysDiff <= 7) {
                    maxLabels = daysDiff; // Show all days for week view
                  } else if (daysDiff <= 30) {
                    maxLabels = 7; // Show ~weekly labels for month view
                  } else if (daysDiff <= 90) {
                    maxLabels = 6; // Show ~bi-weekly labels for quarter view
                  } else {
                    maxLabels = 8; // Show ~monthly labels for year+ view
                  }

                  const step = Math.max(1, Math.floor(data.length / maxLabels));
                  return data
                    .sort((a, b) => new Date(a.log_date) - new Date(b.log_date))
                    .filter((_, index) => index % step === 0 || index === data.length - 1)
                    .map(item => new Date(item.log_date).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric'
                    }));
                })()
              })
            }}
            axisLeft={{
              tickSize: 5,
              tickPadding: 5,
              tickRotation: 0,
              legend: `Weight (${unit})`,
              legendOffset: -40,
              legendPosition: 'middle'
            }}
            enableGridX={true}
            enableGridY={true}
            gridXValues={5}
            gridYValues={5}
            colors={chartData.map(serie => serie.color)}
            lineWidth={isMobile ? 2 : 3}
            pointSize={isMobile ? 4 : 6}
            pointColor={{ theme: 'background' }}
            pointBorderWidth={2}
            pointBorderColor={{ from: 'serieColor' }}
            pointLabelYOffset={-12}
            enableArea={false}
            useMesh={true}
            enableSlices={false}
            tooltip={({ point }) => {
              // Find the corresponding weight point for the same date
              const weightPoint = chartData.find(serie => serie.id === 'weight')?.data.find(d => d.x === point.data.x);
              const goalPoint = chartData.find(serie => serie.id === 'goal')?.data.find(d => d.x === point.data.x);

              // Format the date properly
              const formatDate = (dateValue) => {
                if (dateValue instanceof Date) {
                  return dateValue.toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric'
                  });
                }
                return dateValue || 'Unknown Date';
              };

              return (
                <div style={{
                  backgroundColor: theme.palette.background.paper,
                  border: `1px solid ${theme.palette.divider}`,
                  borderRadius: 6,
                  padding: 12,
                  boxShadow: theme.shadows[4],
                  minWidth: 120,
                  color: theme.palette.text.primary,
                  fontSize: '12px'
                }}>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>
                    {formatDate(point?.data?.x)}
                  </div>
                  {weightPoint && (
                    <div style={{ color: theme.palette.primary.main, fontWeight: 500, marginBottom: 2 }}>
                      Weight: {weightPoint.y.toFixed(1)} {unit}
                    </div>
                  )}
                  {goalPoint && (
                    <div style={{ color: theme.palette.secondary.main, fontWeight: 500 }}>
                      Goal: {goalPoint.y.toFixed(1)} {unit}
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
            enablePointLabel={false}
            pointLabel="y"
            pointLabelFormat=".1f"
            crosshairType="cross"
          />
        </Box>

        {/* Legend */}
        <Box sx={{ display: 'flex', justifyContent: 'center', gap: 3, mt: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box sx={{ width: 16, height: 2, backgroundColor: theme.palette.primary.main }} />
            <Typography variant="caption">Weight</Typography>
          </Box>
          {goalLine && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box sx={{ width: 16, height: 2, backgroundColor: theme.palette.secondary.main }} />
              <Typography variant="caption">Goal</Typography>
            </Box>
          )}
        </Box>
      </CardContent>
    </Card>
  );
};

export default WeightChartNivo;