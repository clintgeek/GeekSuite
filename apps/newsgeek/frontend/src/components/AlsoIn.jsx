/**
 * "Also in KARK +2": the other copies of one story (NewsArticle.alsoIn). The
 * gateway collapses duplicates — an AP story run by several stations, an
 * obituary on the paper and on legacy.com — into one representative item and
 * lists the rest here (at most 5, the representative excluded).
 *
 * Quiet on purpose: one line of small gothic in the secondary ink, a button
 * (44px tall) that opens the other publishers in one wrapped row, each a
 * link (44px target) to its copy at that publisher. Nothing at all when there are no other copies.
 * Each link is that outlet's ORIGINAL url (never the reader's opener for the
 * story), opened in a new tab or in this window as `openInNewTab` says.
 */
import React, { useId, useState } from 'react';
import { Box, ButtonBase, Link } from '@mui/material';
import { ExpandMore as ExpandIcon, OpenInNew as OpenIcon } from '@mui/icons-material';
import { GOTHIC } from '../theme/theme';
import { linkTargetProps } from '../utils/openUrl';

/** "Also in KARK +2" / "Also in KARK" / null. */
export function alsoInLabel(alsoIn = []) {
  if (!alsoIn?.length) return null;
  const [first, ...rest] = alsoIn;
  return rest.length ? `Also in ${first.publisher} +${rest.length}` : `Also in ${first.publisher}`;
}

const lineSx = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 0.5,
  minHeight: 44,
  mb: -2, // the article's own bottom padding already frames it
  px: 0,
  fontFamily: GOTHIC,
  fontSize: '0.8125rem',
  fontWeight: 600,
  letterSpacing: '0.01em',
  color: 'text.secondary',
  textAlign: 'left',
  '@media (hover: hover)': { '&:hover': { color: 'text.primary' } },
  '&:focus-visible': { outline: '2px solid', outlineOffset: 2 },
};

const linkSx = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 1,
  minHeight: 44,
  fontFamily: GOTHIC,
  fontSize: '0.875rem',
  fontWeight: 600,
  color: 'text.primary',
  textDecorationColor: 'currentColor',
  textUnderlineOffset: '0.2em',
  '&:visited': { color: 'text.secondary' },
  '&:focus-visible': { outline: '2px solid', outlineOffset: 2 },
};

export default function AlsoIn({ alsoIn, openInNewTab = true, sx }) {
  const [open, setOpen] = useState(false);
  const listId = `also-in-${useId().replace(/:/g, '')}`;
  const label = alsoInLabel(alsoIn);
  if (!label) return null;
  return (
    <Box data-testid="also-in" sx={sx}>
      <ButtonBase aria-expanded={open} aria-controls={listId} onClick={() => setOpen((o) => !o)} sx={lineSx}>
        {label}
        <ExpandIcon aria-hidden="true" sx={{ fontSize: 18, transition: 'transform 120ms', transform: open ? 'rotate(180deg)' : 'none' }} />
      </ButtonBase>
      <Box
        component="ul"
        id={listId}
        hidden={!open}
        aria-label="Also published by"
        sx={{ listStyle: 'none', m: 0, mb: open ? -2 : 0, p: 0, display: open ? 'flex' : 'none', flexWrap: 'wrap', columnGap: 5 }}
      >
        {alsoIn.map((copy) => (
          <Box component="li" key={copy.url} sx={{ display: 'flex' }}>
            <Link href={copy.url} {...linkTargetProps(openInNewTab)} underline="always" sx={linkSx}>
              {copy.publisher}
              <OpenIcon aria-hidden="true" sx={{ fontSize: 14, color: 'text.secondary' }} />
            </Link>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
