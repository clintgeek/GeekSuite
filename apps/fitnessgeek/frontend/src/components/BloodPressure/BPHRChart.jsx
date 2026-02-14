import React, { useMemo } from 'react';
import { Card, CardContent, Typography, Box } from '@mui/material';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

const BPHRChart = ({ data = [], title = 'Heart Rate (Today)' }) => {
  const points = useMemo(() => {
    if (!data || !Array.isArray(data)) return [];
    // Accept either {time, bpm} or Garmin style arrays; normalize
    return data
      .filter(p => p && (p.bpm != null || p.heartRate != null))
      .map(p => {
        const timeValue = p.time || p.timestamp || p.ts || '';

        // Format time for display
        let formattedTime = timeValue;
        if (typeof timeValue === 'number') {
          // Unix timestamp (seconds or milliseconds)
          const timestamp = timeValue > 10000000000 ? timeValue : timeValue * 1000;
          const date = new Date(timestamp);
          formattedTime = date.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
          });
        } else if (typeof timeValue === 'string' && timeValue.includes('T')) {
          // ISO string
          const date = new Date(timeValue);
          formattedTime = date.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
          });
        }

        return {
          time: formattedTime,
          rawTime: timeValue,
          bpm: p.bpm ?? p.heartRate
        };
      });
  }, [data]);

  const formatTooltip = (value, name, props) => {
    return [`${value} bpm`, 'Heart Rate'];
  };

  const formatXAxis = (value) => {
    // Show fewer labels on mobile
    return value;
  };

  return (
    <Card sx={{
      borderRadius: '20px',
      boxShadow: '0 4px 12px rgba(15, 23, 42, 0.08)',
      border: '1px solid #e2e8f0'
    }}>
      <CardContent sx={{ p: 3 }}>
        <Typography variant="h6" sx={{ mb: 2, fontWeight: 700, color: 'text.primary' }}>
          {title}
        </Typography>
        <Box sx={{ height: 250 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points} margin={{ top: 10, right: 20, left: 0, bottom: 30 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                dataKey="time"
                tick={{ fontSize: 12, fill: '#78716C' }}
                tickFormatter={formatXAxis}
                angle={-45}
                textAnchor="end"
                height={60}
                interval="preserveStartEnd"
              />
              <YAxis
                width={40}
                domain={["dataMin-5", "dataMax+5"]}
                tick={{ fontSize: 12, fill: '#78716C' }}
                label={{ value: 'BPM', angle: -90, position: 'insideLeft', style: { fill: '#78716C' } }}
              />
              <Tooltip
                formatter={formatTooltip}
                contentStyle={{
                  backgroundColor: 'white',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  boxShadow: '0 4px 12px rgba(15, 23, 42, 0.1)'
                }}
              />
              <Line
                type="monotone"
                dataKey="bpm"
                stroke="#0D9488"
                dot={false}
                strokeWidth={2}
                activeDot={{ r: 6, fill: '#0D9488' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </Box>
      </CardContent>
    </Card>
  );
};

export default BPHRChart;


