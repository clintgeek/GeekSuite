import React, { useEffect, useState, useMemo } from 'react';
import {
  Container,
  Box,
  Typography,
  Grid,
  ToggleButtonGroup,
  ToggleButton,
  Button,
  CircularProgress,
  Alert,
  Chip,
  LinearProgress,
  useTheme
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import DayRibbon from '../components/Reports/DayRibbon.jsx';
import { Surface, SectionLabel, DisplayHeading, StatNumber } from '../components/primitives';
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
      <Box sx={{ mb: 4, display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 2, alignItems: { md: 'flex-end' } }}>
        <Box sx={{ flex: 1 }}>
          <SectionLabel sx={{ mb: 0.75 }}>Insight · Reports</SectionLabel>
          <DisplayHeading size="page">Reports & Trends</DisplayHeading>
          <Typography sx={{ color: 'text.secondary', mt: 0.5, fontSize: '0.9375rem' }}>
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
          {/* Average metrics — compact 6-up grid of Surfaces with StatNumber */}
          <Grid container spacing={2} sx={{ mb: 4 }}>
            {overview && Object.entries(overview.averages || {}).map(([key, value]) => (
              <Grid item xs={6} sm={4} md={2} key={key}>
                <Surface sx={{ height: '100%' }}>
                  <SectionLabel sx={{ mb: 1 }}>{metricLabels[key] || key}</SectionLabel>
                  <StatNumber value={Math.round(value)} size="display" />
                  <Typography
                    sx={{
                      fontSize: '0.625rem',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.12em',
                      color: 'text.secondary',
                      mt: 0.75,
                    }}
                  >
                    avg / day
                  </Typography>
                </Surface>
              </Grid>
            ))}
          </Grid>

          {/* Daily Totals — horizontal ribbon of day cards */}
          <Box sx={{ mb: 3 }}>
            <DayRibbon
              daily={overview?.daily || []}
              calorieTarget={overview?.targets?.calories || overview?.calorieGoal}
              macroTargets={{
                protein: overview?.targets?.protein || overview?.proteinGoal,
                carbs: overview?.targets?.carbs || overview?.carbsGoal,
                fat: overview?.targets?.fat || overview?.fatGoal,
                fiber: overview?.targets?.fiber || overview?.fiberGoal,
              }}
              rangeLabel={
                overview?.range
                  ? `${overview.range.start} → ${overview.range.end}`
                  : null
              }
            />
          </Box>

          <Grid container spacing={3}>
            <Grid item xs={12} md={8}>

              {/* Meal Breakdown */}
              <Surface sx={{ mb: 3 }}>
                <Box
                  sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-end',
                    mb: 2.5,
                    gap: 2,
                  }}
                >
                  <Box>
                    <SectionLabel sx={{ mb: 0.75 }}>Meal Breakdown</SectionLabel>
                    <DisplayHeading size="card">By Time of Day</DisplayHeading>
                  </Box>
                  <Chip
                    icon={<MealIcon />}
                    label="Meals logged"
                    size="small"
                    sx={{ flexShrink: 0 }}
                  />
                </Box>
                <Grid container spacing={1.5}>
                  {overview?.meals && Object.entries(overview.meals).map(([meal, stats]) => (
                    <Grid item xs={6} sm={3} key={meal}>
                      <Surface variant="inset" sx={{ py: 1.5, px: 1.5, height: '100%' }}>
                        <SectionLabel sx={{ mb: 0.75, textTransform: 'capitalize' }}>
                          {meal}
                        </SectionLabel>
                        <StatNumber
                          value={Math.round(stats.calories || 0)}
                          unit="kcal"
                          size="display"
                        />
                        <Typography
                          sx={{
                            fontFamily: "'JetBrains Mono', monospace",
                            fontVariantNumeric: 'tabular-nums',
                            fontSize: '0.6875rem',
                            color: 'text.secondary',
                            mt: 0.75,
                          }}
                        >
                          {stats.count || 0} entries · {Math.round(stats.protein || 0)}g P
                        </Typography>
                      </Surface>
                    </Grid>
                  ))}
                </Grid>
              </Surface>

              {/* Goal Compliance */}
              <Surface>
                <Box sx={{ mb: 2.5 }}>
                  <SectionLabel sx={{ mb: 0.75 }}>Goal Compliance</SectionLabel>
                  <DisplayHeading size="card">On-Target Days</DisplayHeading>
                </Box>
                {goalComplianceEntries.length ? goalComplianceEntries.map(([metric, detail]) => (
                  <Box key={metric} sx={{ mb: 2, '&:last-child': { mb: 0 } }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.75 }}>
                      <Typography sx={{ fontWeight: 600, fontSize: '0.875rem', textTransform: 'capitalize' }}>
                        {metricLabels[metric] || metric}
                      </Typography>
                      <Typography
                        sx={{
                          fontFamily: "'JetBrains Mono', monospace",
                          fontVariantNumeric: 'tabular-nums',
                          fontSize: '0.75rem',
                          color: 'text.secondary',
                        }}
                      >
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
              </Surface>
            </Grid>

            <Grid item xs={12} md={4}>
              {/* Top Foods */}
              <Surface padded={false} sx={{ mb: 3 }}>
                <Box
                  sx={{
                    px: 2.5,
                    pt: 2,
                    pb: 1.25,
                    borderBottom: `1px dashed ${theme.palette.divider}`,
                  }}
                >
                  <SectionLabel>Top Foods</SectionLabel>
                </Box>
                <Box sx={{ p: 2.5 }}>
                  {overview?.topFoods?.length ? overview.topFoods.map((food) => (
                    <Box
                      key={food.name}
                      sx={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'baseline',
                        py: 1,
                        '&:not(:last-of-type)': {
                          borderBottom: `1px dotted ${alpha(theme.palette.text.primary, 0.1)}`,
                        },
                      }}
                    >
                      <Box sx={{ minWidth: 0, pr: 1.5 }}>
                        <Typography
                          sx={{
                            fontWeight: 600,
                            fontSize: '0.875rem',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {food.name}
                        </Typography>
                        <Typography
                          sx={{
                            fontFamily: "'JetBrains Mono', monospace",
                            fontSize: '0.6875rem',
                            color: 'text.secondary',
                          }}
                        >
                          {food.count} entries
                        </Typography>
                      </Box>
                      <Typography
                        sx={{
                          fontFamily: "'JetBrains Mono', monospace",
                          fontVariantNumeric: 'tabular-nums',
                          fontSize: '0.8125rem',
                          fontWeight: 600,
                          flexShrink: 0,
                        }}
                      >
                        {Math.round(food.calories)} kcal
                      </Typography>
                    </Box>
                  )) : (
                    <Typography variant="body2" color="text.secondary">
                      No repeated foods logged in this range.
                    </Typography>
                  )}
                </Box>
              </Surface>

              {/* Trend Highlights */}
              <Surface padded={false}>
                <Box
                  sx={{
                    px: 2.5,
                    pt: 2,
                    pb: 1.25,
                    borderBottom: `1px dashed ${theme.palette.divider}`,
                  }}
                >
                  <SectionLabel>Trend Highlights</SectionLabel>
                </Box>
                <Box sx={{ p: 2.5 }}>
                  {trends?.highlights?.length ? trends.highlights.map((item, idx) => (
                    <Box key={idx} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mb: 1.5, '&:last-child': { mb: 0 } }}>
                      <TrendingUpIcon fontSize="small" sx={{ color: theme.palette.primary.main, mt: 0.25 }} />
                      <Typography sx={{ fontSize: '0.875rem', lineHeight: 1.5 }}>
                        {item}
                      </Typography>
                    </Box>
                  )) : (
                    <Typography variant="body2" color="text.secondary">
                      No significant trends detected yet.
                    </Typography>
                  )}
                </Box>
              </Surface>
            </Grid>
          </Grid>

          {/* AI Summaries */}
          <Grid container spacing={3} sx={{ mt: 1 }}>
            <Grid item xs={12} md={6}>
              <Surface sx={{ height: '100%' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mb: 2 }}>
                  <InsightsIcon sx={{ color: 'primary.main' }} />
                  <Box>
                    <SectionLabel>AI Coach</SectionLabel>
                    <DisplayHeading size="card" sx={{ mt: 0.25 }}>
                      Weekly Summary
                    </DisplayHeading>
                  </Box>
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
              </Surface>
            </Grid>
            <Grid item xs={12} md={6}>
              <Surface sx={{ height: '100%' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mb: 2 }}>
                  <TrendingUpIcon sx={{ color: 'primary.main' }} />
                  <Box>
                    <SectionLabel>AI Insight</SectionLabel>
                    <DisplayHeading size="card" sx={{ mt: 0.25 }}>
                      Trend Watch
                    </DisplayHeading>
                  </Box>
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
              </Surface>
            </Grid>
          </Grid>
        </Box>
      )}
    </Container>
  );
};

export default Reports;
