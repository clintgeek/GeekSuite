import React from 'react';
import { useQuery } from '@apollo/client';
import { Box, Skeleton } from '@mui/material';
import EditorialCard from '../EditorialCard';
import { DASH_BOOK_PROGRESS } from '../../graphql/queries';
import { tokens } from '../../theme';

export default function BooksWidget({ delay = 0 }) {
  const { data, loading, error } = useQuery(DASH_BOOK_PROGRESS, {
    fetchPolicy: 'cache-and-network',
  });

  if (loading && !data) {
    return (
      <EditorialCard index="06" dept="BookGeek" kicker="The reading room" delay={delay}>
        <Skeleton variant="rectangular" height={80} sx={{ mb: 2 }} />
      </EditorialCard>
    );
  }

  const books = data?.dashBookProgress || [];

  if (error || books.length === 0) {
    return (
      <EditorialCard index="06" dept="BookGeek" kicker="The reading room" href="https://bookgeek.clintgeek.com" delay={delay}>
        <Box sx={{ fontFamily: tokens.fontItalic, fontStyle: 'italic', color: tokens.boneFaint }}>
          The library is still. Nothing on the nightstand.
        </Box>
      </EditorialCard>
    );
  }

  const hero = books[0];
  const rest = books.slice(1, 3);

  return (
    <EditorialCard
      index="06"
      dept="BookGeek"
      kicker="The reading room"
      href="https://bookgeek.clintgeek.com"
      delay={delay}
      meta={
        <>
          <span>{books.length} in progress</span>
          <span style={{ color: tokens.brass }}>
            {hero.percentComplete?.toFixed?.(0) ?? 0}% complete
          </span>
        </>
      }
    >
      {/* Hero book */}
      <Box sx={{ mb: 2.5 }}>
        <Box
          sx={{
            fontFamily: tokens.fontDisplay,
            fontSize: '1.6rem',
            fontWeight: 400,
            color: tokens.bone,
            letterSpacing: '-0.015em',
            lineHeight: 1.1,
            mb: 0.5,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
          }}
        >
          {hero.title}
        </Box>
        {hero.authors?.length > 0 && (
          <Box
            sx={{
              fontFamily: tokens.fontItalic,
              fontStyle: 'italic',
              fontSize: '0.88rem',
              color: tokens.boneDim,
              mb: 1.5,
            }}
          >
            by {hero.authors.join(', ')}
          </Box>
        )}

        {hero.totalPages > 0 && (
          <>
            <Box sx={{ position: 'relative', height: '2px', background: tokens.boneGhost, mb: 0.75 }}>
              <Box
                sx={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  height: '100%',
                  width: `${hero.percentComplete || 0}%`,
                  background: tokens.brass,
                  transition: 'width 900ms var(--ease)',
                }}
              />
            </Box>
            <Box
              sx={{
                fontFamily: tokens.fontMono,
                fontSize: '0.55rem',
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: tokens.boneFaint,
                display: 'flex',
                justifyContent: 'space-between',
              }}
            >
              <span>
                p.{hero.currentPage} / {hero.totalPages}
              </span>
              <span style={{ color: tokens.brass }}>
                {(hero.percentComplete || 0).toFixed(0)}%
              </span>
            </Box>
          </>
        )}
      </Box>

      {/* Rest of stack */}
      {rest.length > 0 && (
        <Box sx={{ mt: 'auto' }}>
          <Box
            sx={{
              fontFamily: tokens.fontMono,
              fontSize: '0.52rem',
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: tokens.boneFaint,
              mb: 1,
            }}
          >
            ── Also on the nightstand
          </Box>
          {rest.map((b) => (
            <Box
              key={b.id}
              sx={{
                fontFamily: tokens.fontDisplay,
                fontSize: '0.85rem',
                color: tokens.boneDim,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                mb: 0.25,
              }}
            >
              <Box component="span" sx={{ color: tokens.brass, mr: 1, fontFamily: tokens.fontMono, fontSize: '0.55rem' }}>
                ◦
              </Box>
              {b.title}
            </Box>
          ))}
        </Box>
      )}
    </EditorialCard>
  );
}
