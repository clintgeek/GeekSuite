import React from 'react';
import { useQuery } from '@apollo/client';
import { Box, LinearProgress, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import LedgerCard from '../LedgerCard';
import { DASH_BOOK_PROGRESS } from '../../graphql/queries';

const DOMAIN = 'bookgeek';

export default function BooksWidget() {
  const theme = useTheme();
  const domainColor = theme.palette.domains[DOMAIN];

  const { data, loading, error } = useQuery(DASH_BOOK_PROGRESS, {
    fetchPolicy: 'cache-and-network',
  });

  if (loading && !data) {
    return (
      <LedgerCard domain={DOMAIN} title="Books" loading />
    );
  }

  const books = data?.dashBookProgress || [];

  if (error || books.length === 0) {
    return (
      <LedgerCard
        domain={DOMAIN}
        title="Books"
        action={{ label: 'open →', href: 'https://bookgeek.clintgeek.com' }}
      >
        <Typography variant="caption" sx={{ color: 'text.disabled' }}>
          {error ? "couldn't load" : 'no data yet'}
          {' — '}
          <Box
            component="a"
            href="https://bookgeek.clintgeek.com"
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
            open bookgeek →
          </Box>
        </Typography>
      </LedgerCard>
    );
  }

  const hero = books[0];
  const rest = books.slice(1, 3);
  const heroPct = Math.min(100, Math.round(hero.percentComplete || 0));

  return (
    <LedgerCard
      domain={DOMAIN}
      title="Books"
      action={{ label: 'open →', href: 'https://bookgeek.clintgeek.com' }}
    >
      {/* Hero book */}
      <Box sx={{ display: 'flex', gap: '12px', mb: '16px' }}>
        {/* Cover thumbnail */}
        {hero.coverUrl && (
          <Box
            component="img"
            src={hero.coverUrl}
            alt={hero.title}
            sx={{
              width: 40,
              height: 60,
              objectFit: 'cover',
              flexShrink: 0,
              border: `1px solid ${theme.palette.border ?? theme.palette.divider}`,
              borderRadius: '3px',
            }}
          />
        )}

        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            variant="body1"
            sx={{
              fontWeight: 500,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              lineHeight: 1.35,
              mb: '4px',
            }}
          >
            {hero.title}
          </Typography>

          {hero.authors?.length > 0 && (
            <Typography
              variant="body2"
              sx={{ color: 'text.secondary', mb: '8px' }}
            >
              {hero.authors.join(', ')}
            </Typography>
          )}

          {hero.totalPages > 0 && (
            <>
              <LinearProgress
                variant="determinate"
                value={heroPct}
                sx={{
                  mb: '4px',
                  '& .MuiLinearProgress-bar': {
                    backgroundColor: domainColor,
                  },
                }}
              />
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  p.{hero.currentPage} / {hero.totalPages}
                </Typography>
                <Typography variant="caption" sx={{ color: domainColor }}>
                  {heroPct}%
                </Typography>
              </Box>
            </>
          )}
        </Box>
      </Box>

      {/* Other in-progress books */}
      {rest.length > 0 && (
        <Box sx={{ mt: 'auto' }}>
          <Typography variant="h6" sx={{ color: 'text.disabled', mb: '8px' }}>
            also in progress
          </Typography>
          {rest.map((b, i) => (
            <Box key={b.id}>
              {i > 0 && (
                <Box sx={{ height: '1px', backgroundColor: 'divider', my: '6px' }} />
              )}
              <Box sx={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                <Box
                  sx={{
                    width: 4,
                    height: 4,
                    borderRadius: '50%',
                    backgroundColor: domainColor,
                    flexShrink: 0,
                    alignSelf: 'center',
                  }}
                />
                <Typography
                  variant="body2"
                  sx={{
                    color: 'text.secondary',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    flex: 1,
                  }}
                >
                  {b.title}
                </Typography>
                {b.totalPages > 0 && (
                  <Typography variant="caption" sx={{ flexShrink: 0, color: 'text.disabled' }}>
                    {Math.round(b.percentComplete || 0)}%
                  </Typography>
                )}
              </Box>
            </Box>
          ))}
        </Box>
      )}
    </LedgerCard>
  );
}
