/** The household's copies of this game — where we can actually play it. */
import React from 'react';
import { Box, Button, Typography } from '@mui/material';
import PlatformGlyph from '../../components/PlatformGlyph';
import { formatHours } from '../../utils/dates';
import { formatLabel, platformLabel, storefrontLabel } from '../../utils/vocab';
import Section from './Section';

export default function CopiesSection({ copies = [], onEdit }) {
  return (
    <Section
      title="Copies"
      id="copies"
      action={
        <Button onClick={onEdit} sx={{ color: 'text.primary', minHeight: 44 }}>
          {copies.length ? 'Edit' : 'Add'}
        </Button>
      }
    >
      {copies.length === 0 ? (
        <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary', lineHeight: 1.6 }}>
          Not owned yet — or not recorded. Add the platform and store it lives on (Steam, GOG, Epic, Amazon, Luna, a cartridge on the shelf…).
        </Typography>
      ) : (
        <Box component="ul" sx={{ m: 0, p: 0, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
          {copies.map((c) => (
            <Box component="li" key={c.id} sx={{ listStyle: 'none', display: 'flex', alignItems: 'center', gap: 1.25, minHeight: 36 }}>
              <Box sx={{ width: 32, height: 32, borderRadius: '8px', display: 'grid', placeItems: 'center', bgcolor: 'background.raised', color: 'text.secondary', flexShrink: 0 }}>
                <PlatformGlyph platform={c.platform} sx={{ fontSize: 18 }} />
              </Box>
              <Box sx={{ minWidth: 0 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.625 }}>
                  <Typography sx={{ fontSize: '0.875rem', fontWeight: 600 }}>{platformLabel(c.platform)}</Typography>
                  {c.fromPlaynite ? (
                    <Box
                      component="span"
                      sx={{
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        letterSpacing: '0.04em',
                        textTransform: 'uppercase',
                        color: 'text.secondary',
                        bgcolor: 'background.raised',
                        border: 1,
                        borderColor: 'divider',
                        borderRadius: '4px',
                        px: 0.5,
                        py: 0.125,
                        lineHeight: 1.4,
                      }}
                    >
                      Playnite
                    </Box>
                  ) : null}
                  {c.fromPlaynite && c.installed === true ? (
                    <Typography component="span" sx={{ fontSize: '0.75rem', fontWeight: 600, color: 'text.secondary' }}>
                      · Installed
                    </Typography>
                  ) : null}
                </Box>
                <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                  {[
                    c.format && formatLabel(c.format),
                    c.storefront && storefrontLabel(c.storefront),
                    formatHours(c.playtimeHours) || null,
                  ]
                    .filter(Boolean)
                    .join(' · ') || 'Format not recorded'}
                </Typography>
              </Box>
            </Box>
          ))}
        </Box>
      )}
    </Section>
  );
}
