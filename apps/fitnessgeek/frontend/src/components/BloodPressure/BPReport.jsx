import React, { useRef } from 'react';
import {
  Box,
  Typography,
  Grid,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  useTheme
} from '@mui/material';
import {
  PictureAsPdf as PdfIcon,
  Description as MarkdownIcon,
  TableChart as CsvIcon,
  Favorite as HeartIcon
} from '@mui/icons-material';
import BPChartNivo from './BPChartNivo.jsx';
import { categorizeBP } from '../../utils/bpUtils.js';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

const BPReport = ({ bpLogs, onClose }) => {
  const reportRef = useRef(null);
  const theme = useTheme();

  // Calculate statistics
  const stats = React.useMemo(() => {
    if (!bpLogs || bpLogs.length === 0) return null;

    const sortedLogs = [...bpLogs].sort((a, b) => new Date(a.log_date) - new Date(b.log_date));
    const totalReadings = sortedLogs.length;

    // Group by week
    const weeklyData = [];
    const weekMap = new Map();

    sortedLogs.forEach(log => {
      const date = new Date(log.log_date);
      const weekStart = new Date(date);
      weekStart.setDate(date.getDate() - date.getDay());
      weekStart.setHours(0, 0, 0, 0);

      const weekKey = weekStart.toISOString().split('T')[0];

      if (!weekMap.has(weekKey)) {
        weekMap.set(weekKey, {
          weekStart,
          weekEnd: new Date(weekStart),
          readings: [],
          systolicRange: { min: Infinity, max: -Infinity },
          diastolicRange: { min: Infinity, max: -Infinity }
        });
        weekMap.get(weekKey).weekEnd.setDate(weekStart.getDate() + 6);
      }

      const week = weekMap.get(weekKey);
      week.readings.push(log);
      week.systolicRange.min = Math.min(week.systolicRange.min, log.systolic);
      week.systolicRange.max = Math.max(week.systolicRange.max, log.systolic);
      week.diastolicRange.min = Math.min(week.diastolicRange.min, log.diastolic);
      week.diastolicRange.max = Math.max(week.diastolicRange.max, log.diastolic);
    });

    // Convert to array and calculate categories
    weeklyData.push(...Array.from(weekMap.values()).map(week => {
      const avgSystolic = week.readings.reduce((sum, r) => sum + r.systolic, 0) / week.readings.length;
      const avgDiastolic = week.readings.reduce((sum, r) => sum + r.diastolic, 0) / week.readings.length;
      const category = categorizeBP(avgSystolic, avgDiastolic);

      return {
        ...week,
        count: week.readings.length,
        category
      };
    }));

    // Sort by week start date (newest first)
    weeklyData.sort((a, b) => b.weekStart - a.weekStart);

    // Calculate category counts
    const categoryCounts = {};
    sortedLogs.forEach(log => {
      const category = categorizeBP(log.systolic, log.diastolic);
      categoryCounts[category.stage] = (categoryCounts[category.stage] || 0) + 1;
    });

    return {
      totalReadings,
      weeklyData,
      categoryCounts,
      dateRange: {
        start: sortedLogs[0].log_date,
        end: sortedLogs[sortedLogs.length - 1].log_date
      }
    };
  }, [bpLogs]);

  const formatWeekRange = (start, end) => {
    const startStr = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const endStr = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    return `${startStr} - ${endStr}`;
  };

  const exportToPDF = async () => {
    if (!reportRef.current) return;

    try {
      const canvas = await html2canvas(reportRef.current, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff'
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const imgWidth = 210;
      const pageHeight = 295;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;

      while (heightLeft >= 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      pdf.save(`blood-pressure-report-${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (error) {
      console.error('Error generating PDF:', error);
    }
  };

  const exportToMarkdown = () => {
    if (!stats) return;

    let markdown = `# Blood Pressure Report\n\n`;
    markdown += `**Generated:** ${new Date().toLocaleDateString()}\n`;
    markdown += `**Period:** ${stats.dateRange.start} - ${stats.dateRange.end}\n`;
    markdown += `**Patient:** Clint Crocker (Jun 8, 1978, Male)\n\n`;

    markdown += `## Summary\n\n`;
    markdown += `- **Total Readings:** ${stats.totalReadings}\n`;
    Object.entries(stats.categoryCounts).forEach(([category, count]) => {
      markdown += `- **${category}:** ${count} days\n`;
    });
    markdown += `\n`;

    markdown += `## Blood Pressure Readings\n\n`;
    markdown += `| Week | Systolic Range | Diastolic Range | Readings | Category |\n`;
    markdown += `|------|----------------|-----------------|----------|----------|\n`;

    stats.weeklyData.forEach(week => {
      const weekRange = formatWeekRange(week.weekStart, week.weekEnd);
      markdown += `| ${weekRange} | ${week.systolicRange.min}-${week.systolicRange.max} | ${week.diastolicRange.min}-${week.diastolicRange.max} | ${week.count} | ${week.category.stage} |\n`;
    });

    markdown += `\n## Blood Pressure Categories\n\n`;
    markdown += `- **Normal:** < 120/80 mmHg\n`;
    markdown += `- **Elevated:** 120-129/< 80 mmHg\n`;
    markdown += `- **Stage 1:** 130-139/80-89 mmHg\n`;
    markdown += `- **Stage 2:** ≥ 140/≥ 90 mmHg\n\n`;

    markdown += `*Data provided by FitnessGeek*\n`;

    // Create and download file
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `blood-pressure-report-${new Date().toISOString().split('T')[0]}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const exportToCSV = () => {
    if (!stats) return;

    let csv = 'Week,Systolic Range,Diastolic Range,Readings,Category\n';

    stats.weeklyData.forEach(week => {
      const weekRange = formatWeekRange(week.weekStart, week.weekEnd);
      const systolicRange = `${week.systolicRange.min}-${week.systolicRange.max}`;
      const diastolicRange = `${week.diastolicRange.min}-${week.diastolicRange.max}`;
      csv += `"${weekRange}","${systolicRange}","${diastolicRange}",${week.count},"${week.category.stage}"\n`;
    });

    // Create and download file
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `blood-pressure-readings-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (!stats) {
    return (
      <Dialog open={true} onClose={onClose} maxWidth="md" fullWidth>
        <DialogTitle>Blood Pressure Report</DialogTitle>
        <DialogContent>
          <Typography>No blood pressure data available for the selected time range.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Close</Button>
        </DialogActions>
      </Dialog>
    );
  }

  return (
    <Dialog open={true} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle sx={{ pb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant="h6">Blood Pressure Report</Typography>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              onClick={exportToCSV}
              variant="outlined"
              size="small"
              startIcon={<CsvIcon />}
              sx={{
                borderColor: theme.palette.primary.main,
                color: theme.palette.primary.main,
                '&:hover': {
                  borderColor: theme.palette.primary.dark,
                  backgroundColor: theme.palette.primary.light + '20'
                }
              }}
            >
              CSV
            </Button>
            <Button
              onClick={exportToMarkdown}
              variant="outlined"
              size="small"
              startIcon={<MarkdownIcon />}
              sx={{
                borderColor: theme.palette.primary.main,
                color: theme.palette.primary.main,
                '&:hover': {
                  borderColor: theme.palette.primary.dark,
                  backgroundColor: theme.palette.primary.light + '20'
                }
              }}
            >
              MD
            </Button>
            <Button
              onClick={exportToPDF}
              variant="contained"
              size="small"
              startIcon={<PdfIcon />}
              sx={{
                backgroundColor: theme.palette.primary.main,
                '&:hover': {
                  backgroundColor: theme.palette.primary.dark
                }
              }}
            >
              PDF
            </Button>
          </Box>
        </Box>
      </DialogTitle>
      <DialogContent sx={{ p: 0 }}>
        <Box ref={reportRef} sx={{
          p: 3,
          backgroundColor: '#ffffff',
          minHeight: 'auto',
          height: 'auto',
          overflow: 'visible'
        }}>
          {/* Header */}
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
            <Box sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 50,
              height: 50,
              borderRadius: '50%',
              bgcolor: '#1976d2',
              mr: 2
            }}>
              <HeartIcon sx={{ color: 'white', fontSize: 24 }} />
            </Box>
            <Box sx={{ flex: 1 }}>
              <Typography variant="h4" sx={{ fontWeight: 700, color: '#1976d2' }}>
                Blood Pressure Report
              </Typography>
              <Typography variant="body1" color="text.secondary">
                {stats.dateRange.start} - {stats.dateRange.end}
              </Typography>
            </Box>
            <Box sx={{ textAlign: 'right' }}>
              <Typography variant="body1" sx={{ fontWeight: 600 }}>
                Clint Crocker
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Jun 8, 1978 (47 yr) • Male
              </Typography>
            </Box>
          </Box>

          {/* Disclaimer */}
          <Box sx={{ mb: 2, p: 2, bgcolor: '#f5f5f5', borderRadius: 1 }}>
            <Typography variant="body2" color="text.secondary">
              Based on data from the American Heart Association. This report is not intended to be used for medical purposes.
            </Typography>
          </Box>

          {/* Summary */}
          <Box sx={{ mb: 2 }}>
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>
              Summary
            </Typography>
            <Grid container spacing={2}>
              {Object.entries(stats.categoryCounts).map(([category, count]) => (
                <Grid item xs={6} sm={3} key={category}>
                  <Box sx={{ textAlign: 'center', p: 1 }}>
                    <Typography variant="h4" sx={{
                      fontWeight: 700,
                      color: categorizeBP(120, 80).color
                    }}>
                      {count}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Days {category}
                    </Typography>
                  </Box>
                </Grid>
              ))}
            </Grid>
          </Box>

          {/* Blood Pressure Chart */}
          <Box sx={{ mb: 2 }}>
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>
              Blood Pressure Trend
            </Typography>
            <Box sx={{
              height: 200,
              width: '100%',
              border: '1px solid #e0e0e0',
              borderRadius: 1,
              overflow: 'hidden'
            }}>
              <BPChartNivo
                data={bpLogs}
                title=""
              />
            </Box>
          </Box>

          {/* Weekly Data Table */}
          <Box sx={{ mb: 2 }}>
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>
              Blood Pressure Readings ({stats.totalReadings})
            </Typography>
            <TableContainer component={Paper}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600 }}>Week</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Systolic Range</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Diastolic Range</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Readings</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Category</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {stats.weeklyData.map((week, index) => (
                    <TableRow key={index}>
                      <TableCell>
                        {formatWeekRange(week.weekStart, week.weekEnd)}
                      </TableCell>
                      <TableCell>
                        {week.systolicRange.min} - {week.systolicRange.max}
                      </TableCell>
                      <TableCell>
                        {week.diastolicRange.min} - {week.diastolicRange.max}
                      </TableCell>
                      <TableCell>
                        {week.count}
                      </TableCell>
                      <TableCell>
                        <Box sx={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          px: 1.5,
                          py: 0.5,
                          borderRadius: 1,
                          backgroundColor: week.category.color,
                          color: 'white',
                          fontWeight: 600,
                          fontSize: '0.7rem',
                          minWidth: 60,
                          textAlign: 'center'
                        }}>
                          {week.category.stage}
                        </Box>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>

          {/* Legend */}
          <Box sx={{ mb: 2 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
              Blood Pressure Categories
            </Typography>
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              {[
                { stage: 'Normal', color: '#4caf50', range: '< 120/80' },
                { stage: 'Elevated', color: '#ff9800', range: '120-129/< 80' },
                { stage: 'Stage 1', color: '#f44336', range: '130-139/80-89' },
                { stage: 'Stage 2', color: '#d32f2f', range: '≥ 140/≥ 90' }
              ].map((cat) => (
                <Box key={cat.stage} sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  border: `2px solid ${cat.color}`,
                  borderRadius: 1,
                  px: 1,
                  py: 0.5,
                  bgcolor: cat.color + '20'
                }}>
                  <Box sx={{
                    width: 12,
                    height: 12,
                    borderRadius: '50%',
                    bgcolor: cat.color,
                    display: 'inline-block'
                  }} />
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {cat.stage}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    ({cat.range})
                  </Typography>
                </Box>
              ))}
            </Box>
          </Box>

          {/* Footer */}
          <Box sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            pt: 2,
            borderTop: '1px solid #e0e0e0'
          }}>
            <Typography variant="body2" color="text.secondary">
              Data provided by FitnessGeek on {new Date().toLocaleDateString()}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              1 of 1
            </Typography>
          </Box>
        </Box>
      </DialogContent>
      <DialogActions sx={{ p: 3 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          onClick={exportToPDF}
          variant="contained"
          startIcon={<PdfIcon />}
          disabled={false}
        >
          Generate PDF
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default BPReport;