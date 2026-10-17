import React, { useEffect, useState, useMemo, useRef } from 'react';
import {
  Container,
  Box,
  Typography,
  Grid,
  ToggleButtonGroup,
  ToggleButton,
  Button,
  CircularProgress,
  LinearProgress,
  useTheme
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import { GeekErrorState, useToast } from '@geeksuite/ui';
import DayRibbon from '../components/Reports/DayRibbon.jsx';
import BodyRecoverySection from '../components/Reports/BodyRecoverySection.jsx';
import { AINoteFooter, AI_NOTES_NAME, aiNotesTitle, lastDaysSource } from '../components/Reports/aiNotes.jsx';
import { formatSpan } from '../components/BodyComposition/bodyCompFormat.js';
import { Surface, SectionLabel, DisplayHeading } from '../components/primitives';
import {
  Download as DownloadIcon,
  Insights as InsightsIcon,
  TrendingUp as TrendingUpIcon,
} from '@mui/icons-material';
import { reportsService } from '../services/reportsService.js';
import { localDateString, localDateStringDaysAgo } from '@geeksuite/utils';
import { insightsService } from '../services/insightsService.js';
import { errorMessage } from '../utils/errorMessage.js';
import { MEAL_ORDER } from '../theme/theme.jsx';
import { mealLabel } from '../utils/plainWords.js';

const RANGE_OPTIONS = ['7', '14', '30'];

// The tile labels carry no unit: the unit rides on the number ("162g"),
// and the caption says it's per day (D-10).
const metricLabels = {
  calories: 'Calories',
  protein: 'Protein',
  carbs: 'Carbs',
  fat: 'Fat',
  fiber: 'Fiber',
  sugar: 'Sugar',
  // Joined 2026-09-23 (TRENDS_PLAN D6). Net carbs = carbs less fiber, per log.
  net_carbs: 'Net carbs',
  sodium: 'Sodium'
};
const metricUnits = { protein: 'g', carbs: 'g', fat: 'g', fiber: 'g', sugar: 'g', net_carbs: 'g', sodium: 'mg' };

const commas = (n) => Math.round(Number(n) || 0).toLocaleString('en-US');

/** The sentence the backend sends with `ok: false`; local default only. */
const UNAVAILABLE_TEXT = "The assistant isn't available right now.";

// What the server writes in place of a summary when there was nothing to
// summarise (backend and gateway each have their own wording). Shown as the
// panel's empty state instead, so the AI never seems to be talking about
// nothing.
const EMPTY_SUMMARY = /^(No data found\.|No nutrition logs were found)/;
const EMPTY_TRENDS = /^(No data found\.|Trend analysis needs)/;

const renderInsightContent = (text = '', theme) => {
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

/**
 * One AI panel: loads, fails and empties on its own, and ends with the
 * footer that says what it was written from, when, and that it can be wrong.
 */
const AIPanel = ({ title, icon: Icon, testId, loading, loadingLabel, error, data, empty, emptyText, emptyPattern, source }) => {
  const theme = useTheme();
  const text = data?.content || '';
  let body;
  if (loading) {
    body = (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
        <CircularProgress size={24} aria-label={loadingLabel} />
      </Box>
    );
  } else if (error) {
    body = (
      <Typography data-testid={`${testId}-error`} variant="body2" color="text.secondary">
        {error}
      </Typography>
    );
  } else if (empty || (text && emptyPattern.test(text.trim()))) {
    body = (
      <Typography data-testid={`${testId}-empty`} variant="body2" color="text.secondary">
        {emptyText}
      </Typography>
    );
  } else if (text) {
    body = (
      <>
        <Box sx={{ color: theme.palette.text.primary, '& ul': { pl: 3 } }}>
          {renderInsightContent(text, theme)}
        </Box>
        <AINoteFooter source={source} generatedAt={data.generatedAt} />
      </>
    );
  } else if (data?.ok === false) {
    /* The model declined (cap, free tier having a day). A 200 with a
       sentence, so it renders in place — no error tone for something that
       is simply not available this minute. */
    body = (
      <Typography variant="body2" color="text.secondary">
        {data.message || UNAVAILABLE_TEXT}
      </Typography>
    );
  } else {
    body = (
      <Typography data-testid={`${testId}-empty`} variant="body2" color="text.secondary">
        {emptyText}
      </Typography>
    );
  }
  return (
    <Surface data-testid={testId} sx={{ height: '100%' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
        <Icon sx={{ color: 'primary.main', fontSize: 20 }} />
        <SectionLabel variant="emphasis">{title}</SectionLabel>
      </Box>
      {body}
    </Surface>
  );
};

const Reports = () => {
  const theme = useTheme();
  const { notify } = useToast();
  const [range, setRange] = useState('7');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [overview, setOverview] = useState(null);
  const [trends, setTrends] = useState(null);
  const [weeklyCoach, setWeeklyCoach] = useState(null);
  const [trendWatch, setTrendWatch] = useState(null);
  // Each AI panel loads, and fails, on its own: they go out to a model
  // provider and can take many seconds, and the food report never waits for
  // them (review P2 — the page used to show one spinner until both answered).
  const [weeklyLoading, setWeeklyLoading] = useState(true);
  const [trendLoading, setTrendLoading] = useState(true);
  const [weeklyError, setWeeklyError] = useState(null);
  const [trendError, setTrendError] = useState(null);
  const [exporting, setExporting] = useState(false);
  // A range tap mid-load: only the newest request may write to the page.
  const requestRef = useRef(0);

  const days = parseInt(range, 10);
  // Trend watch reads at least three weeks, whatever the range.
  const trendDays = Math.max(days, 21);

  useEffect(() => {
    fetchReports();
  }, [range]);

  const fetchReports = () => {
    const ticket = ++requestRef.current;
    const current = () => ticket === requestRef.current;
    // Every window is anchored on the LOCAL calendar day, sent as `start`.
    // Without it the server falls back to `subDays(new Date(), days - 1)` on
    // a UTC container, so a report opened at 20:00 Central anchored on
    // tomorrow: "the last 7 days" came out as 09-15 -> 09-21, dropping the
    // user's own 09-14 from every total, average, ribbon and compliance
    // percentage, and printing a range that ended tomorrow. The two AI
    // panels and the CSV now send it too.
    const start = localDateStringDaysAgo(days - 1);
    const trendStart = localDateStringDaysAgo(trendDays - 1);
    const value = (result) => (result.status === 'fulfilled' ? (result.value?.data ?? result.value) : null);

    setLoading(true);
    setError(null);
    setWeeklyLoading(true);
    setTrendLoading(true);
    setWeeklyError(null);
    setTrendError(null);

    // The food report: shown the moment both halves answer.
    Promise.allSettled([
      reportsService.getOverview({ days, start }),
      reportsService.getTrends({ days, start }),
    ]).then(([overviewData, trendsData]) => {
      if (!current()) return;
      setOverview(value(overviewData));
      setTrends(value(trendsData));
      // Only both halves failing is a page error; one half renders alone.
      if (overviewData.status === 'rejected' && trendsData.status === 'rejected') {
        setError(errorMessage(overviewData.reason, "Your reports didn't load. Try again."));
      }
      setLoading(false);
    });

    insightsService.getWeeklyReport({ days, start })
      .then((r) => { if (current()) setWeeklyCoach(r?.data ?? r ?? null); })
      .catch((err) => {
        if (!current()) return;
        setWeeklyCoach(null);
        setWeeklyError(errorMessage(err, UNAVAILABLE_TEXT));
      })
      .finally(() => { if (current()) setWeeklyLoading(false); });

    insightsService.getTrendWatch({ days: trendDays, start: trendStart })
      .then((r) => { if (current()) setTrendWatch(r?.data ?? r ?? null); })
      .catch((err) => {
        if (!current()) return;
        setTrendWatch(null);
        setTrendError(errorMessage(err, UNAVAILABLE_TEXT));
      })
      .finally(() => { if (current()) setTrendLoading(false); });
  };

  const handleRangeChange = (_event, value) => {
    if (value) setRange(value);
  };

  const handleExport = async () => {
    try {
      setExporting(true);
      const blob = await reportsService.export({ days, start: localDateStringDaysAgo(days - 1) });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `fitnessgeek-food-report-${localDateString()}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      notify(errorMessage(err, "The report didn't download. Try again."), { tone: 'error' });
    } finally {
      setExporting(false);
    }
  };

  const goalComplianceEntries = useMemo(() => {
    if (!overview?.goalCompliance) return [];
    return Object.entries(overview.goalCompliance);
  }, [overview]);

  // Meal totals arrive summed over the range; a row says the average per
  // logged day, the same divisor the tiles use.
  const loggedDays = Number.isFinite(overview?.days_logged) && overview.days_logged > 0
    ? overview.days_logged
    : (overview?.daily?.length || 0);
  const rangeDays = overview?.range?.days ?? days;

  const mealRows = useMemo(() => {
    if (!overview?.meals || !loggedDays) return [];
    const known = MEAL_ORDER.filter((m) => overview.meals[m]);
    const others = Object.keys(overview.meals).filter((m) => !MEAL_ORDER.includes(m));
    return [...known, ...others].map((meal) => {
      const stats = overview.meals[meal] || {};
      const protein = Number(stats.protein);
      return {
        meal,
        label: mealLabel(meal),
        calories: commas((stats.calories || 0) / loggedDays),
        // Only said when the report carries it — "protein 0g" for a missing
        // field would be a made-up number.
        protein: Number.isFinite(protein) ? Math.round(protein / loggedDays) : null,
      };
    });
  }, [overview, loggedDays]);

  // Nothing logged in the range: the summary panel says so in its own words
  // rather than showing what the server wrote about an empty week.
  const nothingLogged = !loading && !!overview && loggedDays === 0;

  const rangeTitle = aiNotesTitle(days);

  return (
    <Container maxWidth="xl" sx={{ py: 4, px: { xs: 2, md: 4 } }}>
      <Typography sx={{ color: 'text.secondary', fontSize: '1.0625rem', mb: 4 }}>
        How your eating went, and how your body is trending.
      </Typography>

      {/* Food — the range toggle lives in this section's own header, because
          it governs this section and the AI notes under it, and nothing
          else (D-5). */}
      <Box component="section" aria-labelledby="food-heading" data-testid="reports-food" sx={{ mb: 5 }}>
        <Box sx={{ mb: 2.5, display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <Box>
            <SectionLabel sx={{ mb: 0.75 }}>Food</SectionLabel>
            <DisplayHeading size="card" id="food-heading">{rangeTitle}</DisplayHeading>
          </Box>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'center' }}>
            {/* `size="small"` renders under the 44px tap floor the mobile
                harness enforces (MOBILE_UI_PLAN 6). The compact look is kept;
                only the hit area grows. */}
            <ToggleButtonGroup
              size="small"
              value={range}
              exclusive
              onChange={handleRangeChange}
              aria-label="How many days"
              sx={{ '& .MuiToggleButtonGroup-grouped': { minHeight: 44, minWidth: 44 } }}
            >
              {RANGE_OPTIONS.map((option) => (
                <ToggleButton key={option} value={option} aria-label={`${option} days`}>
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

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
            <CircularProgress />
          </Box>
        ) : error ? (
          <GeekErrorState
            title="Couldn't load reports"
            error={error}
            onRetry={fetchReports}
          />
        ) : (
          <Box>
            {/* Averages divide by the days that have logs (an unlogged day is
                unknown, not zero) — so when that isn't every day, say so. */}
            {overview && Number.isFinite(overview.days_logged) && overview.days_logged < rangeDays && (
              <Typography data-testid="report-days-logged" variant="body2" sx={{ color: 'text.secondary', mb: 1.5 }}>
                {`Averages cover the ${overview.days_logged} of ${rangeDays} days you logged.`}
              </Typography>
            )}
            {/* Daily averages — "Calories 1,760 a day", "Protein 162g a day". */}
            <Grid container spacing={2} sx={{ mb: 4 }}>
              {overview && Object.entries(overview.averages || {}).map(([key, value]) => (
                <Grid item xs={6} sm={4} md={2} key={key}>
                  <Surface data-testid={`average-${key}`} sx={{ height: '100%' }}>
                    <SectionLabel sx={{ mb: 1 }}>{metricLabels[key] || key}</SectionLabel>
                    <Typography
                      sx={{
                        fontVariantNumeric: 'tabular-nums',
                        fontSize: { xs: '1.75rem', sm: '2rem' },
                        lineHeight: 1,
                        letterSpacing: '-0.02em',
                        fontWeight: 600,
                        color: 'text.primary',
                      }}
                    >
                      {`${commas(value)}${metricUnits[key] || ''}`}
                    </Typography>
                    <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary', mt: 0.75 }}>
                      a day
                    </Typography>
                  </Surface>
                </Grid>
              ))}
            </Grid>

            <Box sx={{ mb: 3 }}>
              <DayRibbon
                daily={overview?.daily || []}
                calorieTarget={overview?.targets?.calories || overview?.calorieGoal}
                rangeLabel={overview?.range ? formatSpan(overview.range.start, overview.range.end) : null}
              />
            </Box>

            <Grid container spacing={3}>
              <Grid item xs={12} md={8}>

                {/* Calories by meal */}
                <Surface sx={{ mb: 3 }} data-testid="meal-breakdown">
                  <SectionLabel sx={{ mb: 1.5 }}>Calories by meal, average per day</SectionLabel>
                  {mealRows.length ? mealRows.map((row) => (
                    <Typography
                      key={row.meal}
                      data-testid="meal-row"
                      sx={{
                        fontVariantNumeric: 'tabular-nums',
                        fontSize: '0.9375rem',
                        py: 1,
                        '&:not(:last-of-type)': {
                          borderBottom: `1px dotted ${alpha(theme.palette.text.primary, 0.1)}`,
                        },
                      }}
                    >
                      <Box component="span" sx={{ fontWeight: 700 }}>{row.label}</Box>
                      {` · ${row.calories} cal a day`}
                      {row.protein !== null && (
                        <Box component="span" sx={{ color: 'text.secondary' }}>{` · protein ${row.protein}g`}</Box>
                      )}
                    </Typography>
                  )) : (
                    <Typography variant="body2" color="text.secondary">
                      No meals logged in this range.
                    </Typography>
                  )}
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
                            fontFamily: "inherit",
                            fontVariantNumeric: 'tabular-nums',
                            fontSize: '0.75rem',
                            color: 'text.secondary',
                          }}
                        >
                          {detail.daysWithin} days on target
                        </Typography>
                      </Box>
                      <LinearProgress
                        variant="determinate"
                        value={detail.percentage}
                        aria-label={`${metricLabels[metric] || metric} compliance: ${Math.round(detail.percentage)}%`}
                        sx={{ borderRadius: 999 }}
                      />
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
                        data-testid="top-food"
                        sx={{
                          py: 1,
                          minWidth: 0,
                          '&:not(:last-of-type)': {
                            borderBottom: `1px dotted ${alpha(theme.palette.text.primary, 0.1)}`,
                          },
                        }}
                      >
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
                            fontVariantNumeric: 'tabular-nums',
                            fontSize: '0.8125rem',
                            color: 'text.secondary',
                          }}
                        >
                          {`${commas(food.calories)} cal over ${rangeDays} days · ${food.count} ${food.count === 1 ? 'time' : 'times'}`}
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
                        Nothing stands out yet.
                      </Typography>
                    )}
                  </Box>
                </Surface>
              </Grid>
            </Grid>
          </Box>
        )}
      </Box>

      {/* Notes from the AI, for the same range — outside the food report's
          loading and error states, so each panel shows up, loads and fails
          on its own. */}
      <Box component="section" aria-labelledby="ai-notes-heading" data-testid="reports-ai-notes" sx={{ mb: 5 }}>
        <Box sx={{ mb: 2.5 }}>
          <SectionLabel sx={{ mb: 0.75 }}>{AI_NOTES_NAME}</SectionLabel>
          <DisplayHeading size="card" id="ai-notes-heading">{rangeTitle}</DisplayHeading>
        </Box>
        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <AIPanel
              title="Summary"
              icon={InsightsIcon}
              testId="weekly-ai"
              loading={weeklyLoading}
              loadingLabel="Loading the summary"
              error={weeklyError}
              data={weeklyCoach}
              empty={nothingLogged}
              emptyText="Log a few days and I'll write a summary here."
              emptyPattern={EMPTY_SUMMARY}
              source={lastDaysSource(days)}
            />
          </Grid>
          <Grid item xs={12} md={6}>
            <AIPanel
              title="Trends"
              icon={TrendingUpIcon}
              testId="trend-ai"
              loading={trendLoading}
              loadingLabel="Loading the trends"
              error={trendError}
              data={trendWatch}
              empty={false}
              emptyText="Nothing stands out yet."
              emptyPattern={EMPTY_TRENDS}
              source={lastDaysSource(trendDays)}
            />
          </Grid>
        </Grid>
      </Box>

      {/* Body and recovery: its own 90-day window and its own loading, so the
          range toggle and the food report's states never reach it. */}
      <BodyRecoverySection />
    </Container>
  );
};

export default Reports;
