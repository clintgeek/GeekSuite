import React, { useState } from 'react';
import { Box } from '@mui/material';
import { useQuery } from '@apollo/client';
import useAuthStore from '../store/authStore';
import Brand from '../components/Brand';
import CountUp from '../components/CountUp';
import { DASH_WEEKLY_DIGEST } from '../graphql/queries';
import { tokens } from '../theme';

function getMondayOf(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().split('T')[0];
}

function StatRow({ label, value, unit = '' }) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        py: 1.25,
        borderBottom: `1px solid ${tokens.rule}`,
        '&:last-child': { borderBottom: 'none' },
      }}
    >
      <Box
        sx={{
          fontFamily: tokens.fontMono,
          fontSize: '0.55rem',
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: tokens.boneDim,
        }}
      >
        {label}
      </Box>
      <Box
        sx={{
          fontFamily: tokens.fontDisplay,
          fontSize: '1.5rem',
          fontWeight: 400,
          letterSpacing: '-0.02em',
          color: tokens.bone,
        }}
      >
        <CountUp value={Number(value) || 0} decimals={Number.isInteger(Number(value)) ? 0 : 1} />
        {unit && (
          <Box
            component="span"
            sx={{
              fontFamily: tokens.fontItalic,
              fontStyle: 'italic',
              fontSize: '0.85rem',
              color: tokens.boneFaint,
              ml: 0.4,
            }}
          >
            {unit}
          </Box>
        )}
      </Box>
    </Box>
  );
}

function Column({ title, children }) {
  return (
    <Box
      className="rise"
      sx={{
        borderTop: `1px solid ${tokens.rule}`,
        borderLeft: `1px solid ${tokens.rule}`,
        borderRight: `1px solid ${tokens.rule}`,
        borderBottom: `1px solid ${tokens.rule}`,
        p: 3,
      }}
    >
      <Box
        sx={{
          fontFamily: tokens.fontMono,
          fontSize: '0.58rem',
          letterSpacing: '0.22em',
          textTransform: 'uppercase',
          color: tokens.brass,
          mb: 2,
          pb: 1.5,
          borderBottom: `1px solid ${tokens.rule}`,
        }}
      >
        {title}
      </Box>
      {children}
    </Box>
  );
}

