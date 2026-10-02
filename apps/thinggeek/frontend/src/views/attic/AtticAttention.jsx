/**
 * The Attic's lines on two pages that work WITHOUT unlocking:
 *
 *   AtticAttention  on Needs attention: documents inside their type's warning
 *                   window (a passport 9 months out, a license 60 days…), as
 *                   person + document type + date — no numbers, no images,
 *                   and the page says so.
 *   ThingAttic      on a thing's page: "2 documents in the Attic" while
 *                   locked; their titles, linked, once unlocked.
 *
 * Both use their own query, so a gateway that doesn't know the Attic yet
 * costs this section, never the page around it.
 */
import React, { useEffect } from 'react';
import { Box, Button, ButtonBase, Typography } from '@mui/material';
import { ChevronRight as GoIcon, LockOutlined as LockIcon } from '@mui/icons-material';
import { useQuery } from '@apollo/client';
import { Link as RouterLink } from 'react-router-dom';
import SectionHeading from '../../components/SectionHeading';
import { GET_ATTIC_EXPIRING, GET_THING_ATTIC } from '../../graphql/attic';
import { useVault } from '../../hooks/useVault';
import { formatCalendarDate } from '../../utils/dates';
import Section from '../detail/Section';
import { AtticDocRow, atticDocPath, expiryColor, panelSx } from './AtticParts';
import { Padlock } from './AtticDoor';
import { expiryPhrase } from './atticIcons';

export function AtticAttention() {
  const { data, error } = useQuery(GET_ATTIC_EXPIRING, { fetchPolicy: 'cache-and-network' });
  const rows = data?.atticExpiring ?? [];
  if (error || !rows.length) return null;
  return (
    <Box component="section" aria-labelledby="attic-attention-heading" data-testid="attic-attention" sx={{ ...panelSx, mb: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 0.5, mb: 0.5, minHeight: 32 }}>
        <SectionHeading id="attic-attention-heading" tone={rows.some((r) => r.status === 'expired') ? 'overdue' : 'soon'} count={rows.length}>
          The Attic
        </SectionHeading>
      </Box>
      <Typography sx={{ px: 0.5, fontSize: '0.8125rem', color: 'text.secondary', mb: 0.5, display: 'flex', alignItems: 'center', gap: 0.75 }}>
        <LockIcon aria-hidden="true" sx={{ fontSize: 16 }} />
        Shown without unlocking: who, which document and the date. Never numbers or images.
      </Typography>
      <Box component="ul" sx={{ m: 0, p: 0 }}>
        {rows.map((r) => (
          <Box component="li" key={r.documentId} sx={{ listStyle: 'none', borderBottom: 1, borderColor: 'divider', '&:last-of-type': { borderBottom: 0 } }}>
            <ButtonBase
              component={RouterLink}
              to={atticDocPath(r.documentId)}
              data-testid="attic-attention-row"
              data-status={r.status}
              sx={{ width: '100%', minHeight: 56, display: 'flex', alignItems: 'center', gap: 1.5, px: 0.5, py: 1, justifyContent: 'flex-start', textAlign: 'left', '&:hover': { bgcolor: 'action.hover' } }}
            >
              <Padlock size={26} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography noWrap sx={{ fontWeight: 700, fontSize: '0.9375rem' }}>
                  {[r.people.join(' & '), r.typeName].filter(Boolean).join(' · ')}
                </Typography>
                <Typography noWrap sx={{ fontSize: '0.8125rem', color: 'text.secondary' }}>
                  {r.expiryLabel} {formatCalendarDate(r.expires)}
                </Typography>
              </Box>
              <Typography component="span" sx={{ fontSize: '0.8125rem', fontWeight: 800, color: expiryColor(r.status), flexShrink: 0, textAlign: 'right', maxWidth: 140 }}>
                {expiryPhrase(r.expiryLabel, r.daysUntil).replace(new RegExp(`^${r.expiryLabel} `, 'i'), '')}
              </Typography>
              <GoIcon aria-hidden="true" sx={{ color: 'text.secondary', flexShrink: 0 }} />
            </ButtonBase>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

export function ThingAttic({ thingId }) {
  const vault = useVault({ optional: true });
  const { data, error, refetch } = useQuery(GET_THING_ATTIC, { variables: { id: thingId }, fetchPolicy: 'cache-and-network', skip: !thingId });
  // Re-ask when the lock changes (the count never needs the vault; the titles do).
  const unlocked = vault.unlocked;
  useEffect(() => {
    if (thingId) refetch().catch(() => {});
  }, [unlocked, thingId, refetch]);
  const attic = data?.thing?.attic;
  if (error || !attic || !attic.count) return null;
  const n = attic.count;
  return (
    <Section id="attic" title="In the Attic">
      {attic.locked || !vault.unlocked ? (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }} data-testid="thing-attic-locked">
          <Padlock size={28} />
          <Typography sx={{ flex: 1, minWidth: 180, fontSize: '0.9375rem', fontWeight: 600 }}>
            {n} document{n === 1 ? '' : 's'} in the Attic — unlock to view.
          </Typography>
          <Button component={RouterLink} to="/attic" variant="outlined" sx={{ minHeight: 44, color: 'text.primary', borderColor: 'border' }}>
            Open the Attic
          </Button>
        </Box>
      ) : (
        <Box component="ul" sx={{ m: 0, p: 0 }} data-testid="thing-attic-docs">
          {attic.documents.map((d) => (
            <AtticDocRow key={d.id} doc={d} />
          ))}
        </Box>
      )}
    </Section>
  );
}
