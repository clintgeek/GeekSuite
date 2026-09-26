/**
 * Relationships as sentences, grouped by kind and direction:
 *   Equipped with: Garmin Striker 4 · Minn Kota Endura
 *   Equipped on:   Wendy
 * Each thing is a link to its own page (keeping the library's query string).
 */
import React from 'react';
import { Box, Button, ButtonBase, Typography } from '@mui/material';
import { Link as RouterLink, useLocation } from 'react-router-dom';
import Section from './Section';
import ThingPhoto from '../../components/ThingPhoto';
import { thingPath } from '../../components/navConfig';
import { groupRelationships } from '../../utils/relationships';

export default function RelationshipsSection({ relationships = [], onEdit }) {
  const location = useLocation();
  const groups = groupRelationships(relationships);
  return (
    <Section
      id="relationships"
      title="Relationships"
      action={
        <Button size="small" onClick={onEdit} sx={{ color: 'text.primary', fontWeight: 600 }}>
          {groups.length ? 'Edit' : 'Link a thing'}
        </Button>
      }
    >
      {groups.length ? (
        <Box sx={{ display: 'grid', gap: 1.5 }}>
          {groups.map((g) => (
            <Box key={g.key} data-testid="relationship-group">
              <Typography component="h4" sx={{ fontSize: '0.8125rem', fontWeight: 700, color: 'text.secondary', mb: 0.5 }}>
                {g.phrase}:
              </Typography>
              <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                {g.things.map((t) => (
                  <Box component="li" key={t.id}>
                    <ButtonBase
                      component={RouterLink}
                      to={thingPath(t.id, location.search)}
                      sx={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 1,
                        minHeight: 44,
                        pl: 0.5,
                        pr: 1.5,
                        borderRadius: '10px',
                        border: 1,
                        borderColor: 'border',
                        color: 'text.primary',
                        fontSize: '0.875rem',
                        fontWeight: 600,
                        '&:hover': { borderColor: 'primary.main', bgcolor: 'action.hover' },
                      }}
                    >
                      <Box sx={{ width: 34, flexShrink: 0 }}>
                        <ThingPhoto src={t.coverThumbUrl} icon={t.type?.icon} variant="thumb" radius={6} />
                      </Box>
                      {t.name}
                    </ButtonBase>
                  </Box>
                ))}
              </Box>
            </Box>
          ))}
        </Box>
      ) : (
        <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>
          What's attached, what it's part of, what it's stored with — “Wendy is equipped with the fish finder.”
        </Typography>
      )}
    </Section>
  );
}
