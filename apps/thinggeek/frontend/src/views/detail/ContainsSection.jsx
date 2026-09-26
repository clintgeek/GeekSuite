/**
 * Contains — what is directly inside this thing (a location's shelves, the
 * Van's jumper cables), each a link to its own page, and "Add here", which
 * opens the add flow with this thing already chosen as where it is.
 *
 * Shown for locations and containers always (an empty safe says so), and for
 * an item only once something has been moved into it.
 */
import React from 'react';
import { Box, Button, ButtonBase, Typography } from '@mui/material';
import { Add as AddIcon } from '@mui/icons-material';
import { Link as RouterLink, useLocation, useNavigate } from 'react-router-dom';
import Section from './Section';
import ThingPhoto from '../../components/ThingPhoto';
import { coverSrc } from '../../components/thingDisplay';
import { thingPath } from '../../components/navConfig';

export default function ContainsSection({ thing }) {
  const location = useLocation();
  const navigate = useNavigate();
  const contents = thing.contents ?? [];
  const addHere = () => navigate(`/add${location.search}`, { state: { parentId: thing.id } });

  return (
    <Section
      id="contains"
      title={contents.length ? `Contains · ${contents.length}` : 'Contains'}
      action={
        <Button size="small" startIcon={<AddIcon />} onClick={addHere} data-testid="add-here" sx={{ color: 'text.primary', fontWeight: 600 }}>
          Add here
        </Button>
      }
    >
      {contents.length ? (
        <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 0.5 }} data-testid="contains-list">
          {contents.map((t) => (
            <Box component="li" key={t.id}>
              <ButtonBase
                component={RouterLink}
                to={thingPath(t.id, location.search)}
                sx={{ width: '100%', display: 'flex', alignItems: 'center', gap: 1.25, minHeight: 48, px: 0.5, py: 0.5, borderRadius: 2, justifyContent: 'flex-start', textAlign: 'left', '&:hover': { bgcolor: 'action.hover' } }}
              >
                <ThingPhoto src={coverSrc(t)} icon={t.type?.icon} variant="thumb" radius={6} sx={{ width: 40, height: 40, flexShrink: 0 }} />
                <Box sx={{ minWidth: 0 }}>
                  <Typography noWrap sx={{ fontSize: '0.9375rem', fontWeight: 600, color: 'text.primary' }}>
                    {t.name}
                  </Typography>
                  {t.type?.name ? (
                    <Typography noWrap sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                      {t.type.name}
                    </Typography>
                  ) : null}
                </Box>
              </ButtonBase>
            </Box>
          ))}
        </Box>
      ) : (
        <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>
          Nothing inside yet. Add what's kept here — or open something else and Move it here.
        </Typography>
      )}
    </Section>
  );
}
