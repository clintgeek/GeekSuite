/**
 * Who this thing is: name, type (icon + name), WHERE it is — the breadcrumb
 * House › Garage › Van, each crumb a link to that thing's page, with a
 * "Move to…" beside it — and its tags.
 *
 * A crumb in the Trash stays in the path (DOCS/THINGGEEK_PLAN.md: trashing
 * the Van leaves the jumper cables where they are) but is not a link, and the
 * line under it says so: restore the Van, or move the cables out.
 */
import React from 'react';
import { Box, Button, Link, Typography } from '@mui/material';
import { DriveFileMoveOutlined as MoveIcon, PlaceOutlined as PlaceIcon } from '@mui/icons-material';
import { Link as RouterLink, useLocation } from 'react-router-dom';
import TagChips from '../../components/TagChips';
import TypeIcon from '../../components/TypeIcon';
import { thingPath } from '../../components/navConfig';
import { DISPLAY_FONT } from '../../theme/theme';
import { insideTrash, pathOf } from '../../utils/where';

export function Breadcrumb({ thing }) {
  const location = useLocation();
  const path = pathOf(thing);
  if (!path.length) return <span data-testid="where-breadcrumb">Not anywhere yet</span>;
  return (
    <Box component="nav" aria-label="Where it is" data-testid="where-breadcrumb" sx={{ minWidth: 0 }}>
      <Box component="ol" sx={{ listStyle: 'none', m: 0, p: 0, display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 0.5 }}>
        {path.map((p, i) => (
          <Box component="li" key={p.id} sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, minWidth: 0 }}>
            {i > 0 ? (
              <Box component="span" aria-hidden="true" sx={{ color: 'text.secondary' }}>
                ›
              </Box>
            ) : null}
            {p.inTrash ? (
              <Box component="span" sx={{ color: 'text.secondary', fontStyle: 'italic', minHeight: 44, display: 'inline-flex', alignItems: 'center' }}>
                {p.name} (in the Trash)
              </Box>
            ) : (
              <Link
                component={RouterLink}
                to={thingPath(p.id, location.search)}
                underline="hover"
                aria-current={i === path.length - 1 ? 'location' : undefined}
                sx={{ color: 'text.primary', fontWeight: i === path.length - 1 ? 600 : 500, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: 44, minWidth: 44 }}
              >
                {p.name}
              </Link>
            )}
          </Box>
        ))}
      </Box>
    </Box>
  );
}

export default function DetailHeader({ thing, onMove }) {
  const trashed = insideTrash(thing);
  return (
    <Box sx={{ px: { xs: 2, md: 3 }, pt: 2, pb: 1.75 }}>
      <Typography
        variant="h1"
        component="h2"
        data-testid="thing-name"
        sx={{ fontFamily: DISPLAY_FONT, fontSize: { xs: '1.625rem', md: '2rem' }, lineHeight: 1.12, overflowWrap: 'anywhere' }}
      >
        {thing.name}
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: 2, rowGap: 0.5, mt: 0.75, color: 'text.secondary', fontSize: '0.875rem' }}>
        {thing.type ? (
          <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, minHeight: 44 }}>
            <TypeIcon name={thing.type.icon} sx={{ fontSize: 18, color: 'primary.main' }} />
            {thing.type.name}
          </Box>
        ) : null}
        <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, minWidth: 0 }}>
          <PlaceIcon aria-hidden="true" sx={{ fontSize: 18, flexShrink: 0 }} />
          <Breadcrumb thing={thing} />
        </Box>
        {onMove ? (
          <Button size="small" startIcon={<MoveIcon />} onClick={onMove} data-testid="move-to" sx={{ color: 'text.primary', fontWeight: 600, minHeight: 44 }}>
            Move to…
          </Button>
        ) : null}
      </Box>
      {trashed ? (
        <Typography data-testid="inside-trash" sx={{ fontSize: '0.8125rem', color: 'text.secondary', mt: 0.5 }}>
          It's inside something in the Trash. Restore that, or move this somewhere else.
        </Typography>
      ) : null}
      {thing.tags?.length ? <TagChips tags={thing.tags} linked sx={{ mt: 1 }} /> : null}
    </Box>
  );
}
