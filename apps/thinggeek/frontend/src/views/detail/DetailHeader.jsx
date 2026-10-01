/**
 * Who this thing is: name, type (icon + name), WHERE it is — the unit-tag
 * breadcrumb House › Garage › Van, each crumb a link to that thing's page, with "Move
 * to…" beside it — and its tags. When a place's page leads with a mural,
 * the mural carries the name (`showName={false}`).
 *
 * A crumb in the Trash stays in the path (DOCS/THINGGEEK_PLAN.md: trashing
 * the Van leaves the jumper cables where they are) but is not a link, and the
 * line under it says so: restore the Van, or move the cables out.
 */
import React from 'react';
import { Box, Button, Typography } from '@mui/material';
import { DriveFileMoveOutlined as MoveIcon } from '@mui/icons-material';
import TagChips from '../../components/TagChips';
import LabelCrumbs from '../../components/LabelCrumbs';
import TypeIcon from '../../components/TypeIcon';
import { DISPLAY_FONT } from '../../theme/theme';
import { insideTrash, pathOf } from '../../utils/where';

export function Breadcrumb({ thing }) {
  const path = pathOf(thing);
  if (!path.length) {
    return (
      <Typography component="span" data-testid="where-breadcrumb" sx={{ fontSize: '0.875rem', color: 'text.secondary', minHeight: 44, display: 'inline-flex', alignItems: 'center' }}>
        Not anywhere yet
      </Typography>
    );
  }
  return <LabelCrumbs path={path} />;
}

export default function DetailHeader({ thing, onMove, showName = true }) {
  const trashed = insideTrash(thing);
  return (
    <Box sx={{ px: { xs: 2, md: 0 }, pt: { xs: 1.5, md: 0 }, pb: 1 }}>
      {showName ? (
        <Typography
          variant="h1"
          component="h1"
          id="thing-name"
          data-testid="thing-name"
          sx={{ fontFamily: DISPLAY_FONT, fontSize: { xs: '1.875rem', md: '2.375rem' }, fontWeight: 700, lineHeight: 1.08, overflowWrap: 'anywhere' }}
        >
          {thing.name}
        </Typography>
      ) : null}
      {thing.type ? (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 0.5, color: 'text.secondary', fontSize: '0.9375rem', fontWeight: 600 }}>
          <TypeIcon name={thing.type.icon} sx={{ fontSize: 18, color: 'text.secondary' }} />
          {thing.type.name}
        </Box>
      ) : null}
      <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: 1, rowGap: 0, mt: 0.5 }}>
        <Breadcrumb thing={thing} />
        {onMove ? (
          <Button size="small" startIcon={<MoveIcon />} onClick={onMove} data-testid="move-to" sx={{ color: 'text.primary', fontWeight: 600, minHeight: 44 }}>
            Move to…
          </Button>
        ) : null}
      </Box>
      {trashed ? (
        <Typography data-testid="inside-trash" sx={{ fontSize: '0.8125rem', color: 'text.secondary', mt: 0.25 }}>
          It's inside something in the Trash. Restore that, or move this somewhere else.
        </Typography>
      ) : null}
      {thing.tags?.length ? <TagChips tags={thing.tags} linked sx={{ mt: 0.75 }} /> : null}
    </Box>
  );
}
