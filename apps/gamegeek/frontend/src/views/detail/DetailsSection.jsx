/**
 * Catalogue facts: genres, modes, time to beat, the description, and where
 * else it lives. Genres and tags are links into the filtered library.
 */
import React, { useState } from 'react';
import { Box, Button, ButtonBase, Link, Tooltip, Typography, alpha } from '@mui/material';
import { OpenInNew as ExternalIcon } from '@mui/icons-material';
import { Link as RouterLink, useLocation } from 'react-router-dom';
import { libraryPath } from '../../components/navConfig';
import { formatCalendarDate } from '../../utils/dates';
import { librarySearchWith } from '../../utils/libraryFilter';
import { modeLabel } from '../../utils/vocab';
import Section from './Section';

const ENRICHMENT_PROVIDER_LABELS = { steam: 'Steam', igdb: 'IGDB', rawg: 'RAWG' };

/**
 * How `Game.enrichment` reads as one line under Details
 * (DOCS/METADATA_ENRICHMENT.md "UI"). `link: true` means the line offers
 * "Find metadata…" straight from the status — ambiguous or no-match only.
 * Null enrichment (the worker hasn't reached this game at all) renders
 * nothing, rather than claiming a "no match" that was never attempted.
 */
export function enrichmentLine(enrichment) {
  if (!enrichment?.status) return null;
  switch (enrichment.status) {
    case 'matched': {
      const provider = ENRICHMENT_PROVIDER_LABELS[enrichment.provider] || enrichment.provider;
      const title = enrichment.matchedTitle ? ` · matched as “${enrichment.matchedTitle}”` : '';
      const manual = enrichment.manual ? ' · chosen by you' : '';
      return { text: `Details from ${provider}${title}${manual}`, link: false };
    }
    case 'no-match':
      return { text: 'No metadata match yet', link: true };
    case 'ambiguous':
      return { text: 'Several possible matches — pick one', link: true };
    case 'pending':
      return { text: 'Looking up details…', link: false };
    case 'unlinked':
      return { text: 'Metadata unlinked', link: false };
    case 'error':
      return { text: "Couldn't look up details", link: false };
    default:
      return null;
  }
}

function Fact({ label, children }) {
  if (!children || (Array.isArray(children) && !children.length)) return null;
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: '112px minmax(0, 1fr)', alignItems: 'baseline', gap: 1.5, py: 0.75, borderBottom: 1, borderColor: 'divider' }}>
      <Typography component="dt" sx={{ fontSize: '0.8125rem', color: 'text.secondary' }}>{label}</Typography>
      <Typography component="dd" sx={{ m: 0, fontSize: '0.875rem', overflowWrap: 'anywhere' }}>{children}</Typography>
    </Box>
  );
}

/**
 * The game's tags as one list: the person's own (and Playnite's) first, then
 * the enrichment-derived ones not already there, marked `auto`
 * (DOCS/TAGS_AND_FILTERS.md §A3 — one Tags facet over tags ∪ autoTags).
 */
export function tagList(game) {
  const own = game.tags || [];
  const seen = new Set(own.map((t) => t.toLowerCase()));
  const auto = (game.autoTags || []).filter((t) => !seen.has(t.toLowerCase()));
  return [...own.map((value) => ({ value, auto: false })), ...auto.map((value) => ({ value, auto: true }))];
}

/**
 * A genre or tag as a link: tapping it opens the library with that value
 * ADDED to the filter the sheet was opened from (the detail URL carries it).
 * The painted pill is 28px; the link around it is the 44px target on a
 * phone (36px at md+, where a pointer is precise and the rows sit tighter).
 */
function FilterChip({ filterKey, value, auto = false }) {
  const location = useLocation();
  const to = libraryPath(librarySearchWith(location.search, filterKey, value));
  const noun = filterKey === 'genres' ? 'genre' : 'tag';
  const chip = (
    <ButtonBase
      component={RouterLink}
      to={to}
      aria-label={`Show games with the ${noun} ${value}${auto ? ' (added automatically)' : ''}`}
      data-auto-tag={auto ? 'true' : undefined}
      sx={{
        minHeight: { xs: 44, md: 36 },
        // A short tag ("Idle", "2D") must still be a full target, not just a tall one.
        minWidth: { xs: 44, md: 36 },
        borderRadius: '999px',
        '&.Mui-focusVisible > span': { outline: 2, outlineStyle: 'solid', outlineColor: 'primary.main', outlineOffset: 1 },
        '&:hover > span': { borderColor: 'primary.main', color: 'text.primary' },
      }}
    >
      <Box
        component="span"
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 0.5,
          height: 28,
          px: 1.25,
          borderRadius: '999px',
          border: 1,
          fontSize: '0.8125rem',
          fontWeight: auto ? 400 : 500,
          transition: 'border-color 120ms, color 120ms',
          ...(auto
            ? { borderStyle: 'dashed', borderColor: 'border', color: 'text.secondary', bgcolor: 'transparent' }
            : { borderColor: 'border', color: 'text.primary', bgcolor: (t) => alpha(t.palette.text.primary, 0.04) }),
        }}
      >
        {value}
      </Box>
    </ButtonBase>
  );
  return auto ? (
    <Tooltip title="Added automatically from game metadata" describeChild>
      {chip}
    </Tooltip>
  ) : (
    chip
  );
}

