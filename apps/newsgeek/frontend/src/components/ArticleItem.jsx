/**
 * One story in the Latest column. The headline is the link, and it goes to
 * the publisher: we never reproduce the article (DOCS/NEWSGEEK_PLAN.md,
 * "Article text") — unless the reader chose another opener for this
 * publisher (plan "Opening", Chef 2026-10-11: one of their open-with links,
 * per source or per publisher domain; utils/openUrl.js resolveStoryOpen).
 * Every outbound link here honours the reader's window mode (`openInNewTab`):
 * a new tab, or this window so Back returns to NewsGeek. "Open at publisher"
 * in the ⋯ menu and the Also-in links always use the original URLs.
 * The excerpt is the feed's own, clamped to two lines on a phone (three for
 * the lead, and on wider screens).
 *
 * The whole story is one tap (UX review 2026-11-18, finding 2): the headline
 * link is a full-width block (its own box is the 44px target the harness
 * measures) and a stretched ::after carries it over the excerpt and the
 * space around it. The ⋯ menu, the time and "Also in" sit above that layer
 * (`position: relative; z-index: 1`) and stay their own targets. Hover
 * devices get a shade band over the whole story.
 *
 * The why-chips (or place chips) ride on the publisher line, and a chip
 * that only repeats the section the reader is in (`hideChips`, e.g.
 * "Arkansas" under State) is not printed — display only, the ranking is the
 * gateway's. An opened story's headline turns to the faint ink (:visited).
 * Official notices carry the OFFICIAL badge and a spot-colour rule at the
 * left edge — the word does the work, the colour only repeats it.
 *
 * On Today (`why` given) the story's why-chips (WhyChips) take the place of
 * its place chips — the ring place that put it there is already a chip, and
 * two rows of tags would out-shout the headline. `lead` sets the paper's lead
 * story a size up; `headingLevel` is h3 under Today's section headings.
 *
 * The publisher line is plain text, with the ⋯ at its right end. The Source sheet (plan "Source sheet")
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
import { GOTHIC, SERIF, visuallyHiddenSx } from '../theme/theme';
import AlsoIn from './AlsoIn';
import ArticleMenu from './ArticleMenu';
import OfficialBadge from './OfficialBadge';
import PlaceChips from './PlaceChips';
import WhyChips from './WhyChips';
import TimeAgo from './TimeAgo';
import { linkTargetProps, resolveStoryOpen } from '../utils/openUrl';


const publisherSx = { fontFamily: GOTHIC, fontSize: '0.8125rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'text.primary' };

export default function ArticleItem({
  article,
  readerLinks = [],
  openInNewTab = true,
  openers = [],
  onOpenSource,
  why,
  hideChips = [],
  lead = false,
  headingLevel = 'h2',
}) {
  const official = article.sourceKind === 'official';
  const publisher = article.publisher || article.sourceName;
  const opened = resolveStoryOpen(article, { openers, readerLinks });
  const where = opened.link ? `opens with ${opened.link.label}` : `opens at ${publisher}`;
  const chipSx = { display: 'inline-flex' };
  return (
    <Box
      component="article"
      data-testid="article"
      data-official={official ? 'true' : undefined}
      data-lead={lead ? 'true' : undefined}
      sx={{
        position: 'relative',
        pt: 2,
        pb: 4,
        borderBottom: 1,
        borderColor: 'divider',
        ...(official && { pl: 3, boxShadow: (t) => `inset 3px 0 0 ${t.palette.official.main}` }),
        '@media (hover: hover)': {
          '&:hover': {
            bgcolor: 'background.shade',
            // The band runs a little past the column's text edge, without moving it.
            boxShadow: (t) =>
              [`-8px 0 0 ${t.palette.background.shade}`, `8px 0 0 ${t.palette.background.shade}`, official ? `inset 3px 0 0 ${t.palette.official.main}` : null]
                .filter(Boolean)
                .join(', '),
          },
        },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
        <Box data-testid="publisher-line" sx={{ flex: 1, minWidth: 0, minHeight: 44, display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 2, rowGap: 1, py: 1 }}>
          {official ? <OfficialBadge /> : null}
          <Typography component="span" sx={publisherSx}>
            {publisher}
          </Typography>
          <Typography component="span" sx={{ position: 'relative', zIndex: 1, fontFamily: GOTHIC, fontSize: '0.8125rem', color: 'text.secondary' }}>
            <TimeAgo value={article.publishedAt} />
          </Typography>
          {why ? (
            <WhyChips why={why} official={official} hide={hideChips} sx={chipSx} />
          ) : (
            <PlaceChips places={(article.places ?? []).filter((p) => !hideChips.includes(p.name))} sx={chipSx} />
          )}
        </Box>
        <Box sx={{ mr: -2, position: 'relative', zIndex: 1 }}>
          <ArticleMenu article={article} readerLinks={readerLinks} openInNewTab={openInNewTab} onOpenSource={onOpenSource} />
        </Box>
      </Box>
      <Typography
        variant="h4"
        component={headingLevel}
        sx={{ mt: 0.5, fontSize: lead ? { xs: '1.75rem', sm: '2.125rem' } : { xs: '1.3125rem', sm: '1.5rem' }, lineHeight: lead ? 1.12 : 1.2 }}
      >
        <Link
          href={opened.url}
          {...linkTargetProps(openInNewTab)}
          data-opener={opened.link ? opened.link.id : 'original'}
          data-testid="story-link"
          underline="hover"
          sx={{
            display: 'block',
            minHeight: 44,
            color: 'text.primary',
            fontFamily: SERIF,
            '&:visited': { color: 'text.muted' },
            '&:focus-visible': { outline: '2px solid', outlineOffset: 3 },
            // The rest of the story taps through to the same link.
            '&::after': { content: '""', position: 'absolute', inset: 0, zIndex: 0 },
          }}
        >
          {article.title}{' '}
          <Box component="span" sx={visuallyHiddenSx}>
            {`(${where}${openInNewTab ? ', in a new tab' : ''})`}
          </Box>
        </Link>
      </Typography>
      {article.excerpt ? (
        <Typography
          variant="body1"
          data-testid="excerpt"
          sx={{
            mt: 1.5,
            color: 'text.secondary',
            display: '-webkit-box',
            WebkitLineClamp: { xs: lead ? 3 : 2, sm: 3 },
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {article.excerpt}
        </Typography>
      ) : null}
      <AlsoIn alsoIn={article.alsoIn} openInNewTab={openInNewTab} sx={{ mt: 1, position: 'relative', zIndex: 1 }} />
    </Box>
  );
}
