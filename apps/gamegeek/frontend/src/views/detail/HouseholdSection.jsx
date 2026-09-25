/** Who else in the household has this game on a shelf (never another household). */
import React from 'react';
import { Avatar, Box, Typography } from '@mui/material';
import { Star as StarIcon } from '@mui/icons-material';
import ShelfTag from '../../components/ShelfTag';
import { formatHours } from '../../utils/dates';
import { shelfLabel } from '../../utils/vocab';
import Section from './Section';

export default function HouseholdSection({ entries = [] }) {
  return (
    <Section title="Household" id="household">
      {entries.length === 0 ? (
        <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary', lineHeight: 1.6 }}>
          Nobody else in the household has this on a shelf yet.
        </Typography>
      ) : (
        <Box component="ul" sx={{ m: 0, p: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
          {entries.map((e) => {
            const name = e.displayName || 'Someone';
            return (
              <Box component="li" key={e.userId} sx={{ listStyle: 'none', display: 'flex', alignItems: 'center', gap: 1.25, minHeight: 40 }}>
                <Avatar sx={{ width: 32, height: 32, fontSize: '0.8125rem', bgcolor: 'background.raised', color: 'text.primary' }}>
                  {name[0]?.toUpperCase()}
                </Avatar>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ fontSize: '0.875rem', fontWeight: 600 }}>{name}</Typography>
                  <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                    {e.shelf ? <ShelfTag shelf={e.shelf} label={shelfLabel(e.shelf)} /> : null}
                    {formatHours(e.hoursPlayed) ? (
                      <Typography component="span" sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>{formatHours(e.hoursPlayed)}</Typography>
                    ) : null}
                  </Box>
                </Box>
                {e.rating ? (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }} aria-label={`${name} rated it ${e.rating} of 5`} role="img">
                    <StarIcon sx={{ fontSize: 16, color: 'star' }} />
                    <Typography component="span" sx={{ fontSize: '0.8125rem', fontWeight: 600 }}>{e.rating}</Typography>
                  </Box>
                ) : null}
              </Box>
            );
          })}
        </Box>
      )}
    </Section>
  );
}
