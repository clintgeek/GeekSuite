/** Catalogue facts: genres, modes, time to beat, the description, and where else it lives. */
import React, { useState } from 'react';
import { Box, Button, Link, Typography } from '@mui/material';
import { OpenInNew as ExternalIcon } from '@mui/icons-material';
import { formatCalendarDate } from '../../utils/dates';
import { modeLabel } from '../../utils/vocab';
import Section from './Section';

function Fact({ label, children }) {
  if (!children || (Array.isArray(children) && !children.length)) return null;
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: '112px minmax(0, 1fr)', gap: 1.5, py: 0.75, borderBottom: 1, borderColor: 'divider' }}>
      <Typography component="dt" sx={{ fontSize: '0.8125rem', color: 'text.secondary' }}>{label}</Typography>
      <Typography component="dd" sx={{ m: 0, fontSize: '0.875rem', overflowWrap: 'anywhere' }}>{children}</Typography>
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

export default function DetailsSection({ game }) {
  const [expanded, setExpanded] = useState(false);
  const ttb = game.timeToBeat || {};
  const ttbText = [ttb.main && `${ttb.main} h story`, ttb.extra && `${ttb.extra} h + extras`, ttb.complete && `${ttb.complete} h 100%`].filter(Boolean).join(' · ');
  const description = (game.description || '').trim();
  const long = description.length > 420;
  const links = externalLinks(game);

  return (
    <Section title="Details" id="details">
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
        <Fact label="Genres">{(game.genres || []).join(', ')}</Fact>
        <Fact label="Modes">{(game.modes || []).map(modeLabel).join(', ')}</Fact>
        <Fact label="Couch players">{game.maxLocalPlayers ? `Up to ${game.maxLocalPlayers}` : null}</Fact>
        <Fact label="Time to beat">{ttbText}</Fact>
        <Fact label="Series">{game.series?.name ? `${game.series.name}${game.series.index ? ` #${game.series.index}` : ''}` : null}</Fact>
        <Fact label="Tags">{(game.tags || []).join(', ')}</Fact>
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