function ChipList({ filterKey, items }) {
  return (
    <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'flex', flexWrap: 'wrap', columnGap: 0.75, my: { xs: -1, md: -0.5 } }}>
      {items.map((it) => (
        <Box component="li" key={it.value}>
          <FilterChip filterKey={filterKey} value={it.value} auto={it.auto} />
        </Box>
      ))}
    </Box>
  );
}

export function externalLinks(game) {
  const ids = game.externalIds || {};
  const links = [];
  if (ids.steamAppId) links.push({ id: 'steam', label: 'Steam store page', href: `https://store.steampowered.com/app/${encodeURIComponent(ids.steamAppId)}/` });
  if (ids.gog) links.push({ id: 'gog', label: 'GOG', href: `https://www.gog.com/en/game/${encodeURIComponent(ids.gog)}` });
  if (ids.igdb) links.push({ id: 'igdb', label: 'IGDB', href: `https://www.igdb.com/search?type=1&q=${encodeURIComponent(game.title)}` });
  return links;
}

export default function DetailsSection({ game, onFindMetadata }) {
  const [expanded, setExpanded] = useState(false);
  const ttb = game.timeToBeat || {};
  const ttbText = [ttb.main && `${ttb.main} h story`, ttb.extra && `${ttb.extra} h + extras`, ttb.complete && `${ttb.complete} h 100%`].filter(Boolean).join(' · ');
  const description = (game.description || '').trim();
  const long = description.length > 420;
  const links = externalLinks(game);
  const provenance = enrichmentLine(game.enrichment);
  const tags = tagList(game);

  return (
    <Section title="Details" id="details">
      {provenance ? (
        <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', mb: 1.5 }} data-testid="metadata-provenance">
          {provenance.text}
          {provenance.link && onFindMetadata ? (
            <>
              {' — '}
              <Box
                component="button"
                type="button"
                onClick={onFindMetadata}
                sx={{ all: 'unset', cursor: 'pointer', color: 'primary.main', fontWeight: 600, fontSize: 'inherit', minHeight: 24 }}
              >
                Find metadata…
              </Box>
            </>
          ) : null}
        </Typography>
      ) : null}
      {description ? (
        <Box sx={{ mb: 1.5 }}>
          <Typography
            sx={{
              fontSize: '0.875rem', lineHeight: 1.65, color: 'text.primary', whiteSpace: 'pre-line',
              ...(long && !expanded ? { display: '-webkit-box', WebkitLineClamp: 6, WebkitBoxOrient: 'vertical', overflow: 'hidden' } : null),
            }}
          >
            {description}
          </Typography>
          {long ? (
            <Button onClick={() => setExpanded((v) => !v)} sx={{ px: 0, minWidth: 44, color: 'text.secondary' }}>
              {expanded ? 'Show less' : 'Read more'}
            </Button>
          ) : null}
        </Box>
      ) : null}
      <Box component="dl" sx={{ m: 0 }}>
        <Fact label="Released">{game.releaseDate ? formatCalendarDate(game.releaseDate) : null}</Fact>
        <Fact label="Genres">
          {(game.genres || []).length ? <ChipList filterKey="genres" items={game.genres.map((value) => ({ value }))} /> : null}
        </Fact>
        <Fact label="Modes">{(game.modes || []).map(modeLabel).join(', ')}</Fact>
        <Fact label="Couch players">{game.maxLocalPlayers ? `Up to ${game.maxLocalPlayers}` : null}</Fact>
        <Fact label="Time to beat">{ttbText}</Fact>
        <Fact label="Series">{game.series?.name ? `${game.series.name}${game.series.index ? ` #${game.series.index}` : ''}` : null}</Fact>
        <Fact label="Tags">{tags.length ? <ChipList filterKey="tags" items={tags} /> : null}</Fact>
        <Fact label="Steam app">{game.externalIds?.steamAppId}</Fact>
      </Box>
      {links.length ? (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1.5 }}>
          {links.map((l) => (
            <Button
              key={l.id}
              component={Link}
              href={l.href}
              target="_blank"
              rel="noopener noreferrer"
              variant="outlined"
              endIcon={<ExternalIcon sx={{ fontSize: 16 }} />}
              sx={{ color: 'text.primary', textDecoration: 'none' }}
            >
              {l.label}
            </Button>
          ))}
        </Box>
      ) : null}
      {!description && !(game.genres || []).length && !links.length ? (
        <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary', mt: 1 }}>
          No details yet. More → Edit details fills them in.
        </Typography>
      ) : null}
    </Section>
  );
}
