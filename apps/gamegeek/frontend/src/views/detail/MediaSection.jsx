/**
 * Media and links on the detail page (DOCS/METADATA_ENRICHMENT.md §Media and
 * links). Sits full-width right under the action bar, so on a phone it is
 * the first thing you scroll to.
 *
 *   loading → skeleton tiles (still with the links row: those never wait)
 *   media   → a swipe strip, lead trailer first; a tap opens the viewer
 *   none    → just the links, under a "Links" heading
 *   error   → one quiet line, and the links
 *
 * Arcade Sticker: the tiles are little stickers — ink outline, hard shadow,
 * the trailer marked with a lime play badge.
 */
import React, { useMemo, useState } from 'react';
import { Box, Button, ButtonBase, Skeleton, Typography } from '@mui/material';
import { OpenInNew as ExternalIcon, PlayArrowRounded as PlayIcon } from '@mui/icons-material';
import { useReducedMotion } from '@geeksuite/ui';
import { ARCADE, hardShadow } from '../../theme/theme';
import { buildGameLinks, mediaItems } from '../../utils/gameMedia';
import { visuallyHidden } from '../../utils/a11y';
import MediaViewer from './MediaViewer';
import Section from './Section';

const TILE_W = { xs: 232, md: 256 };

function Tile({ item, onOpen }) {
  const isVideo = item.type === 'video';
  return (
    <Box component="li" sx={{ listStyle: 'none', flex: '0 0 auto', scrollSnapAlign: 'start' }}>
      <ButtonBase
        onClick={onOpen}
        aria-label={isVideo ? `Play ${item.label}` : undefined}
        data-testid="media-tile"
        sx={{
          display: 'block',
          position: 'relative',
          width: TILE_W,
          aspectRatio: '16 / 9',
          borderRadius: '8px',
          overflow: 'hidden',
          border: '2px solid',
          borderColor: 'border',
          bgcolor: 'background.raised',
          boxShadow: (t) => hardShadow(3, t.palette.arcade.shadow),
          '&.Mui-focusVisible': { outline: '3px solid', outlineColor: 'primary.main', outlineOffset: 2 },
        }}
      >
        {item.thumb ? (
          <Box
            component="img"
            src={item.thumb}
            alt={isVideo ? '' : item.label}
            loading="lazy"
            decoding="async"
            sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        ) : null}
        {isVideo ? (
          <>
            <Box
              aria-hidden="true"
              sx={{
                position: 'absolute',
                left: '50%',
                top: '50%',
                transform: 'translate(-50%, -50%)',
                width: 48,
                height: 48,
                borderRadius: '50%',
                display: 'grid',
                placeItems: 'center',
                bgcolor: ARCADE.lime,
                color: ARCADE.ink,
                border: `2px solid ${ARCADE.ink}`,
                boxShadow: hardShadow(2, ARCADE.ink),
              }}
            >
              <PlayIcon sx={{ fontSize: 32 }} />
            </Box>
            <Box
              aria-hidden="true"
              sx={{
                position: 'absolute',
                left: 8,
                bottom: 8,
                px: 1,
                py: 0.25,
                borderRadius: '6px',
                bgcolor: ARCADE.ink,
                color: ARCADE.paperInk,
                fontSize: '0.75rem',
                fontWeight: 700,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
              }}
            >
              Trailer
            </Box>
          </>
        ) : null}
      </ButtonBase>
    </Box>
  );
}

function SkeletonStrip({ reduced }) {
  return (
    <Box role="status" aria-label="Loading screenshots" data-testid="media-loading" sx={{ display: 'flex', gap: 1.5, overflow: 'hidden', pb: 0.5 }}>
      {[0, 1, 2].map((i) => (
        <Skeleton
          key={i}
          variant="rectangular"
          animation={reduced ? false : 'wave'}
          sx={{ flex: '0 0 auto', width: TILE_W, height: 'auto', aspectRatio: '16 / 9', borderRadius: '8px' }}
        />
      ))}
    </Box>
  );
}

export function LinksRow({ links }) {
  if (!links.length) return null;
  return (
    <Box component="ul" aria-label="Links" data-testid="game-links" sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, m: 0, p: 0, listStyle: 'none' }}>
      {links.map((l) => (
        <Box component="li" key={l.kind}>
          <Button
            component="a"
            href={l.url}
            target="_blank"
            rel="noopener noreferrer"
            variant="outlined"
            endIcon={<ExternalIcon sx={{ fontSize: 16 }} aria-hidden="true" />}
            sx={{ minHeight: 44, color: 'text.primary' }}
          >
            {l.label}
            <Box component="span" sx={visuallyHidden}> (opens in a new tab)</Box>
          </Button>
        </Box>
      ))}
    </Box>
  );
}

/**
 * `media` is useGameMedia()'s `{status, media}`. The parent owns the fetch so
 * a test (or the harness) can drive the states directly.
 */
export default function MediaSection({ game, status, media }) {
  const reduced = useReducedMotion();
  const [openAt, setOpenAt] = useState(null);
  const items = useMemo(() => mediaItems(media, game?.title), [media, game?.title]);
  const links = useMemo(() => buildGameLinks(game, media), [game, media]);

  const loading = status === 'loading';
  const hasMedia = items.length > 0;
  if (!loading && !hasMedia && status !== 'error' && !links.length) return null;

  return (
    <Section title={loading || hasMedia || status === 'error' ? 'Media' : 'Links'} id="media">
      {loading ? <SkeletonStrip reduced={reduced} /> : null}
      {!loading && status === 'error' ? (
        <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary', mb: 1.5 }} data-testid="media-error">
          Couldn&apos;t load screenshots.
        </Typography>
      ) : null}
      {!loading && hasMedia ? (
        <Box
          component="ul"
          aria-label={`${game.title} screenshots and trailers`}
          data-testid="media-strip"
          sx={{
            display: 'flex',
            gap: 1.5,
            m: 0,
            // Room for the hard shadow and the focus ring inside the scroller.
            p: '2px 6px 8px 2px',
            overflowX: 'auto',
            overscrollBehaviorX: 'contain',
            scrollSnapType: 'x mandatory',
            scrollBehavior: reduced ? 'auto' : 'smooth',
            scrollbarWidth: 'thin',
          }}
        >
          {items.map((item, i) => (
            <Tile key={`${item.type}-${item.full || item.url || i}`} item={item} onOpen={() => setOpenAt(i)} />
          ))}
        </Box>
      ) : null}
      {links.length ? <Box sx={{ mt: loading || hasMedia ? 1.5 : 0 }}><LinksRow links={links} /></Box> : null}
      <MediaViewer open={openAt !== null} items={items} index={openAt ?? 0} onIndexChange={setOpenAt} onClose={() => setOpenAt(null)} />
    </Section>
  );
}