export default function AIPage() {
  const { logout } = useAuthStore();
  const [weekStart] = useState(() => getMondayOf(new Date()));

  const { data, loading, error } = useQuery(DASH_WEEKLY_DIGEST, {
    variables: { weekStart },
    fetchPolicy: 'cache-and-network',
  });

  const digest = data?.dashWeeklyDigest;

  return (
    <Box sx={{ minHeight: '100vh' }}>
      <Brand onLogout={logout} />

      <Box sx={{ px: { xs: 2, md: 4 }, pt: { xs: 5, md: 8 }, pb: 8, maxWidth: 1480, mx: 'auto' }}>
        {/* Masthead */}
        <Box
          className="rise"
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            fontFamily: tokens.fontMono,
            fontSize: '0.58rem',
            letterSpacing: '0.24em',
            textTransform: 'uppercase',
            color: tokens.boneFaint,
            mb: 4,
          }}
        >
          <span style={{ color: tokens.brass }}>§ III · Telegram</span>
          <Box sx={{ flex: 1, height: '1px', background: tokens.rule }} />
          <span>Dispatch · Week of {weekStart}</span>
        </Box>

        <Box
          className="rise"
          sx={{
            fontFamily: tokens.fontDisplay,
            fontSize: { xs: '2.75rem', md: '5rem', lg: '6rem' },
            lineHeight: 0.95,
            letterSpacing: '-0.035em',
            fontWeight: 300,
            mb: 3,
            animationDelay: '80ms',
          }}
        >
          The weekly{' '}
          <Box component="span" sx={{ fontFamily: tokens.fontItalic, fontStyle: 'italic', color: tokens.brass }}>
            telegram
          </Box>
          <Box component="span" sx={{ color: tokens.brass }}>.</Box>
        </Box>

        <Box
          className="rise"
          sx={{
            fontFamily: tokens.fontItalic,
            fontStyle: 'italic',
            fontSize: { xs: '1.1rem', md: '1.35rem' },
            color: tokens.boneDim,
            maxWidth: 740,
            lineHeight: 1.5,
            mb: 6,
            animationDelay: '180ms',
          }}
        >
          A hand-delivered summary of the week, assembled from the ledgers of every
          department and dictated by the machine sage.
        </Box>

        {/* Section rule with marker */}
        <Box
          sx={{
            position: 'relative',
            height: '1px',
            background: tokens.rule,
            mb: 5,
          }}
        >
          <Box
            className="draw"
            sx={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: '38%',
              height: '1px',
              background: tokens.brass,
              animationDelay: '300ms',
            }}
          />
          <Box
            sx={{
              position: 'absolute',
              top: -9,
              left: '38%',
              fontFamily: tokens.fontMono,
              fontSize: '0.55rem',
              letterSpacing: '0.22em',
              textTransform: 'uppercase',
              color: tokens.brass,
              background: tokens.ink,
              px: 1.5,
            }}
          >
            § Summary
          </Box>
        </Box>

        {loading && !digest && (
          <Box sx={{ fontFamily: tokens.fontItalic, fontStyle: 'italic', fontSize: '1.2rem', color: tokens.boneDim }}>
            The courier is on the way…
          </Box>
        )}

        {error && (
          <Box sx={{ fontFamily: tokens.fontItalic, fontStyle: 'italic', color: tokens.oxblood }}>
            No word from the dispatch office this week.
          </Box>
        )}

        {digest && (
          <>
            {/* AI summary quote */}
            {digest.aiSummary ? (
              <Box
                className="rise"
                sx={{
                  position: 'relative',
                  borderLeft: `2px solid ${tokens.brass}`,
                  pl: { xs: 3, md: 5 },
                  py: 1,
                  mb: 7,
                  maxWidth: 920,
                  animationDelay: '260ms',
                }}
              >
                <Box
                  sx={{
                    position: 'absolute',
                    left: { xs: '1.25rem', md: '2rem' },
                    top: '-1.5rem',
                    fontFamily: tokens.fontItalic,
                    fontStyle: 'italic',
                    fontSize: '5rem',
                    color: tokens.brass,
                    lineHeight: 1,
                  }}
                >
                  “
                </Box>
                <Box
                  sx={{
                    fontFamily: tokens.fontDisplay,
                    fontSize: { xs: '1.15rem', md: '1.5rem' },
                    lineHeight: 1.5,
                    color: tokens.bone,
                    fontWeight: 300,
                    fontStyle: 'italic',
                  }}
                >
                  {digest.aiSummary}
                </Box>
                <Box
                  sx={{
                    mt: 2,
                    fontFamily: tokens.fontMono,
                    fontSize: '0.55rem',
                    letterSpacing: '0.2em',
                    textTransform: 'uppercase',
                    color: tokens.brass,
                  }}
                >
                  ── dictated by the machine
                </Box>
              </Box>
            ) : (
              <Box
                className="rise"
                sx={{
                  fontFamily: tokens.fontItalic,
                  fontStyle: 'italic',
                  fontSize: '1.1rem',
                  color: tokens.boneFaint,
                  maxWidth: 720,
                  mb: 6,
                  animationDelay: '260ms',
                }}
              >
                The machine sage has nothing to add this week. The numbers speak
                plainly on their own.
              </Box>
            )}

            {/* Stats columns */}
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' },
                gap: 0,
                '& > *': { marginRight: '-1px', marginBottom: '-1px' },
              }}
            >
              {digest.bujo && (
                <Column title="Bujo · the desk">
                  <StatRow label="Tasks struck" value={digest.bujo.tasksCompleted} />
                  <StatRow label="Tasks opened" value={digest.bujo.tasksCreated} />
                  <StatRow
                    label="Completion"
                    value={Math.round((digest.bujo.completionRate || 0) * 100)}
                    unit="%"
                  />
                </Column>
              )}

              {digest.fitness && (
                <Column title="Fitness · the scales">
                  <StatRow label="Avg calories" value={digest.fitness.avgCalories} />
                  <StatRow label="Avg protein" value={digest.fitness.avgProtein} unit="g" />
                  <StatRow
                    label="Weight change"
                    value={digest.fitness.weightChange}
                    unit="lb"
                  />
                  <StatRow label="Days logged" value={digest.fitness.daysLogged} />
                </Column>
              )}

              {digest.flock && (
                <Column title="Flock · the aviary">
                  <StatRow label="Total eggs" value={digest.flock.totalEggs} />
                  <StatRow label="Avg per day" value={digest.flock.avgEggsPerDay} />
                  <StatRow label="Hatch events" value={digest.flock.hatchEvents} />
                  <StatRow label="Chicks hatched" value={digest.flock.chicksHatched} />
                </Column>
              )}

              {digest.books && (
                <Column title="Books · the reading room">
                  <StatRow label="Books finished" value={digest.books.booksFinished} />
                  <StatRow label="Pages read" value={digest.books.pagesRead} />
                  {digest.books.currentlyReading?.length > 0 && (
                    <Box
                      sx={{
                        pt: 1.5,
                        mt: 0.5,
                        borderTop: `1px solid ${tokens.rule}`,
                        fontFamily: tokens.fontItalic,
                        fontStyle: 'italic',
                        fontSize: '0.88rem',
                        color: tokens.boneDim,
                      }}
                    >
                      currently: {digest.books.currentlyReading.join(', ')}
                    </Box>
                  )}
                </Column>
              )}

              {digest.notes && (
                <Column title="Notes · the marginalia">
                  <StatRow label="Notes created" value={digest.notes.notesCreated} />
                  <StatRow label="Notes updated" value={digest.notes.notesUpdated} />
                  {digest.notes.topTags?.length > 0 && (
                    <Box
                      sx={{
                        pt: 1.5,
                        mt: 0.5,
                        borderTop: `1px solid ${tokens.rule}`,
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: 0.75,
                      }}
                    >
                      {digest.notes.topTags.map((t) => (
                        <Box
                          key={t}
                          sx={{
                            fontFamily: tokens.fontMono,
                            fontSize: '0.52rem',
                            letterSpacing: '0.15em',
                            textTransform: 'uppercase',
                            color: tokens.brass,
                            border: `1px solid ${tokens.rule}`,
                            px: 0.8,
                            py: 0.3,
                          }}
                        >
                          #{t}
                        </Box>
                      ))}
                    </Box>
                  )}
                </Column>
              )}
            </Box>
          </>
        )}
      </Box>
    </Box>
  );
}
