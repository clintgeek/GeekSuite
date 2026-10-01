/**
 * Where something is, as a row of unit tags: House › Garage › Van. Each
 * crumb is a link (a 44px target around the tag) — to that
 * thing's page by default, or wherever `hrefFor(crumb)` says (the Where
 * drill-down links each level back to itself).
 *
 * A crumb in the Trash stays in the path (DOCS/THINGGEEK_PLAN.md) but is not
 * a link, and says so in words beside the label.
 */
import React from 'react';
import { Box } from '@mui/material';
import { Link as RouterLink, useLocation } from 'react-router-dom';
import UnitTag from './UnitTag';
import { thingPath } from './navConfig';

const Sep = () => (
  <Box component="span" aria-hidden="true" sx={{ color: 'text.secondary', fontWeight: 800, fontSize: '1rem' }}>
    ›
  </Box>
);

export default function LabelCrumbs({ path = [], hrefFor, label = 'Where it is', size = 'sm', lead = null, currentLinked = true, testId = 'where-breadcrumb', sx }) {
  const location = useLocation();
  const to = hrefFor ?? ((p) => thingPath(p.id, location.search));
  const tag = (p) => (
    <UnitTag kind={p.kind} size={size} variant="inline">
      {p.name}
    </UnitTag>
  );
  return (
    <Box component="nav" aria-label={label} data-testid={testId} sx={{ minWidth: 0, ...sx }}>
      <Box component="ol" sx={{ listStyle: 'none', m: 0, p: 0, display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 0.75, rowGap: 0 }}>
        {lead ? (
          <Box component="li" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
            {lead}
            {path.length ? <Sep /> : null}
          </Box>
        ) : null}
        {path.map((p, i) => {
          const last = i === path.length - 1;
          return (
            <Box component="li" key={p.id} sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, minWidth: 0, maxWidth: '100%' }}>
              {p.inTrash ? (
                <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, minHeight: 44, minWidth: 0 }}>
                  <Box component="span" sx={{ opacity: 0.75, display: 'inline-flex', minWidth: 0 }}>{tag(p)}</Box>
                  <Box component="span" sx={{ color: 'text.secondary', fontSize: '0.8125rem', fontStyle: 'italic', whiteSpace: 'nowrap' }}>
                    (in the Trash)
                  </Box>
                </Box>
              ) : last && !currentLinked ? (
                <Box component="span" aria-current="location" sx={{ display: 'inline-flex', alignItems: 'center', minHeight: 44, minWidth: 0, maxWidth: '100%' }}>
                  {tag(p)}
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
                    '& [data-testid="unit-tag"]': { transition: 'transform 120ms ease-out' },
                    '@media (hover: hover)': { '&:hover [data-testid="unit-tag"]': { transform: 'translateY(-1px) rotate(-0.6deg)' } },
                    '&:focus-visible': { outline: 2, outlineStyle: 'solid', outlineColor: 'text.primary', outlineOffset: 1 },
                  }}
                >
                  {tag(p)}
                </Box>
              )}
              {!last ? <Sep /> : null}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
