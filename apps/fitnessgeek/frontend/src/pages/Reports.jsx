import React, { useEffect, useState, useMemo } from 'react';
import {
  Container,
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
  ToggleButtonGroup,
  ToggleButton,
  Button,
  CircularProgress,
  Alert,
  Chip,
  Divider,
  LinearProgress,
  Table,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
  useTheme
} from '@mui/material';
import {
  Download as DownloadIcon,
  Insights as InsightsIcon,
  TrendingUp as TrendingUpIcon,
  Restaurant as MealIcon,
  Star as StarIcon
} from '@mui/icons-material';
import { reportsService } from '../services/reportsService.js';
import { insightsService } from '../services/insightsService.js';

const RANGE_OPTIONS = ['7', '14', '30'];

const metricLabels = {
  calories: 'Calories',
  protein: 'Protein (g)',
  carbs: 'Carbs (g)',
  fat: 'Fat (g)',
  fiber: 'Fiber (g)',
  sugar: 'Sugar (g)'
};

const SECTION_PADDING = 3;
const Reports = () => {
  const theme = useTheme();
  const [range, setRange] = useState('7');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [overview, setOverview] = useState(null);
  const [trends, setTrends] = useState(null);
  const [weeklyCoach, setWeeklyCoach] = useState(null);
  const [trendWatch, setTrendWatch] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    fetchReports();
  }, [range]);

  const fetchReports = async () => {
    setLoading(true);
    setAiLoading(true);
    setError(null);
    try {
      const days = parseInt(range, 10);
      const [overviewData, trendsData, weeklyReport, trendSummary] = await Promise.all([
        reportsService.getOverview({ days }),
        reportsService.getTrends({ days }),
        insightsService.getWeeklyReport({ days }),
        insightsService.getTrendWatch({ days: Math.max(days, 21) })
      ]);
      setOverview(overviewData?.data || overviewData);
      setTrends(trendsData?.data || trendsData);
      setWeeklyCoach(weeklyReport?.data || weeklyReport);
      setTrendWatch(trendSummary?.data || trendSummary);
    } catch (err) {
      console.error(err);
      setError(err.message || 'Unable to load reports');
    } finally {
      setLoading(false);
      setAiLoading(false);
    }
  };

  const handleRangeChange = (_event, value) => {
    if (value) setRange(value);
  };

  const handleExport = async () => {
    try {
      setExporting(true);
      const blob = await reportsService.export({ days: parseInt(range, 10) });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `fitnessgeek-food-report-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      setError('Failed to export report');
    } finally {
      setExporting(false);
    }
  };

  const goalComplianceEntries = useMemo(() => {
    if (!overview?.goalCompliance) return [];
    return Object.entries(overview.goalCompliance);
  }, [overview]);

  const renderInsightContent = (text = '') => {
    const lines = text.split('\n');
    const blocks = [];
    let currentList = null;

    const pushList = () => {
      if (currentList && currentList.length) {
        blocks.push({ type: 'list', items: currentList });
        currentList = null;
      }
    };

    lines.forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed) {
        pushList();
        blocks.push({ type: 'spacer' });
        return;
      }

      const bulletMatch = trimmed.match(/^[-*]\s+(.*)/);
      const numberedMatch = trimmed.match(/^\d+\.\s+(.*)/);

      if (bulletMatch || numberedMatch) {
        if (!currentList) currentList = [];
        currentList.push(bulletMatch ? bulletMatch[1] : numberedMatch[0]);
      } else {
        pushList();
        blocks.push({ type: 'paragraph', text: trimmed.replace(/\*\*(.*?)\*\*/g, '$1') });
      }
    });

    pushList();

    return blocks.map((block, idx) => {
      if (block.type === 'paragraph') {
        return (
          <Typography key={`p-${idx}`} variant="body2" sx={{ color: theme.palette.text.primary, mb: 0.75 }}>
            {block.text}
          </Typography>
        );
      }
      if (block.type === 'list') {
          return (
            <Box
              key={`list-${idx}`}
              component="ul"
              sx={{
                pl: 3,
                mb: 1.5,
                color: theme.palette.text.primary,
                '& li': {
                  lineHeight: 1.6,
                  mb: 0.5,
                  fontSize: '0.9rem'
                }
              }}
            >
              {block.items.map((item, itemIdx) => (
                <li key={itemIdx}>{item.replace(/\*\*(.*?)\*\*/g, '$1')}</li>
              ))}
            </Box>
          );
      }
      return <Box key={`sp-${idx}`} sx={{ height: 8 }} />;
    });
  };

  return (
    <Container maxWidth="xl" sx={{ py: 4, px: { xs: 2, md: 4 } }}>
      <Box sx={{ mb: 4, display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 2, alignItems: { md: 'center' } }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700 }}>
            Reports & Trends
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Deep dive into your food logs, macro patterns, and AI insights for the past {range} days.
          </Typography>
        </Box>
        <Box sx={{ ml: { md: 'auto' }, display: 'flex', gap: 2, alignItems: 'center' }}>
          <ToggleButtonGroup size="small" value={range} exclusive onChange={handleRangeChange}>
            {RANGE_OPTIONS.map((option) => (
              <ToggleButton key={option} value={option}>
                {option}d
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
          <Button
            variant="contained"
            startIcon={<DownloadIcon />}
            onClick={handleExport}
            disabled={exporting || loading}
          >
            Export CSV
          </Button>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      ) : (
        <Box>
          {/* Overview Metrics */}
          <Grid container spacing={3} sx={{ mb: 4 }}>
            {overview && (
              <>
                {Object.entries(overview.averages || {}).map(([key, value]) => (
                  <Grid item xs={12} sm={6} md={2} key={key}>
                    <Card sx={{ borderRadius: 3, height: '100%' }}>
                      <CardContent sx={{ p: 2.5 }}>
                        <Typography variant="subtitle2" color="text.secondary">
                          {metricLabels[key] || key}
                        </Typography>
                        <Typography variant="h5" sx={{ fontWeight: 700 }}>
                          {Math.round(value)}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          avg / day
                        </Typography>
                      </CardContent>
                    </Card>
                  </Grid>
                ))}
              </>
            )}
          </Grid>

          <Grid container spacing={3}>
            <Grid item xs={12} md={8}>
              <Card sx={{ borderRadius: 3, mb: 3 }}>
                <CardContent sx={{ p: SECTION_PADDING }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                    <Typography variant="h6" sx={{ fontWeight: 600 }}>
                      Daily Totals
                    </Typography>
                    {overview?.range && (
                      <Typography variant="caption" color="text.secondary">
                        {overview.range.start} – {overview.range.end}
                      </Typography>
                    )}
                  </Box>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Date</TableCell>
                        <TableCell align="right">Calories</TableCell>
                        <TableCell align="right">Protein</TableCell>
                        <TableCell align="right">Carbs</TableCell>
                        <TableCell align="right">Fat</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {overview?.daily?.length ? overview.daily.map((day) => (
                        <TableRow key={day.date}>
                          <TableCell>{day.date}</TableCell>
                          <TableCell align="right">{Math.round(day.calories)}</TableCell>
                          <TableCell align="right">{Math.round(day.protein)}</TableCell>
                          <TableCell align="right">{Math.round(day.carbs)}</TableCell>
                          <TableCell align="right">{Math.round(day.fat)}</TableCell>
                        </TableRow>
                      )) : (
                        <TableRow>
                          <TableCell colSpan={5} align="center" sx={{ py: 3 }}>
                            No food logs in this range.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              <Card sx={{ borderRadius: 3, mb: 3 }}>
                <CardContent sx={{ p: SECTION_PADDING }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                    <Typography variant="h6" sx={{ fontWeight: 600 }}>
                      Meal Breakdown
                    </Typography>
                    <Chip icon={<MealIcon />} label="Meals logged" size="small" />
                  </Box>
                  <Grid container spacing={2}>
                    {overview?.meals && Object.entries(overview.meals).map(([meal, stats]) => (
                      <Grid item xs={12} sm={6} key={meal}>
                        <Card variant="outlined" sx={{ borderRadius: 2 }}>
                          <CardContent sx={{ p: 2.5 }}>
                            <Typography variant="subtitle2" color="text.secondary" sx={{ textTransform: 'capitalize' }}>
                              {meal}
                            </Typography>
                            <Typography variant="h6" sx={{ fontWeight: 700 }}>
                              {Math.round(stats.calories || 0)} cal
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {stats.count || 0} entries • {Math.round(stats.protein || 0)}g protein
                            </Typography>
                          </CardContent>
                        </Card>
                      </Grid>
                    ))}
                  </Grid>
                </CardContent>
              </Card>

              <Card sx={{ borderRadius: 3 }}>
                <CardContent sx={{ p: SECTION_PADDING }}>
                  <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>
                    Goal Compliance
                  </Typography>
                  {goalComplianceEntries.length ? goalComplianceEntries.map(([metric, detail]) => (
                    <Box key={metric} sx={{ mb: 2 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                        <Typography variant="body2" sx={{ textTransform: 'capitalize' }}>
                          {metricLabels[metric] || metric}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {detail.daysWithin} days on target
                        </Typography>
                      </Box>
                      <LinearProgress variant="determinate" value={detail.percentage} sx={{ borderRadius: 999 }} />
                    </Box>
                  )) : (
                    <Typography variant="body2" color="text.secondary">
                      No active nutrition goals recorded.
                    </Typography>
                  )}
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} md={4}>
              <Card sx={{ borderRadius: 3, mb: 3 }}>
                <CardContent sx={{ p: SECTION_PADDING }}>
                  <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>
                    Top Foods
                  </Typography>
                  <Divider sx={{ mb: 2 }} />
                  {overview?.topFoods?.length ? overview.topFoods.map((food) => (
                    <Box key={food.name} sx={{ mb: 1.5 }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                        {food.name}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {food.count} entries • {Math.round(food.calories)} calories total
                      </Typography>
                    </Box>
                  )) : (
                    <Typography variant="body2" color="text.secondary">
                      No repeated foods logged in this range.
                    </Typography>
                  )}
                </CardContent>
              </Card>

              <Card sx={{ borderRadius: 3 }}>
                <CardContent sx={{ p: SECTION_PADDING }}>
                  <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>
                    Trend Highlights
                  </Typography>
                  <Divider sx={{ mb: 2 }} />
                  {trends?.highlights?.length ? trends.highlights.map((item, idx) => (
                    <Box key={idx} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mb: 1.5 }}>
                      <TrendingUpIcon fontSize="small" sx={{ color: theme.palette.primary.main, mt: 0.2 }} />
                      <Typography variant="body2">
                        {item}
                      </Typography>
                    </Box>
                  )) : (
                    <Typography variant="body2" color="text.secondary">
                      No significant trends detected yet.
                    </Typography>
                  )}
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          {/* AI Summaries */}
          <Grid container spacing={3} sx={{ mt: 1 }}>
            <Grid item xs={12} md={6}>
              <Card sx={{ borderRadius: 3, height: '100%' }}>
                <CardContent sx={{ p: SECTION_PADDING }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    <InsightsIcon color="primary" />
                    <Typography variant="h6" sx={{ fontWeight: 600 }}>
                      Weekly Coach Summary
                    </Typography>
                  </Box>
                  {aiLoading ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
                      <CircularProgress size={24} />
                    </Box>
                  ) : weeklyCoach?.content ? (
                    <Box sx={{ color: theme.palette.text.primary, '& ul': { pl: 3 } }}>
                      {renderInsightContent(weeklyCoach.content)}
                    </Box>
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      No AI summary available for this range yet.
                    </Typography>
                  )}
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} md={6}>
              <Card sx={{ borderRadius: 3, height: '100%' }}>
                <CardContent sx={{ p: SECTION_PADDING }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    <TrendingUpIcon color="secondary" />
                    <Typography variant="h6" sx={{ fontWeight: 600 }}>
                      Trend Watch
                    </Typography>
                  </Box>
                  {aiLoading ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
                      <CircularProgress size={24} />
                    </Box>
                  ) : trendWatch?.content ? (
                    <Box sx={{ color: theme.palette.text.primary, '& ul': { pl: 3 } }}>
                      {renderInsightContent(trendWatch.content)}
                    </Box>
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      Trend summary will appear once enough data is logged.
                    </Typography>
                  )}
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </Box>
      )}
    </Container>
  );
};

export default Reports;
