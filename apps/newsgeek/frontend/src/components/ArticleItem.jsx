/**
 * One story in the Latest column. The headline is the link, and it goes to
 * the publisher: we never reproduce the article (DOCS/NEWSGEEK_PLAN.md,
 * "Article text"). The excerpt is the feed's own, clamped to three lines.
 * Official notices carry the OFFICIAL badge and a spot-colour rule at the
 * left edge — the word does the work, the colour only repeats it.
 */
import React from 'react';
import { Box, Link, Typography } from '@mui/material';
import { GOTHIC, SERIF } from '../theme/theme';
import OfficialBadge from './OfficialBadge';
import PlaceChips from './PlaceChips';
import TimeAgo from './TimeAgo';

const visuallyHidden = { position: 'absolute', width: 1, height: 1, p: 0, m: '-1px', border: 0, overflow: 'hidden', clip: 'rect(0 0 0 0)', clipPath: 'inset(50%)', whiteSpace: 'nowrap' };

export default function ArticleItem({ article }) {
  const official = article.sourceKind === 'official';
  return (
    <Box
      component="article"
      data-testid="article"
      data-official={official ? 'true' : undefined}
      sx={{
        position: 'relative',
        py: 4,
        borderBottom: 1,
        borderColor: 'divider',
        ...(official && { pl: 3, boxShadow: (t) => `inset 3px 0 0 ${t.palette.official.main}` }),
      }}
    >
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 2, rowGap: 1, mb: 1.5 }}>
        {official ? <OfficialBadge /> : null}
        <Typography component="span" sx={{ fontFamily: GOTHIC, fontSize: '0.8125rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'text.primary' }}>
          {article.publisher || article.sourceName}
        </Typography>
        <Typography component="span" sx={{ fontFamily: GOTHIC, fontSize: '0.8125rem', color: 'text.secondary' }}>
          <TimeAgo value={article.publishedAt} />
        </Typography>
      </Box>
      <Typography variant="h4" component="h2" sx={{ fontSize: { xs: '1.3125rem', sm: '1.5rem' }, lineHeight: 1.2, mb: article.excerpt ? 1.5 : 0 }}>
        <Link
          href={article.url}
          target="_blank"
          rel="noopener noreferrer"
          underline="hover"
          sx={{ color: 'text.primary', fontFamily: SERIF, '&:visited': { color: 'text.secondary' }, '&:focus-visible': { outline: '2px solid', outlineOffset: 3 } }}
        >
          {article.title}
          <Box component="span" sx={visuallyHidden}>
            {' '}(opens at {article.publisher || article.sourceName})
          </Box>
        </Link>
      </Typography>
      {article.excerpt ? (
        <Typography
          variant="body1"
          sx={{
            color: 'text.secondary',
            display: '-webkit-box',
            WebkitLineClamp: 3,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {article.excerpt}
        </Typography>
      ) : null}
      <PlaceChips places={article.places} sx={{ mt: 2 }} />
    </Box>
  );
}
