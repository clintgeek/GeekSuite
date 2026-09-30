/**
 * Where something is, as a row of Dymo tape: HOUSE › GARAGE › VAN (a
 * container on blue refill, a location on black). Each
 * crumb is a link (44px tall target around the tape) — to that thing's page
 * by default, or wherever `hrefFor(crumb)` says (the Where drill-down links
 * each level back to itself).
 *
 * A crumb in the Trash stays in the path (DOCS/THINGGEEK_PLAN.md) but is not
 * a link, and says so in words beside the tape.
 */
import React from 'react';
import { Box } from '@mui/material';
import { Link as RouterLink, useLocation } from 'react-router-dom';
import DymoTape from './DymoTape';
import { toneForKind } from '../theme/theme';
import { thingPath } from './navConfig';

export default function TapeCrumbs({ path = [], hrefFor, label = 'Where it is', size = 'md', lead = null, currentLinked = true, testId = 'where-breadcrumb', sx }) {
  const location = useLocation();
  const to = hrefFor ?? ((p) => thingPath(p.id, location.search));
  return (
    <Box component="nav" aria-label={label} data-testid={testId} sx={{ minWidth: 0, ...sx }}>
      <Box component="ol" sx={{ listStyle: 'none', m: 0, p: 0, display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 0.75, rowGap: 0 }}>
        {lead ? (
          <Box component="li" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
            {lead}
            {path.length ? (
              <Box component="span" aria-hidden="true" sx={{ color: 'text.secondary', fontWeight: 700 }}>
                ›
              </Box>
            ) : null}
          </Box>
        ) : null}
        {path.map((p, i) => {
          const last = i === path.length - 1;
          return (
            <Box component="li" key={p.id} sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, minWidth: 0, maxWidth: '100%' }}>
              {p.inTrash ? (
                <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, minHeight: 44, minWidth: 0 }}>
                  <DymoTape size={size} tone={toneForKind(p.kind)} sx={{ opacity: 0.8 }}>{p.name}</DymoTape>
                  <Box component="span" sx={{ color: 'text.secondary', fontSize: '0.8125rem', fontStyle: 'italic', whiteSpace: 'nowrap' }}>
                    (in the Trash)
                  </Box>
                </Box>
              ) : last && !currentLinked ? (
                <Box component="span" aria-current="location" sx={{ display: 'inline-flex', alignItems: 'center', minHeight: 44, minWidth: 0, maxWidth: '100%' }}>
                  <DymoTape size={size} tone={toneForKind(p.kind)}>{p.name}</DymoTape>
                </Box>
              ) : (
                <Box
                  component={RouterLink}
                  to={to(p)}
                  aria-current={last ? 'location' : undefined}
                  sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minHeight: 44,
                    minWidth: 44,
                    maxWidth: '100%',
                    textDecoration: 'none',
                    borderRadius: '4px',
                    '@media (hover: hover)': { '&:hover': { boxShadow: (t) => `inset 0 -2px 0 ${t.palette.text.secondary}` } },
                    '&:focus-visible': { outline: 2, outlineStyle: 'solid', outlineColor: 'text.primary', outlineOffset: 1 },
                  }}
                >
                  <DymoTape size={size} tone={toneForKind(p.kind)}>{p.name}</DymoTape>
                </Box>
              )}
              {!last ? (
                <Box component="span" aria-hidden="true" sx={{ color: 'text.secondary', fontWeight: 700 }}>
                  ›
                </Box>
              ) : null}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
