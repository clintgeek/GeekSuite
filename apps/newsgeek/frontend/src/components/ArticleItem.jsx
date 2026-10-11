/**
 * One story in the Latest column. The headline is the link, and it goes to
 * the publisher: we never reproduce the article (DOCS/NEWSGEEK_PLAN.md,
 * "Article text") — unless the reader chose another opener for this
 * publisher (plan "Opening", Chef 2026-10-11: one of their open-with links,
 * per source or per publisher domain; utils/openUrl.js resolveStoryOpen).
 * Every outbound link here honours the reader's window mode (`openInNewTab`):
 * a new tab, or this window so Back returns to NewsGeek. "Open at publisher"
 * in the ⋯ menu and the Also-in links always use the original URLs.
 * The excerpt is the feed's own, clamped to three lines.
 * Official notices carry the OFFICIAL badge and a spot-colour rule at the
 * left edge — the word does the work, the colour only repeats it.
 *
 * On Today (`why` given) the story's why-chips (WhyChips) take the place of
 * its place chips — the ring place that put it there is already a chip, and
 * two rows of tags would out-shout the headline. `lead` sets the paper's lead
 * story a size up; `headingLevel` is h3 under Today's section headings.
 *
 * The publisher line is plain text. The Source sheet (plan "Source sheet")
 * opens from the ⋯ menu's "Source settings" (Chef, 2026-10-10: settings live
 * in the menu, not on the name); the headline is still the link to the
 * publisher.
 *
 * When the gateway collapsed other copies of the story into this one
 * (`alsoIn`, feed hygiene), a quiet "Also in KARK +2" line closes the item
 * (AlsoIn); the headline still goes to this copy.
 */
import React from 'react';
import { Box, Link, Typography } from '@mui/material';
import { GOTHIC, SERIF } from '../theme/theme';
import AlsoIn from './AlsoIn';
import ArticleMenu from './ArticleMenu';
import OfficialBadge from './OfficialBadge';
import PlaceChips from './PlaceChips';
import WhyChips from './WhyChips';
import TimeAgo from './TimeAgo';
import { linkTargetProps, resolveStoryOpen } from '../utils/openUrl';

const visuallyHidden = { position: 'absolute', width: 1, height: 1, p: 0, m: '-1px', border: 0, overflow: 'hidden', clip: 'rect(0 0 0 0)', clipPath: 'inset(50%)', whiteSpace: 'nowrap' };

const publisherSx = { fontFamily: GOTHIC, fontSize: '0.8125rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'text.primary' };

export default function ArticleItem({ article, readerLinks = [], openInNewTab = true, openers = [], onOpenSource, why, lead = false, headingLevel = 'h2' }) {
  const official = article.sourceKind === 'official';
  const publisher = article.publisher || article.sourceName;
  const opened = resolveStoryOpen(article, { openers, readerLinks });
  const where = opened.link ? `opens with ${opened.link.label}` : `opens at ${publisher}`;
  return (
    <Box
      component="article"
      data-testid="article"
      data-official={official ? 'true' : undefined}
      data-lead={lead ? 'true' : undefined}
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
        <Typography component="span" sx={publisherSx}>
          {publisher}
        </Typography>
        <Typography component="span" sx={{ fontFamily: GOTHIC, fontSize: '0.8125rem', color: 'text.secondary' }}>
          <TimeAgo value={article.publishedAt} />
        </Typography>
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mb: article.excerpt ? 1.5 : 0 }}>
      <Typography
        variant="h4"
        component={headingLevel}
        sx={{ flex: 1, minWidth: 0, fontSize: lead ? { xs: '1.75rem', sm: '2.125rem' } : { xs: '1.3125rem', sm: '1.5rem' }, lineHeight: lead ? 1.12 : 1.2 }}
      >
        <Link
          href={opened.url}
          {...linkTargetProps(openInNewTab)}
          data-opener={opened.link ? opened.link.id : 'original'}
          underline="hover"
          sx={{ color: 'text.primary', fontFamily: SERIF, '&:visited': { color: 'text.secondary' }, '&:focus-visible': { outline: '2px solid', outlineOffset: 3 } }}
        >
          {article.title}{' '}
          <Box component="span" sx={visuallyHidden}>
            {`(${where}${openInNewTab ? ', in a new tab' : ''})`}
          </Box>
        </Link>
      </Typography>
      <Box sx={{ mt: -1.5, mr: -2 }}>
        <ArticleMenu article={article} readerLinks={readerLinks} openInNewTab={openInNewTab} onOpenSource={onOpenSource} />
      </Box>
      </Box>
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
      {why ? <WhyChips why={why} official={official} sx={{ mt: 2 }} /> : <PlaceChips places={article.places} sx={{ mt: 2 }} />}
      <AlsoIn alsoIn={article.alsoIn} openInNewTab={openInNewTab} sx={{ mt: 1 }} />
    </Box>
  );
}
