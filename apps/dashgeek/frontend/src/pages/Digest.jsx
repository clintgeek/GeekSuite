import React, { useState } from 'react';
import { Box, Typography } from '@mui/material';
import { useQuery } from '@apollo/client';
import { useTheme } from '@mui/material/styles';
import useAuthStore from '../store/authStore';
import Brand from '../components/Brand';
import LedgerCard from '../components/LedgerCard';
import CountUp from '../components/CountUp';
import { DASH_WEEKLY_DIGEST } from '../graphql/queries';

function getMondayOf(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getSundayOf(monday) {
  const d = new Date(monday);
  d.setDate(d.getDate() + 6);
  return d;
}

function formatWeekLabel(monday, sunday) {
  const fmt = (d) =>
    d
      .toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
      .toUpperCase()
      .replace(',', ' ·')
      .replace(/\s+/g, ' ');
  return `WEEK OF ${fmt(monday)} – ${fmt(sunday)}`;
}

// Big mono stat block: large number + Geist caption label
function StatBlock({ label, value, unit = '', decimals }) {
  const theme = useTheme();
  const monoStack =
    theme.typography.fontFamilyMono ??
    '"JetBrains Mono", "Geist Mono", ui-monospace, monospace';

  const numVal = Number(value) || 0;
  const decimalPlaces =
    decimals !== undefined ? decimals : Number.isInteger(numVal) ? 0 : 1;

  return (
    <Box sx={{ mb: 2 }}>
      <Box
        sx={{
          fontFamily: monoStack,
          fontSize: { xs: '2rem', md: '2.25rem' },
          fontWeight: 600,
          letterSpacing: '-0.02em',
          lineHeight: 1.1,
          color: 'text.primary',
        }}
      >
        <CountUp value={numVal} decimals={decimalPlaces} />
        {unit && (
          <Box
            component="span"
            sx={{
              fontFamily: monoStack,
              fontSize: '0.875rem',
              fontWeight: 500,
              color: 'text.secondary',
              ml: '4px',
            }}
          >
            {unit}
          </Box>
        )}
      </Box>
      <Typography
        variant="caption"
        sx={{ display: 'block', color: 'text.secondary', mt: '4px' }}
      >
        {label}
      </Typography>
    </Box>
  );
}

export default function Digest() {
  const { logout } = useAuthStore();
  const theme = useTheme();

  const [monday] = useState(() => getMondayOf(new Date()));
  const sunday = getSundayOf(monday);
  const weekLabel = formatWeekLabel(monday, sunday);

  // weekStart as ISO date string for the query
  const weekStart = monday.toISOString().split('T')[0];

  const { data, loading, error } = useQuery(DASH_WEEKLY_DIGEST, {
    variables: { weekStart },
    fetchPolicy: 'cache-and-network',
  });

  const digest = data?.dashWeeklyDigest;

  return (
    <Box sx={{ minHeight: '100vh', backgroundColor: 'background.default' }}>
      <Brand onLogout={logout} />

      <Box
        sx={{
          px: { xs: 2, sm: 3, md: 4 },
          pt: { xs: 3, md: 4 },
          pb: { xs: 6, md: 8 },
          maxWidth: 1280,
          mx: 'auto',
        }}
      >
        {/* Compact week header */}
        <Box
          sx={{
            py: { xs: 1.5, md: 2 },
            mb: { xs: 2, md: 3 },
          }}
        >
          <Typography
            variant="h6"
            sx={{ color: 'text.primary', lineHeight: 1 }}
          >
            {weekLabel}
          </Typography>
          <Typography
            variant="caption"
            sx={{ display: 'block', mt: '4px', color: 'text.secondary', lineHeight: 1.3 }}
          >
            Weekly digest · compiled from gateway summaries
          </Typography>
        </Box>

        {/* Hairline rule */}
        <Box
          sx={{
            height: '1px',
            backgroundColor: 'divider',
            mb: { xs: 3, md: 4 },
          }}
        />

        {/* Loading */}
        {loading && !digest && (
          <Typography variant="body2" color="text.secondary">
            Loading…
          </Typography>
        )}

        {/* Error */}
        {error && !digest && (
          <Typography variant="body2" color="error.main">
            Unable to load digest. {error.message}
          </Typography>
        )}

        {/* AI summary — only rendered when present; never a stub */}
        {digest?.aiSummary && (
          <Box sx={{ mb: 4, maxWidth: 840 }}>
            <Typography
              variant="caption"
              sx={{
                display: 'block',
                color: 'text.disabled',
                letterSpacing: '0.10em',
                textTransform: 'uppercase',
                mb: 1,
              }}
            >
              weekly summary
            </Typography>
            <Typography variant="body1" color="text.primary">
              {digest.aiSummary}
            </Typography>
          </Box>
        )}

        {/* Five domain LedgerCards */}
        {digest && (
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: {
                xs: '1fr',
                sm: 'repeat(2, 1fr)',
                md: 'repeat(3, 1fr)',
                lg: 'repeat(5, 1fr)',
              },
              gap: 2,
            }}
          >
            {digest.bujo && (
              <Box className="rise">
                <LedgerCard domain="bujogeek" title="Bujo">
                  <StatBlock label="tasks completed" value={digest.bujo.tasksCompleted} />
                  <StatBlock label="tasks created" value={digest.bujo.tasksCreated} />
                  <StatBlock
                    label="completion rate"
                    value={Math.round((digest.bujo.completionRate || 0) * 100)}
                    unit="%"
                  />
                </LedgerCard>
              </Box>
            )}

            {digest.fitness && (
              <Box className="rise" sx={{ animationDelay: '60ms' }}>
                <LedgerCard domain="fitnessgeek" title="Fitness">
                  <StatBlock label="avg calories" value={digest.fitness.avgCalories} />
                  <StatBlock label="avg protein" value={digest.fitness.avgProtein} unit="g" decimals={1} />
                  <StatBlock label="weight change" value={digest.fitness.weightChange} unit="lb" decimals={1} />
                  <StatBlock label="days logged" value={digest.fitness.daysLogged} />
                </LedgerCard>
              </Box>
            )}

            {digest.flock && (
              <Box className="rise" sx={{ animationDelay: '120ms' }}>
                <LedgerCard domain="flockgeek" title="Flock">
                  <StatBlock label="total eggs" value={digest.flock.totalEggs} />
                  <StatBlock label="avg per day" value={digest.flock.avgEggsPerDay} decimals={1} />
                  <StatBlock label="hatch events" value={digest.flock.hatchEvents} />
                  <StatBlock label="chicks hatched" value={digest.flock.chicksHatched} />
                </LedgerCard>
              </Box>
            )}

            {digest.books && (
              <Box className="rise" sx={{ animationDelay: '180ms' }}>
                <LedgerCard domain="bookgeek" title="Books">
                  <StatBlock label="books finished" value={digest.books.booksFinished} />
                  <StatBlock label="pages read" value={digest.books.pagesRead} />
                  {digest.books.currentlyReading?.length > 0 && (
                    <Box
                      sx={{
                        mt: 1,
                        pt: 1.5,
                        borderTop: `1px solid ${theme.palette.divider}`,
                      }}
                    >
                      <Typography
                        variant="caption"
                        sx={{ display: 'block', color: 'text.disabled', mb: 0.5 }}
                      >
                        currently reading
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {digest.books.currentlyReading.join(', ')}
                      </Typography>
                    </Box>
                  )}
                </LedgerCard>
              </Box>
            )}

            {digest.notes && (
              <Box className="rise" sx={{ animationDelay: '240ms' }}>
                <LedgerCard domain="notegeek" title="Notes">
                  <StatBlock label="notes created" value={digest.notes.notesCreated} />
                  <StatBlock label="notes updated" value={digest.notes.notesUpdated} />
                  {digest.notes.topTags?.length > 0 && (
                    <Box
                      sx={{
                        mt: 1,
                        pt: 1.5,
                        borderTop: `1px solid ${theme.palette.divider}`,
                      }}
                    >
                      <Typography
                        variant="caption"
                        sx={{ display: 'block', color: 'text.disabled', mb: 0.75 }}
                      >
                        top tags
                      </Typography>
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                        {digest.notes.topTags.map((t) => (
                          <Box
                            key={t}
                            sx={{
                              fontFamily:
                                theme.typography.fontFamilyMono ??
                                '"JetBrains Mono", ui-monospace, monospace',
                              fontWeight: 500,
                              fontSize: '0.625rem',
                              letterSpacing: '0.08em',
                              textTransform: 'uppercase',
                              color: 'text.secondary',
                              border: `1px solid ${theme.palette.border ?? theme.palette.divider}`,
                              borderRadius: '4px',
                              px: '6px',
                              py: '2px',
                            }}
                          >
                            #{t}
                          </Box>
                        ))}
                      </Box>
                    </Box>
                  )}
                </LedgerCard>
              </Box>
            )}
          </Box>
        )}
      </Box>
    </Box>
  );
}
