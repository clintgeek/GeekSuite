import React from 'react';
import {
  Card,
  CardContent,
  Typography,
  Box
} from '@mui/material';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine
} from 'recharts';

const BPChart = ({ data, title = "Blood Pressure Trend" }) => {
  // Sort data by date (newest first) and take last 30 entries
  const sortedData = [...data]
    .sort((a, b) => new Date(a.log_date) - new Date(b.log_date))
    .slice(-30)
    .map(item => ({
      ...item,
      date: new Date(item.log_date).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric'
      })
    }));

  if (sortedData.length === 0) {
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
            height: 200,
            color: 'text.secondary'
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
      width: '100%',
      backgroundColor: 'background.paper',
      borderRadius: 2,
      boxShadow: 1,
      border: 'none'
    }}>
      <CardContent sx={{ p: { xs: 2, sm: 3 } }}>

        <Box sx={{ height: 300, mt: 1 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={sortedData}
              margin={{ top: 20, right: 30, left: 5, bottom: 20 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 12 }}
                interval="preserveStartEnd"
              />
              <YAxis
                domain={['dataMin - 10', 'dataMax + 10']}
                tick={{ fontSize: 12 }}
                width={30}
              />
              <Tooltip
                formatter={(value, name) => [
                  `${value} mmHg`,
                  name === 'systolic' ? 'Systolic' : 'Diastolic'
                ]}
                labelFormatter={(label) => `Date: ${label}`}
              />

              {/* Systolic line (red) */}
              <Line
                type="monotone"
                dataKey="systolic"
                stroke="#d32f2f"
                strokeWidth={2}
                dot={{ fill: '#d32f2f', strokeWidth: 2, r: 4 }}
                activeDot={{ r: 6 }}
                name="Systolic"
              />

              {/* Diastolic line (blue) */}
              <Line
                type="monotone"
                dataKey="diastolic"
                stroke="#1976d2"
                strokeWidth={2}
                dot={{ fill: '#1976d2', strokeWidth: 2, r: 4 }}
                activeDot={{ r: 6 }}
                name="Diastolic"
              />

              {/* Normal BP reference lines */}
              <ReferenceLine y={120} stroke="#4caf50" strokeDasharray="3 3" label="Normal Systolic" />
              <ReferenceLine y={80} stroke="#4caf50" strokeDasharray="3 3" label="Normal Diastolic" />
            </LineChart>
          </ResponsiveContainer>
        </Box>

        {/* Legend */}
        <Box sx={{ display: 'flex', justifyContent: 'center', gap: 3, mt: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box sx={{ width: 16, height: 2, backgroundColor: '#d32f2f' }} />
            <Typography variant="caption">Systolic</Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box sx={{ width: 16, height: 2, backgroundColor: '#1976d2' }} />
            <Typography variant="caption">Diastolic</Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box sx={{ width: 16, height: 2, backgroundColor: '#4caf50', borderTop: '1px dashed #4caf50' }} />
            <Typography variant="caption">Normal Range</Typography>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
};

export default BPChart;