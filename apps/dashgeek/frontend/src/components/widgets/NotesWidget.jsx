import React from 'react';
import { useQuery } from '@apollo/client';
import { Box, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import LedgerCard from '../LedgerCard';
import { DASH_RECENT_NOTES } from '../../graphql/queries';

const DOMAIN = 'notegeek';

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function NotesWidget() {
  const theme = useTheme();
  const domainColor = theme.palette.domains[DOMAIN];

  const { data, loading, error } = useQuery(DASH_RECENT_NOTES, {
    variables: { limit: 5 },
    fetchPolicy: 'cache-and-network',
  });

  if (loading && !data) {
    return (
      <LedgerCard domain={DOMAIN} title="Notes" loading />
    );
  }

  const notes = data?.dashRecentNotes || [];

  if (error) {
    return (
      <LedgerCard
        domain={DOMAIN}
        title="Notes"
        action={{ label: 'open →', href: 'https://notegeek.clintgeek.com' }}
      >
        <Typography variant="caption" sx={{ color: 'text.disabled' }}>
          couldn't load
        </Typography>
        <Box
          component="a"
          href="https://notegeek.clintgeek.com"
          target="_blank"
          rel="noreferrer"
          sx={{
            display: 'block',
            mt: 0.5,
            fontFamily: theme.typography.fontFamilyMono,
            fontSize: '0.6875rem',
            color: 'text.secondary',
            textDecoration: 'none',
            '&:hover': { color: 'text.primary' },
          }}
        >
          open notegeek →
        </Box>
      </LedgerCard>
    );
  }

  if (notes.length === 0) {
    return (
      <LedgerCard
        domain={DOMAIN}
        title="Notes"
        action={{ label: 'open →', href: 'https://notegeek.clintgeek.com' }}
      >
        <Typography variant="caption" sx={{ color: 'text.disabled' }}>
          no notes yet —{' '}
          <Box
            component="a"
            href="https://notegeek.clintgeek.com"
            target="_blank"
            rel="noreferrer"
            sx={{
              color: 'text.secondary',
              fontFamily: theme.typography.fontFamilyMono,
              fontSize: '0.75rem',
              textDecoration: 'none',
              '&:hover': { color: 'text.primary' },
            }}
          >
            open notegeek →
          </Box>
        </Typography>
      </LedgerCard>
    );
  }

  // 7-day trend: use notes count distributed over time as a simple signal.
  // Since we only get the 5 most recent notes (no historical breakdown),
  // we produce a per-note index trend signal (oldest-to-newest: 1..n).
  const trendValues = notes
    .slice()
    .reverse()
    .map((_, i) => i + 1);

  return (
    <LedgerCard
      domain={DOMAIN}
      title="Notes"
      trend={trendValues}
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
        {notes.slice(0, 5).map((note, i) => (
          <Box key={note.id}>
            {i > 0 && (
              <Box sx={{ height: '1px', backgroundColor: 'divider' }} />
            )}
            <Box
              sx={{
                py: '8px',
                borderRadius: '4px',
                px: '4px',
                mx: '-4px',
                transition: 'background-color 120ms ease',
                '&:hover': {
                  backgroundColor: theme.palette.glow?.soft,
                },
              }}
            >
              {/* Title row */}
              <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 1 }}>
                <Typography
                  variant="body1"
                  sx={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    flex: 1,
                    fontSize: '0.875rem',
                  }}
                >
                  {note.title || 'Untitled'}
                </Typography>
                <Typography
                  variant="caption"
                  sx={{ flexShrink: 0, color: 'text.secondary' }}
                >
                  {timeAgo(note.updatedAt)}
                </Typography>
              </Box>

              {/* Tags */}
              {note.tags?.length > 0 && (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: '4px', mt: '4px' }}>
                  {note.tags.slice(0, 4).map((tag) => (
                    <Box
                      key={tag}
                      component="span"
                      sx={{
                        fontFamily: theme.typography.fontFamilyMono,
                        fontWeight: 500,
                        fontSize: '0.6rem',
                        letterSpacing: '0.04em',
                        color: domainColor,
                        backgroundColor: theme.palette.glow?.soft,
                        border: `1px solid ${theme.palette.border ?? theme.palette.divider}`,
                        borderRadius: '4px',
                        px: '5px',
                        py: '2px',
                        lineHeight: 1.4,
                      }}
                    >
                      {tag}
                    </Box>
                  ))}
                </Box>
              )}
            </Box>
          </Box>
        ))}
      </Box>
    </LedgerCard>
  );
}
